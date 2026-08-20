import { Module, type OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsModule } from '../payments/payments.module';
import { PaymentsService } from '../payments/payments.service';
import { UsersModule } from '../users/users.module';
import { CommissionEntry } from './entities/commission-entry.entity';
import { PartnerProfile } from './entities/partner-profile.entity';
import { PayoutCycle } from './entities/payout-cycle.entity';
import { Referral } from './entities/referral.entity';
import { ReferralsController, ReferralsManageController } from './referrals.controller';
import { ReferralsService } from './referrals.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PartnerProfile, Referral, CommissionEntry, PayoutCycle]),
    UsersModule,
    PaymentsModule,
  ],
  controllers: [ReferralsController, ReferralsManageController],
  providers: [ReferralsService],
  exports: [ReferralsService, TypeOrmModule],
})
export class ReferralsModule implements OnModuleInit {
  constructor(
    private readonly referralsService: ReferralsService,
    private readonly paymentsService: PaymentsService,
  ) {}

  /** Commissions follow the money: earned on paid purchases, reversed on refunds. */
  onModuleInit(): void {
    this.paymentsService.registerPaidHandler(async (purchase) => {
      await this.referralsService.recordCommission(purchase);
    });
    this.paymentsService.registerRefundHandler(async (purchase) => {
      await this.referralsService.reverseCommission(purchase);
    });
  }
}
