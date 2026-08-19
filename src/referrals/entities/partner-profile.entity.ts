import { Column, Entity, Index, JoinColumn, OneToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { PartnerStatus } from '../enums/referral.enums';

/** Per partner commission terms. Users without a profile use the defaults. */
@Entity('partner_profiles')
export class PartnerProfile extends BaseEntity {
  @Index('partner_profiles_user_id_unique', { unique: true })
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  /** Commission rate in basis points, 2000 means 20 percent. */
  @Column({ name: 'commission_rate_bps', type: 'int' })
  commissionRateBps!: number;

  @Column({ name: 'payout_threshold_cents', type: 'int', nullable: true })
  payoutThresholdCents!: number | null;

  @Column({ name: 'payout_method', type: 'varchar', length: 40, nullable: true })
  payoutMethod!: string | null;

  @Column({ name: 'payout_details', type: 'jsonb', default: {} })
  payoutDetails!: Record<string, string>;

  @Column({
    type: 'enum',
    enum: PartnerStatus,
    enumName: 'partner_status',
    default: PartnerStatus.ACTIVE,
  })
  status!: PartnerStatus;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  notes!: string | null;
}
