import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { UserRole, UserStatus } from '../../common/enums/user-role.enum';

@Entity('users')
export class User extends BaseEntity {
  @Index('users_email_unique', { unique: true })
  @Column({ type: 'varchar', length: 320 })
  email!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255, nullable: true })
  passwordHash!: string | null;

  @Column({ name: 'first_name', type: 'varchar', length: 100 })
  firstName!: string;

  @Column({ name: 'last_name', type: 'varchar', length: 100 })
  lastName!: string;

  @Column({ type: 'enum', enum: UserRole, enumName: 'user_role', default: UserRole.LEARNER })
  role!: UserRole;

  @Column({ type: 'enum', enum: UserStatus, enumName: 'user_status', default: UserStatus.ACTIVE })
  status!: UserStatus;

  @Column({ name: 'avatar_url', type: 'varchar', length: 2048, nullable: true })
  avatarUrl!: string | null;

  @Index('users_google_id_unique', { unique: true, where: 'google_id IS NOT NULL' })
  @Column({ name: 'google_id', type: 'varchar', length: 255, nullable: true })
  googleId!: string | null;

  @Column({ name: 'email_verified_at', type: 'timestamptz', nullable: true })
  emailVerifiedAt!: Date | null;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  @Index('users_referral_code_unique', { unique: true, where: 'referral_code IS NOT NULL' })
  @Column({ name: 'referral_code', type: 'varchar', length: 32, nullable: true })
  referralCode!: string | null;

  @Column({ name: 'referred_by_id', type: 'uuid', nullable: true })
  referredById!: string | null;

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`.trim();
  }

  get isActive(): boolean {
    return this.status === UserStatus.ACTIVE;
  }
}
