import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { OrganizationStatus } from '../enums/organization.enums';
import { OrganizationMembership } from './organization-membership.entity';
import { SeatPack } from './seat-pack.entity';

@Entity('organizations')
export class Organization extends BaseEntity {
  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Index('organizations_slug_unique', { unique: true })
  @Column({ type: 'varchar', length: 220 })
  slug!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 2048, nullable: true })
  website!: string | null;

  @Column({ name: 'logo_url', type: 'varchar', length: 2048, nullable: true })
  logoUrl!: string | null;

  @Column({
    type: 'enum',
    enum: OrganizationStatus,
    enumName: 'organization_status',
    default: OrganizationStatus.ACTIVE,
  })
  status!: OrganizationStatus;

  @Index('organizations_owner_id_idx')
  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'owner_id' })
  owner?: User;

  @OneToMany(() => OrganizationMembership, (membership) => membership.organization)
  memberships?: OrganizationMembership[];

  @OneToMany(() => SeatPack, (pack) => pack.organization)
  seatPacks?: SeatPack[];
}
