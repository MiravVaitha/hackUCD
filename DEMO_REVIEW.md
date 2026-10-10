# Verity demo review — 10 October 2026

Scope: public website, merchant console, checkout, customer help, billing, evidence/AI workflows and backend access checks. Mobile packing UI, barcode camera and photo capture remain with Claude and were not edited in this review.

## Fixed

- Account now shows Stripe-confirmed sandbox payment, amount, invoice and subscription references alongside the access outcome. Checkout returns to this confirmation page. The existing first EUR 2.49 invoice was re-verified as paid through Stripe's API.
- Checkout confirmation validates subscription ownership and rejects an older, different checkout replacing an already active subscription. Regression tests cover the receipt and replacement guard.

- Stripe dispute created/updated/closed/funds events now import into the dispute inbox and evidence ledger. Provider state is re-read to avoid applying stale event state; repeated event IDs do not duplicate ledger entries.
- Premium status now reconciles Stripe subscription updates and cancellations. Account includes an owner-only test cancellation control; free features remain available.
- Console live refresh includes subscription status changes.
- Saved AI assessments and evidence PDFs display a warning when newer source evidence exists.
- Stripe sandbox disputes are explicitly labelled as test data in the evidence workspace and inbox.
- Packing-only accounts cannot use stored-file URLs to open dispute PDFs; private evidence responses are not browser-cached.

## Verification

- 86 unit/database tests passed, including dispute import, tenant boundaries, repeated event handling, source citation validation, free/Premium access and subscription cancellation.
- TypeScript, ESLint and production build passed. The subsequent live-refresh SQL addition was executed successfully against the local database.
- Fresh browser purchase: VB-1006, one charger, EUR 43.95 including shipping, using Stripe's 2685 test card. Customer name, email and billing/shipping addresses reached the order record. Stripe returned Normal risk, score 62.
- Stripe automatically created a product-not-received dispute for that purchase. Creation and funds-withdrawn events were processed; the dispute appeared in the UI.
- Customer help form created C-0003 linked to VB-1006 and returned a working private conversation page.
- About, Pricing, Account, Dashboard, Orders, Complaints, Disputes, Delivery emails, Settings and Help rendered without application errors or horizontal overflow at desktop width.
- Home, Pricing, Account, Dashboard, complaint detail, Delivery emails and dispute detail also fit a 390px viewport. Viewport override reset afterward. This is layout testing, not physical-device testing.
- Unauthenticated requests to live data, stored evidence and order-report APIs returned HTTP 401.
- Previous live checks in this session covered monthly Premium checkout, OpenRouter response drafting, win assessment and delivery-email extraction. These were not rerun unnecessarily during this review.

## Demo limits and remaining checks

- Physical phone barcode/photo journey remains unverified by Codex; Claude owns it.
- Shopify/courier source cards are fixtures. Stripe checkout and dispute ingestion use the real Stripe sandbox API.
- Delivery-email ingestion is paste-and-review, with optional OpenRouter extraction; there is no mailbox connection.
- PDF and email-text export are available; Verity does not submit responses to a bank or send email.
- AI sees text records and photo references; image interpretation and calibrated outcome prediction are not implemented.
- Full Playwright end-to-end suite was not run. Browser checks above used the connected browser; automated totals refer to unit/database tests.
- Radar risk level/score are stored. Dedicated early-fraud-warning ingestion is not implemented.

The review left VB-1006 and C-0003 as clearly labelled demo test records. No real payment or bank submission was made.
