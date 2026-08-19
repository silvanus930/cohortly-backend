import { registerAs } from '@nestjs/config';
import { parseInteger } from '../config/parsers';

export const referralsConfig = registerAs('referrals', () => ({
  defaultCommissionRateBps: parseInteger(process.env.REFERRAL_COMMISSION_RATE_BPS, 2000),
  payoutThresholdCents: parseInteger(process.env.REFERRAL_PAYOUT_THRESHOLD_CENTS, 10000),
  codeLength: parseInteger(process.env.REFERRAL_CODE_LENGTH, 8),
}));
