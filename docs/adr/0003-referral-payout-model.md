# ADR 0003: Ledger based referral commissions with threshold payouts

- Status: accepted
- Date: 2026-09-03

## Context

Partners refer learners and earn a share of what those learners spend.
Commissions must survive refunds, rate changes and manual payouts made
outside the platform, and finance needs an auditable trail rather than a
single mutable balance per partner.

## Decision

Referrals are modelled in three layers.

1. `referrals` stores the relationship created when someone signs up with a
   partner's code. It becomes qualified on the referred user's first paid
   purchase. A user can be referred at most once.
2. `commission_entries` is an append only ledger. Each paid purchase by a
   referred user creates one entry with the purchase amount, the rate in
   basis points that applied at the time and the resulting commission. An
   entry moves from `EARNED` to either `PAID` or `REVERSED`; it is never
   deleted or edited otherwise.
3. `payout_cycles` group earned entries per partner. Exactly one cycle is
   open per partner. When its total reaches the payout threshold (the
   partner's own or the platform default) the cycle becomes `READY`,
   superadmins are alerted by email and inbox once, and the partner is told
   a payout is coming. An admin marks the cycle `PAID` with an external
   reference, which settles its entries; the next commission opens a fresh
   cycle.

Refunds reverse the matching entry and subtract it from its cycle if that
cycle is not paid yet. Commissions that were already paid stay paid; the
reversal is visible in the ledger for reconciliation.

Rates live on an optional `partner_profiles` row so admins can negotiate
individual terms without touching the default, and suspending a profile
stops both new signups with the code and new commissions.

## Consequences

- Every cent a partner is owed or was paid can be traced to a purchase and
  a cycle, which makes disputes and accounting straightforward.
- Balances are derived from entries and cycles instead of stored, so the
  numbers cannot drift out of sync with the ledger.
- Payouts are recorded, not executed: the platform does not move money to
  partners, which keeps banking integrations out of scope for now.
- Threshold alerts fire once per cycle, so a partner hovering around the
  threshold does not generate repeated emails.
