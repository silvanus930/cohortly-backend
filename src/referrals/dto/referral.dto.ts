import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { CommissionStatus, PartnerStatus, PayoutCycleStatus } from '../enums/referral.enums';

export class UpsertPartnerDto {
  @ApiPropertyOptional({
    description: 'Basis points, 2000 means 20 percent',
    minimum: 0,
    maximum: 10000,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  commissionRateBps?: number;

  @ApiPropertyOptional({ description: 'Overrides the platform payout threshold' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000000)
  payoutThresholdCents?: number;

  @ApiPropertyOptional({ example: 'bank_transfer' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  payoutMethod?: string;

  @ApiPropertyOptional({ example: { iban: 'DE00...', holder: 'Ada Lovelace' } })
  @IsOptional()
  @IsObject()
  payoutDetails?: Record<string, string>;

  @ApiPropertyOptional({ enum: PartnerStatus })
  @IsOptional()
  @IsEnum(PartnerStatus)
  status?: PartnerStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class MarkPayoutPaidDto {
  @ApiProperty({ example: 'SEPA-2026-03-0042' })
  @IsString()
  @Length(2, 200)
  reference!: string;
}

export class ListLedgerQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: CommissionStatus })
  @IsOptional()
  @IsEnum(CommissionStatus)
  status?: CommissionStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  partnerId?: string;
}

export class ListPayoutsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PayoutCycleStatus })
  @IsOptional()
  @IsEnum(PayoutCycleStatus)
  status?: PayoutCycleStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  partnerId?: string;
}

export class ListPartnersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PartnerStatus })
  @IsOptional()
  @IsEnum(PartnerStatus)
  status?: PartnerStatus;
}
