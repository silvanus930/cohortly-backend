import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { CommissionStatus } from '../enums/referral.enums';
import { PayoutCycle } from './payout-cycle.entity';
import { Referral } from './referral.entity';

/** Immutable ledger of commissions earned, reversed and paid. */
@Entity('commission_entries')
export class CommissionEntry extends BaseEntity {
  @Index('commission_entries_partner_id_idx')
  @Column({ name: 'partner_id', type: 'uuid' })
  partnerId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'partner_id' })
  partner?: User;

  @Column({ name: 'referral_id', type: 'uuid' })
  referralId!: string;

  @ManyToOne(() => Referral, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'referral_id' })
  referral?: Referral;

  @Index('commission_entries_purchase_id_unique', { unique: true })
  @Column({ name: 'purchase_id', type: 'uuid' })
  purchaseId!: string;

  @Column({ name: 'payout_cycle_id', type: 'uuid', nullable: true })
  payoutCycleId!: string | null;

  @ManyToOne(() => PayoutCycle, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'payout_cycle_id' })
  payoutCycle?: PayoutCycle | null;

  @Column({ name: 'purchase_amount_cents', type: 'int' })
  purchaseAmountCents!: number;

  @Column({ name: 'rate_bps', type: 'int' })
  rateBps!: number;

  @Column({ name: 'amount_cents', type: 'int' })
  amountCents!: number;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Index('commission_entries_status_idx')
  @Column({
    type: 'enum',
    enum: CommissionStatus,
    enumName: 'commission_status',
    default: CommissionStatus.EARNED,
  })
  status!: CommissionStatus;

  @Column({ name: 'reversed_at', type: 'timestamptz', nullable: true })
  reversedAt!: Date | null;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt!: Date | null;
}
