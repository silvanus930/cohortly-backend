import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { PurchaseKind, PurchaseStatus } from '../enums/payment.enums';

export interface PurchaseItem {
  courseId: string;
  title: string;
  priceCents: number;
}

@Entity('purchases')
export class Purchase extends BaseEntity {
  @Index('purchases_user_id_idx')
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ type: 'enum', enum: PurchaseKind, enumName: 'purchase_kind' })
  kind!: PurchaseKind;

  @Index('purchases_status_idx')
  @Column({
    type: 'enum',
    enum: PurchaseStatus,
    enumName: 'purchase_status',
    default: PurchaseStatus.PENDING,
  })
  status!: PurchaseStatus;

  @Column({ name: 'amount_cents', type: 'int' })
  amountCents!: number;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  /** Courses included, one for COURSE and several for BUNDLE. */
  @Column({ type: 'jsonb', default: [] })
  items!: PurchaseItem[];

  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId!: string | null;

  @Column({ type: 'int', nullable: true })
  seats!: number | null;

  @Index('purchases_checkout_session_unique', {
    unique: true,
    where: 'stripe_checkout_session_id IS NOT NULL',
  })
  @Column({ name: 'stripe_checkout_session_id', type: 'varchar', length: 255, nullable: true })
  stripeCheckoutSessionId!: string | null;

  @Column({ name: 'stripe_payment_intent_id', type: 'varchar', length: 255, nullable: true })
  stripePaymentIntentId!: string | null;

  @Column({ name: 'referral_code', type: 'varchar', length: 32, nullable: true })
  referralCode!: string | null;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt!: Date | null;

  @Column({ name: 'refunded_at', type: 'timestamptz', nullable: true })
  refundedAt!: Date | null;

  @Column({ name: 'refund_reason', type: 'varchar', length: 500, nullable: true })
  refundReason!: string | null;

  get isPaid(): boolean {
    return this.status === PurchaseStatus.PAID;
  }
}
