import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { type Paginated } from '../common/pagination/pagination';
import { type User } from '../users/entities/user.entity';
import {
  ListLedgerQueryDto,
  ListPartnersQueryDto,
  ListPayoutsQueryDto,
  MarkPayoutPaidDto,
  UpsertPartnerDto,
} from './dto/referral.dto';
import { type CommissionEntry } from './entities/commission-entry.entity';
import { type PartnerProfile } from './entities/partner-profile.entity';
import { type PayoutCycle } from './entities/payout-cycle.entity';
import {
  type CommissionStatus,
  type PartnerStatus,
  type PayoutCycleStatus,
} from './enums/referral.enums';
import { type ReferralStats, ReferralsService } from './referrals.service';

export interface CommissionEntryDto {
  id: string;
  purchaseId: string;
  purchaseAmountCents: number;
  rateBps: number;
  amountCents: number;
  currency: string;
  status: CommissionStatus;
  referredUser: { id: string; fullName: string } | null;
  createdAt: Date;
  paidAt: Date | null;
  reversedAt: Date | null;
}

export interface PayoutCycleDto {
  id: string;
  partnerId: string;
  partner: { id: string; fullName: string; email: string } | null;
  status: PayoutCycleStatus;
  currency: string;
  amountCents: number;
  entryCount: number;
  thresholdCents: number;
  openedAt: Date;
  readyAt: Date | null;
  paidAt: Date | null;
  payoutReference: string | null;
}

export interface PartnerProfileDto {
  userId: string;
  user: { id: string; fullName: string; email: string; referralCode: string | null } | null;
  commissionRateBps: number;
  payoutThresholdCents: number | null;
  payoutMethod: string | null;
  status: PartnerStatus;
  notes: string | null;
  openCycleAmountCents?: number;
  referralCount?: number;
}

export function toCommissionEntryDto(entry: CommissionEntry): CommissionEntryDto {
  const referred = entry.referral?.referredUser;
  return {
    id: entry.id,
    purchaseId: entry.purchaseId,
    purchaseAmountCents: entry.purchaseAmountCents,
    rateBps: entry.rateBps,
    amountCents: entry.amountCents,
    currency: entry.currency,
    status: entry.status,
    referredUser: referred
      ? { id: referred.id, fullName: `${referred.firstName} ${referred.lastName}`.trim() }
      : null,
    createdAt: entry.createdAt,
    paidAt: entry.paidAt,
    reversedAt: entry.reversedAt,
  };
}

export function toPayoutCycleDto(cycle: PayoutCycle): PayoutCycleDto {
  return {
    id: cycle.id,
    partnerId: cycle.partnerId,
    partner: cycle.partner
      ? {
          id: cycle.partner.id,
          fullName: `${cycle.partner.firstName} ${cycle.partner.lastName}`.trim(),
          email: cycle.partner.email,
        }
      : null,
    status: cycle.status,
    currency: cycle.currency,
    amountCents: cycle.amountCents,
    entryCount: cycle.entryCount,
    thresholdCents: cycle.thresholdCents,
    openedAt: cycle.openedAt,
    readyAt: cycle.readyAt,
    paidAt: cycle.paidAt,
    payoutReference: cycle.payoutReference,
  };
}

export function toPartnerProfileDto(profile: PartnerProfile): PartnerProfileDto {
  return {
    userId: profile.userId,
    user: profile.user
      ? {
          id: profile.user.id,
          fullName: `${profile.user.firstName} ${profile.user.lastName}`.trim(),
          email: profile.user.email,
          referralCode: profile.user.referralCode,
        }
      : null,
    commissionRateBps: profile.commissionRateBps,
    payoutThresholdCents: profile.payoutThresholdCents,
    payoutMethod: profile.payoutMethod,
    status: profile.status,
    notes: profile.notes,
  };
}

@ApiTags('referrals')
@ApiBearerAuth()
@Controller('referrals')
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Your referral code, link and commission totals' })
  stats(@CurrentUser() user: User): Promise<ReferralStats> {
    return this.referralsService.stats(user);
  }

  @Get('me/ledger')
  async ledger(
    @CurrentUser() user: User,
    @Query() query: ListLedgerQueryDto,
  ): Promise<Paginated<CommissionEntryDto>> {
    const page = await this.referralsService.ledger({ ...query, partnerId: user.id });
    return { items: page.items.map(toCommissionEntryDto), meta: page.meta };
  }

  @Get('me/payouts')
  async payouts(
    @CurrentUser() user: User,
    @Query() query: ListPayoutsQueryDto,
  ): Promise<Paginated<PayoutCycleDto>> {
    const page = await this.referralsService.payouts({ ...query, partnerId: user.id });
    return { items: page.items.map(toPayoutCycleDto), meta: page.meta };
  }
}

@ApiTags('referrals')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('manage/referrals')
export class ReferralsManageController {
  constructor(private readonly referralsService: ReferralsService) {}

  @Get('partners')
  async partners(@Query() query: ListPartnersQueryDto): Promise<Paginated<PartnerProfileDto>> {
    const page = await this.referralsService.listPartners(query);
    return {
      items: page.items.map((item) => ({
        ...toPartnerProfileDto(item.profile),
        openCycleAmountCents: item.openCycleAmountCents,
        referralCount: item.referralCount,
      })),
      meta: page.meta,
    };
  }

  @Put('partners/:userId')
  @ApiOperation({ summary: 'Create or update partner terms; learners become partners' })
  async upsertPartner(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpsertPartnerDto,
  ): Promise<PartnerProfileDto> {
    return toPartnerProfileDto(await this.referralsService.upsertPartner(userId, dto));
  }

  @Get('ledger')
  async ledger(@Query() query: ListLedgerQueryDto): Promise<Paginated<CommissionEntryDto>> {
    const page = await this.referralsService.ledger(query);
    return { items: page.items.map(toCommissionEntryDto), meta: page.meta };
  }

  @Get('payouts')
  async payouts(@Query() query: ListPayoutsQueryDto): Promise<Paginated<PayoutCycleDto>> {
    const page = await this.referralsService.payouts(query);
    return { items: page.items.map(toPayoutCycleDto), meta: page.meta };
  }

  @Post('payouts/:id/pay')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record that a payout cycle was paid outside the platform' })
  async markPaid(
    @CurrentUser() actor: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkPayoutPaidDto,
  ): Promise<PayoutCycleDto> {
    return toPayoutCycleDto(await this.referralsService.markPaid(actor, id, dto.reference));
  }
}
