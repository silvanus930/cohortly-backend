import {
  BadRequestException,
  GoneException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { type Paginated, paginateRepository } from '../common/pagination/pagination';
import { appConfig } from '../config/configuration';
import { CoursesService } from '../courses/courses.service';
import { type Enrollment } from '../enrollments/entities/enrollment.entity';
import { MailService } from '../mail/mail.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageService } from '../storage/storage.service';
import { type User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import {
  CERTIFICATE_TEMPLATE_VERSION,
  generateCertificateCode,
  renderCertificateSvg,
} from './certificate-renderer';
import { type ListCertificatesQueryDto } from './dto/certificate.dto';
import { Certificate } from './entities/certificate.entity';

export interface CertificateVerification {
  valid: boolean;
  code: string;
  recipientName: string;
  courseTitle: string;
  course: { id: string; title: string; slug: string } | null;
  completedAt: Date;
  issuedAt: Date;
  revokedAt: Date | null;
  fileUrl: string | null;
}

@Injectable()
export class CertificatesService {
  private readonly logger = new Logger(CertificatesService.name);

  constructor(
    @InjectRepository(Certificate) private readonly certificates: Repository<Certificate>,
    private readonly coursesService: CoursesService,
    private readonly usersService: UsersService,
    private readonly storageService: StorageService,
    private readonly mailService: MailService,
    private readonly notificationsService: NotificationsService,
    @Inject(appConfig.KEY) private readonly app: ConfigType<typeof appConfig>,
  ) {}

  verifyUrl(code: string): string {
    return `${this.app.url}/certificates/verify/${code}`;
  }

  /** Issues at most one certificate per enrollment; repeated calls return the existing one. */
  async issueForEnrollment(enrollment: Enrollment, user: User): Promise<Certificate> {
    const existing = await this.certificates.findOne({
      where: { enrollmentId: enrollment.id },
    });
    if (existing) {
      return existing;
    }
    const course = await this.coursesService.findByIdOrFail(enrollment.courseId);
    const code = await this.uniqueCode();
    const completedAt = enrollment.completedAt ?? new Date();
    const certificate = this.certificates.create({
      code,
      userId: user.id,
      courseId: course.id,
      enrollmentId: enrollment.id,
      recipientName: `${user.firstName} ${user.lastName}`.trim(),
      courseTitle: course.title,
      instructorName: course.instructor
        ? `${course.instructor.firstName} ${course.instructor.lastName}`.trim()
        : this.app.name,
      completedAt,
      issuedAt: new Date(),
      revokedAt: null,
      revokeReason: null,
      svg: '',
      fileKey: null,
      fileUrl: null,
      templateVersion: CERTIFICATE_TEMPLATE_VERSION,
    });
    await this.render(certificate);
    const saved = await this.certificates.save(certificate);

    await this.notificationsService.notify(user.id, {
      type: NotificationType.CERTIFICATE_ISSUED,
      title: `Certificate issued for ${course.title}`,
      body: `Congratulations, your certificate ${code} is ready to share.`,
      data: { certificateId: saved.id, code, courseId: course.id },
    });
    this.mailService
      .sendCertificateIssued(user, course.title, this.verifyUrl(code))
      .catch((error: unknown) => {
        this.logger.warn(`Certificate email failed for ${user.email}: ${String(error)}`);
      });
    return saved;
  }

  async listMine(user: User): Promise<Certificate[]> {
    return this.certificates.find({
      where: { userId: user.id },
      relations: { course: true },
      order: { issuedAt: 'DESC' },
    });
  }

  list(query: ListCertificatesQueryDto): Promise<Paginated<Certificate>> {
    return paginateRepository(
      this.certificates,
      {
        where: {
          ...(query.courseId ? { courseId: query.courseId } : {}),
          ...(query.userId ? { userId: query.userId } : {}),
        },
        relations: { course: true, user: true },
        order: { issuedAt: 'DESC' },
      },
      query,
    );
  }

  async findByCodeOrFail(code: string): Promise<Certificate> {
    const certificate = await this.certificates.findOne({
      where: { code: code.trim().toUpperCase() },
      relations: { course: true },
    });
    if (!certificate) {
      throw new NotFoundException('No certificate matches this code');
    }
    return certificate;
  }

  async findByIdOrFail(id: string): Promise<Certificate> {
    const certificate = await this.certificates.findOne({
      where: { id },
      relations: { course: true },
    });
    if (!certificate) {
      throw new NotFoundException(`Certificate ${id} was not found`);
    }
    return certificate;
  }

  async verify(code: string): Promise<CertificateVerification> {
    const certificate = await this.findByCodeOrFail(code);
    return {
      valid: certificate.revokedAt === null,
      code: certificate.code,
      recipientName: certificate.recipientName,
      courseTitle: certificate.courseTitle,
      course: certificate.course
        ? {
            id: certificate.course.id,
            title: certificate.course.title,
            slug: certificate.course.slug,
          }
        : null,
      completedAt: certificate.completedAt,
      issuedAt: certificate.issuedAt,
      revokedAt: certificate.revokedAt,
      fileUrl: certificate.fileUrl,
    };
  }

  /** The SVG document for a valid certificate. Revoked ones are gone, not missing. */
  async svgByCode(code: string): Promise<string> {
    const certificate = await this.findByCodeOrFail(code);
    if (certificate.revokedAt) {
      throw new GoneException('This certificate has been revoked');
    }
    return certificate.svg;
  }

  async revoke(id: string, reason: string): Promise<Certificate> {
    const certificate = await this.findByIdOrFail(id);
    if (certificate.revokedAt) {
      throw new BadRequestException('This certificate is already revoked');
    }
    certificate.revokedAt = new Date();
    certificate.revokeReason = reason.trim();
    return this.certificates.save(certificate);
  }

  /** Re-renders a certificate with the current template, keeping its code. */
  async reissue(id: string): Promise<Certificate> {
    const certificate = await this.findByIdOrFail(id);
    const user = await this.usersService.findByIdOrFail(certificate.userId);
    certificate.recipientName = `${user.firstName} ${user.lastName}`.trim();
    certificate.templateVersion = CERTIFICATE_TEMPLATE_VERSION;
    await this.render(certificate);
    return this.certificates.save(certificate);
  }

  /** Re-renders every certificate, optionally limited to one course. Used by the CLI. */
  async reissueAll(
    courseId?: string,
    batchSize = 100,
  ): Promise<{ reissued: number; failed: number }> {
    let reissued = 0;
    let failed = 0;
    let page = 0;
    for (;;) {
      const batch = await this.certificates.find({
        where: courseId ? { courseId } : {},
        order: { issuedAt: 'ASC' },
        skip: page * batchSize,
        take: batchSize,
      });
      if (batch.length === 0) {
        break;
      }
      for (const certificate of batch) {
        try {
          await this.reissue(certificate.id);
          reissued += 1;
        } catch (error) {
          failed += 1;
          this.logger.error(`Could not reissue ${certificate.code}: ${String(error)}`);
        }
      }
      page += 1;
    }
    return { reissued, failed };
  }

  private async render(certificate: Certificate): Promise<void> {
    certificate.svg = renderCertificateSvg({
      appName: this.app.name,
      recipientName: certificate.recipientName,
      courseTitle: certificate.courseTitle,
      instructorName: certificate.instructorName,
      completedAt: certificate.completedAt,
      code: certificate.code,
      verifyUrl: this.verifyUrl(certificate.code),
    });
    const key = `certificates/${certificate.code}.svg`;
    try {
      const url = await this.storageService.putObject(key, certificate.svg, 'image/svg+xml');
      certificate.fileKey = url ? key : null;
      certificate.fileUrl = url;
    } catch (error) {
      this.logger.warn(`Certificate upload skipped for ${certificate.code}: ${String(error)}`);
      certificate.fileKey = null;
      certificate.fileUrl = null;
    }
  }

  private async uniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = generateCertificateCode();
      if (!(await this.certificates.exists({ where: { code } }))) {
        return code;
      }
    }
    throw new Error('Could not generate a unique certificate code');
  }
}
