import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/** Every processed Stripe event, so webhook retries are idempotent. */
@Entity('stripe_events')
export class StripeEvent {
  @PrimaryColumn({ name: 'event_id', type: 'varchar', length: 255 })
  eventId!: string;

  @Column({ type: 'varchar', length: 120 })
  type!: string;

  @Column({ name: 'purchase_id', type: 'uuid', nullable: true })
  purchaseId!: string | null;

  @CreateDateColumn({ name: 'processed_at', type: 'timestamptz' })
  processedAt!: Date;
}
