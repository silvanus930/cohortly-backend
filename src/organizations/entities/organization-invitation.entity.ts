import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { InvitationStatus, OrganizationMemberRole } from '../enums/organization.enums';
import { Organization } from './organization.entity';

@Entity('organization_invitations')
export class OrganizationInvitation extends BaseEntity {
  @Index('organization_invitations_organization_id_idx')
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization;

  @Index('organization_invitations_email_idx')
  @Column({ type: 'varchar', length: 320 })
  email!: string;

  @Column({ type: 'enum', enum: OrganizationMemberRole, enumName: 'organization_member_role' })
  role!: OrganizationMemberRole;

  @Index('organization_invitations_token_hash_unique', { unique: true })
  @Column({ name: 'token_hash', type: 'varchar', length: 128 })
  tokenHash!: string;

  @Column({ name: 'invited_by_id', type: 'uuid' })
  invitedById!: string;

  @Column({
    type: 'enum',
    enum: InvitationStatus,
    enumName: 'invitation_status',
    default: InvitationStatus.PENDING,
  })
  status!: InvitationStatus;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt!: Date | null;

  get isPending(): boolean {
    return this.status === InvitationStatus.PENDING && this.expiresAt.getTime() > Date.now();
  }
}
