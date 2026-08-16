import { Inject, Injectable } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import Stripe from 'stripe';
import { paymentsConfig } from './payments.config';

/**
 * Thin seam around the Stripe SDK so the rest of the module can be unit
 * tested without network access. Webhook verification works even when no
 * secret key is configured, which keeps local and CI runs offline.
 */
@Injectable()
export class StripeClientService {
  private readonly stripe: Stripe;

  constructor(
    @Inject(paymentsConfig.KEY) private readonly config: ConfigType<typeof paymentsConfig>,
  ) {
    this.stripe = new Stripe(config.stripeSecretKey || 'sk_test_placeholder');
  }

  get isConfigured(): boolean {
    return this.config.stripeSecretKey.length > 0;
  }

  get hasWebhookSecret(): boolean {
    return this.config.stripeWebhookSecret.length > 0;
  }

  constructEvent(rawBody: Buffer | string, signature: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(rawBody, signature, this.config.stripeWebhookSecret);
  }

  createCheckoutSession(
    params: Stripe.Checkout.SessionCreateParams,
  ): Promise<Stripe.Checkout.Session> {
    return this.stripe.checkout.sessions.create(params);
  }

  retrieveCheckoutSession(id: string): Promise<Stripe.Checkout.Session> {
    return this.stripe.checkout.sessions.retrieve(id);
  }

  createRefund(paymentIntentId: string): Promise<Stripe.Refund> {
    return this.stripe.refunds.create({ payment_intent: paymentIntentId });
  }
}
