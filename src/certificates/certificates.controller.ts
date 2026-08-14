import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { SkipEnvelope } from '../common/decorators/skip-envelope.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { type Paginated } from '../common/pagination/pagination';
import { type User } from '../users/entities/user.entity';
import { type CertificateVerification, CertificatesService } from './certificates.service';
import { ListCertificatesQueryDto, RevokeCertificateDto } from './dto/certificate.dto';
import { type Certificate } from './entities/certificate.entity';

export interface CertificateDto {
  id: string;
  code: string;
  courseId: string;
  course: { id: string; title: string; slug: string } | null;
  recipientName: string;
  courseTitle: string;
  instructorName: string;
  completedAt: Date;
  issuedAt: Date;
  revokedAt: Date | null;
  fileUrl: string | null;
  verifyUrl: string;
  learner?: { id: string; email: string; fullName: string };
}

@ApiTags('certificates')
@Controller('certificates')
export class CertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

  toDto(certificate: Certificate, withLearner = false): CertificateDto {
    const dto: CertificateDto = {
      id: certificate.id,
      code: certificate.code,
      courseId: certificate.courseId,
      course: certificate.course
        ? {
            id: certificate.course.id,
            title: certificate.course.title,
            slug: certificate.course.slug,
          }
        : null,
      recipientName: certificate.recipientName,
      courseTitle: certificate.courseTitle,
      instructorName: certificate.instructorName,
      completedAt: certificate.completedAt,
      issuedAt: certificate.issuedAt,
      revokedAt: certificate.revokedAt,
      fileUrl: certificate.fileUrl,
      verifyUrl: this.certificatesService.verifyUrl(certificate.code),
    };
    if (withLearner && certificate.user) {
      dto.learner = {
        id: certificate.user.id,
        email: certificate.user.email,
        fullName: `${certificate.user.firstName} ${certificate.user.lastName}`.trim(),
      };
    }
    return dto;
  }

  @ApiBearerAuth()
  @Get('mine')
  @ApiOperation({ summary: 'Certificates earned by the current user' })
  async mine(@CurrentUser() user: User): Promise<CertificateDto[]> {
    return (await this.certificatesService.listMine(user)).map((item) => this.toDto(item));
  }

  @Public()
  @Get('verify/:code')
  @ApiOperation({ summary: 'Public verification of a certificate code' })
  verify(@Param('code') code: string): Promise<CertificateVerification> {
    return this.certificatesService.verify(code);
  }

  @Public()
  @SkipEnvelope()
  @Get('svg/:code')
  @Header('Content-Type', 'image/svg+xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  @ApiOperation({ summary: 'The rendered SVG document of a valid certificate' })
  svg(@Param('code') code: string): Promise<string> {
    return this.certificatesService.svgByCode(code);
  }
}

@ApiTags('certificates')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('manage/certificates')
export class CertificatesManageController {
  constructor(
    private readonly certificatesService: CertificatesService,
    private readonly certificatesController: CertificatesController,
  ) {}

  @Get()
  async list(@Query() query: ListCertificatesQueryDto): Promise<Paginated<CertificateDto>> {
    const page = await this.certificatesService.list(query);
    return {
      items: page.items.map((item) => this.certificatesController.toDto(item, true)),
      meta: page.meta,
    };
  }

  @Post(':id/revoke')
  @HttpCode(HttpStatus.OK)
  async revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RevokeCertificateDto,
  ): Promise<CertificateDto> {
    return this.certificatesController.toDto(await this.certificatesService.revoke(id, dto.reason));
  }

  @Post(':id/reissue')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Re-render a certificate with the current template' })
  async reissue(@Param('id', ParseUUIDPipe) id: string): Promise<CertificateDto> {
    return this.certificatesController.toDto(await this.certificatesService.reissue(id));
  }
}
