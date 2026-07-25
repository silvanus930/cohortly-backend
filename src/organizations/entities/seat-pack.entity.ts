import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { SeatPackSource } from '../enums/organization.enums';
import { Organization } from './organization.entity';

/** A block of learner seats granted to an organization, manually or by purchase. */
@Entity('seat_packs')
export class SeatPack extends BaseEntity {
  @Index('seat_packs_organization_id_idx')
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, (organization) => organization.seatPacks, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization;

  @Column({ type: 'int' })
  seats!: number;

  @Column({ type: 'enum', enum: SeatPackSource, enumName: 'seat_pack_source' })
  source!: SeatPackSource;

  @Column({ name: 'purchase_id', type: 'uuid', nullable: true })
  purchaseId!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note!: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

  get isActive(): boolean {
    return this.expiresAt === null || this.expiresAt.getTime() > Date.now();
  }
}
