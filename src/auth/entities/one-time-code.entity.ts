import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';

export enum OneTimeCodePurpose {
  PASSWORD_RESET = 'PASSWORD_RESET',
}

/** Six digit codes emailed for password resets. Stored hashed, single use. */
@Entity('one_time_codes')
export class OneTimeCode extends BaseEntity {
  @Index('one_time_codes_user_purpose_idx')
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ type: 'enum', enum: OneTimeCodePurpose, enumName: 'one_time_code_purpose' })
  purpose!: OneTimeCodePurpose;

  @Column({ name: 'code_hash', type: 'varchar', length: 128 })
  codeHash!: string;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
  consumedAt!: Date | null;
}
