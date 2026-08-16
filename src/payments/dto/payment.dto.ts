import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { PurchaseKind, PurchaseStatus } from '../enums/payment.enums';

export class CreateCheckoutDto {
  @ApiProperty({ enum: PurchaseKind })
  @IsEnum(PurchaseKind)
  kind!: PurchaseKind;

  @ApiPropertyOptional({ description: 'Required for COURSE' })
  @IsOptional()
  @IsUUID()
  courseId?: string;

  @ApiPropertyOptional({ type: [String], description: 'Required for BUNDLE' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  courseIds?: string[];

  @ApiPropertyOptional({ description: 'Required for SEAT_PACK' })
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @ApiPropertyOptional({ description: 'Required for SEAT_PACK', minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  seats?: number;

  @ApiPropertyOptional({ description: 'Referral code to credit for this purchase' })
  @IsOptional()
  @IsString()
  @Length(4, 32)
  referralCode?: string;
}

export class RefundPurchaseDto {
  @ApiProperty({ example: 'Duplicate purchase' })
  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class ListPurchasesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PurchaseStatus })
  @IsOptional()
  @IsEnum(PurchaseStatus)
  status?: PurchaseStatus;

  @ApiPropertyOptional({ enum: PurchaseKind })
  @IsOptional()
  @IsEnum(PurchaseKind)
  kind?: PurchaseKind;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userId?: string;
}
