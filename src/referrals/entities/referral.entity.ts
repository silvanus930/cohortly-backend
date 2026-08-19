import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';

/** The relationship created when a new user signs up with someone's code. */
@Entity('referrals')
export class Referral extends BaseEntity {
  @Index('referrals_referrer_id_idx')
  @Column({ name: 'referrer_id', type: 'uuid' })
  referrerId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'referrer_id' })
  referrer?: User;

  @Index('referrals_referred_user_id_unique', { unique: true })
  @Column({ name: 'referred_user_id', type: 'uuid' })
  referredUserId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'referred_user_id' })
  referredUser?: User;

  @Column({ type: 'varchar', length: 32 })
  code!: string;

  /** Set when the referred user makes their first paid purchase. */
  @Column({ name: 'qualified_at', type: 'timestamptz', nullable: true })
  qualifiedAt!: Date | null;

  @Column({ name: 'qualified_purchase_id', type: 'uuid', nullable: true })
  qualifiedPurchaseId!: string | null;

  get isQualified(): boolean {
    return this.qualifiedAt !== null;
  }
}
