# Stripe bonus demonstration

Verity Premium costs **EUR 2.49 per month**. Core order, complaint and evidence tools remain free. Premium adds AI email extraction, complaint analysis, bank-response drafting and win-likelihood estimates. Monthly pricing suits small shops with ongoing support work without requiring an annual commitment.

## What to show judges

1. Open `/pricing`: show the price, included features and upgrade link.
2. As the workspace owner, open `/account`. A Free workspace can start Stripe-hosted Checkout using the Upgrade button. The server creates a Checkout Session in subscription mode with EUR 249 cents recurring monthly. Only test keys are accepted.
3. Complete sandbox Checkout using test card `4242 4242 4242 4242`, a future expiry and any CVC. Never use a real card. An existing active workspace already has a completed payment; show that record without creating another subscription.
4. On return, Verity retrieves the Checkout Session from Stripe, verifies the paid status and workspace/subscription ownership, and records the subscription. Account shows the successful sandbox transaction, amount, invoice, subscription and Premium access outcome. Open the dashboard and demonstrate an AI feature.
5. In the matching Stripe sandbox, show the paid invoice and active subscription using the references below. Subscription creation by itself is insufficient: show the paid invoice too.

## Verified existing transaction — 10 October 2026

- Checkout: `cs_test_a11sjhHt1BdeCspKpA105fxHHcswzak1kbpVCg3QvAmAzbhAOuMiAS3zZv`
- Checkout status: complete; payment status: paid; livemode: false.
- Subscription: `sub_1UP0dW13MwqDOsVMACAznB1V`
- First invoice: `in_1UP0dV13MwqDOsVM6oAwVTVZ`
- Invoice status: paid; amount paid: EUR 2.49.
- Account visibly shows Active Premium and unlocked AI features.

These were re-read from Stripe's sandbox API, not fabricated demo flags. No new charge was created during this verification. Judges make the final scoring decision.
