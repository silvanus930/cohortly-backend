import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  type RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { type Paginated } from '../common/pagination/pagination';
import { type User } from '../users/entities/user.entity';
import { CreateCheckoutDto, ListPurchasesQueryDto, RefundPurchaseDto } from './dto/payment.dto';
import { type Purchase, type PurchaseItem } from './entities/purchase.entity';
import { type PurchaseKind, type PurchaseStatus } from './enums/payment.enums';
import { PaymentsService, type WebhookResult } from './payments.service';

export interface PurchaseDto {
  id: string;
  kind: PurchaseKind;
  status: PurchaseStatus;
  amountCents: number;
  currency: string;
  items: PurchaseItem[];
  organizationId: string | null;
  seats: number | null;
  referralCode: string | null;
  paidAt: Date | null;
  refundedAt: Date | null;
  refundReason: string | null;
  createdAt: Date;
  buyer?: { id: string; email: string; fullName: string };
}

export function toPurchaseDto(purchase: Purchase, withBuyer = false): PurchaseDto {
  const dto: PurchaseDto = {
    id: purchase.id,
    kind: purchase.kind,
    status: purchase.status,
    amountCents: purchase.amountCents,
    currency: purchase.currency,
    items: purchase.items,
    organizationId: purchase.organizationId,
    seats: purchase.seats,
    referralCode: purchase.referralCode,
    paidAt: purchase.paidAt,
    refundedAt: purchase.refundedAt,
    refundReason: purchase.refundReason,
    createdAt: purchase.createdAt,
  };
  if (withBuyer && purchase.user) {
    dto.buyer = {
      id: purchase.user.id,
      email: purchase.user.email,
      fullName: `${purchase.user.firstName} ${purchase.user.lastName}`.trim(),
    };
  }
  return dto;
}

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @ApiBearerAuth()
  @Post('checkout')
  @ApiOperation({ summary: 'Start a Stripe Checkout session for a course, bundle or seat pack' })
  async checkout(
    @CurrentUser() user: User,
    @Body() dto: CreateCheckoutDto,
  ): Promise<{ purchase: PurchaseDto; checkoutUrl: string }> {
    const result = await this.paymentsService.createCheckout(user, dto);
    return { purchase: toPurchaseDto(result.purchase), checkoutUrl: result.checkoutUrl };
  }

  @ApiBearerAuth()
  @Post('confirm/:purchaseId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm a purchase after returning from Stripe' })
  async confirm(
    @CurrentUser() user: User,
    @Param('purchaseId', ParseUUIDPipe) purchaseId: string,
  ): Promise<PurchaseDto> {
    return toPurchaseDto(await this.paymentsService.confirm(user, purchaseId));
  }

  @ApiBearerAuth()
  @Get('mine')
  async mine(
    @CurrentUser() user: User,
    @Query() query: ListPurchasesQueryDto,
  ): Promise<Paginated<PurchaseDto>> {
    const page = await this.paymentsService.listMine(user, query);
    return { items: page.items.map((item) => toPurchaseDto(item)), meta: page.meta };
  }

  @ApiBearerAuth()
  @Get(':id')
  async findOne(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PurchaseDto> {
    return toPurchaseDto(await this.paymentsService.findOwnOrFail(user, id));
  }

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stripe webhook endpoint. Verifies the signature and is idempotent.' })
  webhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ): Promise<WebhookResult> {
    return this.paymentsService.handleWebhook(request.rawBody, signature);
  }
}

@ApiTags('payments')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('manage/purchases')
export class PurchasesManageController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  async list(@Query() query: ListPurchasesQueryDto): Promise<Paginated<PurchaseDto>> {
    const page = await this.paymentsService.list(query);
    return { items: page.items.map((item) => toPurchaseDto(item, true)), meta: page.meta };
  }

  @Post(':id/refund')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refund a paid purchase and revoke what it granted' })
  async refund(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RefundPurchaseDto,
  ): Promise<PurchaseDto> {
    return toPurchaseDto(await this.paymentsService.refund(id, dto.reason), true);
  }
}
