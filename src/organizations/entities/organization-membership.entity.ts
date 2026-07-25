import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { OrganizationMemberRole } from '../enums/organization.enums';
import { Organization } from './organization.entity';

@Entity('organization_memberships')
@Index('organization_memberships_org_user_unique', ['organizationId', 'userId'], { unique: true })
export class OrganizationMembership extends BaseEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, (organization) => organization.memberships, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization;

  @Index('organization_memberships_user_id_idx')
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({
    type: 'enum',
    enum: OrganizationMemberRole,
    enumName: 'organization_member_role',
    default: OrganizationMemberRole.MEMBER,
  })
  role!: OrganizationMemberRole;
}
