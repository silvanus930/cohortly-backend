# ADR 0002: Stripe Checkout with webhook driven fulfilment

- Status: accepted
- Date: 2026-09-03

## Context

Learners buy single courses and bundles; organizations buy seat packs. We
do not want card data, PCI scope or a custom payment form in this codebase,
and fulfilment must be correct even when the browser closes before the
redirect back to the app or when Stripe retries a webhook.

## Decision

Every purchase starts as a `purchases` row in status `PENDING` that records
exactly what was bought and for how much. The API then creates a Stripe
Checkout session with `client_reference_id` set to the purchase id and the
purchase id in the session metadata, and returns the hosted checkout URL.

Two paths can fulfil a purchase and both go through the same idempotent
`fulfill` step:

- The client calls `POST /payments/confirm/:purchaseId` after the redirect.
  The API retrieves the session from Stripe and fulfils it if the payment
  status is `paid`.
- Stripe calls `POST /payments/webhook`. The raw request body is verified
  against `STRIPE_WEBHOOK_SECRET`, and every event id is stored in
  `stripe_events` before returning, so a redelivered event is acknowledged
  without being processed twice.

Fulfilment marks the purchase `PAID`, enrolls the buyer in each course of the
purchase or grants the organization a seat pack, and notifies registered
handlers such as referrals. Refunds, whether triggered by an admin or by a
`charge.refunded` event, mark the purchase `REFUNDED`, cancel the enrollments
it created or remove the seat pack, and reverse unpaid commissions.

## Consequences

- No card data touches the API and the checkout UI is maintained by Stripe.
- The purchase table is the source of truth for revenue reporting; Stripe is
  only consulted at checkout, confirmation and refund time.
- Tests can exercise the whole fulfilment path offline by signing a fake
  event with the webhook secret, which is why the webhook verifier works
  without an API key.
- Prices are captured at purchase time, so later price changes do not alter
  historical records, and bundles split their amount evenly across courses
  for per course revenue reports.
