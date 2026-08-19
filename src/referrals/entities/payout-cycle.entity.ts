import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { PayoutCycleStatus } from '../enums/referral.enums';

/**
 * Accumulates a partner's earned commissions until they cross the payout
 * threshold and an admin marks the cycle paid. One open cycle per partner.
 */
@Entity('payout_cycles')
@Index('payout_cycles_partner_status_idx', ['partnerId', 'status'])
export class PayoutCycle extends BaseEntity {
  @Column({ name: 'partner_id', type: 'uuid' })
  partnerId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'partner_id' })
  partner?: User;

  @Column({
    type: 'enum',
    enum: PayoutCycleStatus,
    enumName: 'payout_cycle_status',
    default: PayoutCycleStatus.OPEN,
  })
  status!: PayoutCycleStatus;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ name: 'amount_cents', type: 'int', default: 0 })
  amountCents!: number;

  @Column({ name: 'entry_count', type: 'int', default: 0 })
  entryCount!: number;

  @Column({ name: 'threshold_cents', type: 'int' })
  thresholdCents!: number;

  @Column({ name: 'opened_at', type: 'timestamptz' })
  openedAt!: Date;

  @Column({ name: 'ready_at', type: 'timestamptz', nullable: true })
  readyAt!: Date | null;

  @Column({ name: 'alert_sent_at', type: 'timestamptz', nullable: true })
  alertSentAt!: Date | null;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt!: Date | null;

  @Column({ name: 'paid_by_id', type: 'uuid', nullable: true })
  paidById!: string | null;

  @Column({ name: 'payout_reference', type: 'varchar', length: 200, nullable: true })
  payoutReference!: string | null;
}
