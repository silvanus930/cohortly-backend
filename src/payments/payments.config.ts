import { registerAs } from '@nestjs/config';
import { parseInteger } from '../config/parsers';

export const paymentsConfig = registerAs('payments', () => ({
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
  successUrl: process.env.STRIPE_SUCCESS_URL ?? 'http://localhost:5173/checkout/success',
  cancelUrl: process.env.STRIPE_CANCEL_URL ?? 'http://localhost:5173/checkout/cancel',
  currency: (process.env.PAYMENTS_CURRENCY ?? 'USD').toUpperCase(),
  seatPriceCents: parseInteger(process.env.SEAT_PRICE_CENTS, 19900),
  maxBundleSize: parseInteger(process.env.MAX_BUNDLE_SIZE, 10),
}));
