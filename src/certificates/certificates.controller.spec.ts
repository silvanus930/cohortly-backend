import { Test } from '@nestjs/testing';
import { UserRole } from '../common/enums/user-role.enum';
import { type User } from '../users/entities/user.entity';
import { CertificatesController, CertificatesManageController } from './certificates.controller';
import { CertificatesService } from './certificates.service';

const learner = { id: 'lea', role: UserRole.LEARNER } as User;
const certificate = {
  id: 'cert-1',
  code: 'CHT-AB23-CD45',
  courseId: 'c1',
  course: { id: 'c1', title: 'TS', slug: 'ts' },
  recipientName: 'Ada',
  courseTitle: 'TS',
  instructorName: 'Ivo',
  completedAt: new Date(),
  issuedAt: new Date(),
  revokedAt: null,
  fileUrl: null,
  svg: '<svg/>',
  user: { id: 'lea', email: 'ada@x.test', firstName: 'Ada', lastName: 'L' },
};

describe('certificate controllers', () => {
  const certificatesService = {
    verifyUrl: jest.fn((code: string) => `https://app.test/certificates/verify/${code}`),
    listMine: jest.fn().mockResolvedValue([certificate]),
    verify: jest.fn().mockResolvedValue({ valid: true, code: certificate.code }),
    svgByCode: jest.fn().mockResolvedValue('<svg/>'),
    list: jest.fn().mockResolvedValue({ items: [certificate], meta: { total: 1 } }),
    revoke: jest.fn().mockResolvedValue({ ...certificate, revokedAt: new Date() }),
    reissue: jest.fn().mockResolvedValue(certificate),
  };
  let controller: CertificatesController;
  let manage: CertificatesManageController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [CertificatesController, CertificatesManageController],
      providers: [
        { provide: CertificatesService, useValue: certificatesService },
        CertificatesController,
      ],
    }).compile();
    controller = moduleRef.get(CertificatesController);
    manage = moduleRef.get(CertificatesManageController);
  });

  it('maps certificates with a verify url and hides the svg body', async () => {
    const mine = await controller.mine(learner);

    expect(mine[0]).toMatchObject({
      code: 'CHT-AB23-CD45',
      verifyUrl: 'https://app.test/certificates/verify/CHT-AB23-CD45',
      course: { slug: 'ts' },
    });
    expect(mine[0]).not.toHaveProperty('svg');
    expect(mine[0]).not.toHaveProperty('learner');
  });

  it('serves verification and svg publicly', async () => {
    await expect(controller.verify('CHT-AB23-CD45')).resolves.toMatchObject({ valid: true });
    await expect(controller.svg('CHT-AB23-CD45')).resolves.toBe('<svg/>');
  });

  it('exposes learner details, revocation and reissue to admins', async () => {
    const page = await manage.list({ page: 1, limit: 20 });
    expect(page.items[0].learner).toMatchObject({ email: 'ada@x.test', fullName: 'Ada L' });

    const revoked = await manage.revoke('cert-1', { reason: 'Wrong learner' });
    expect(revoked.revokedAt).toBeInstanceOf(Date);
    expect(certificatesService.revoke).toHaveBeenCalledWith('cert-1', 'Wrong learner');

    await manage.reissue('cert-1');
    expect(certificatesService.reissue).toHaveBeenCalledWith('cert-1');
  });
});
