# Checking payments work (test mode first, then live)

Do this once in Stripe **test mode** before taking real money, and the first three steps again in **live mode** after you switch.

## 1. Is the webhook wired up? (30 seconds, no payment)

```
WEBHOOK_URL=https://<project>.supabase.co/functions/v1/stripe-webhook \
STRIPE_WEBHOOK_SECRET=whsec_... \
node tools/smoke-webhook.mjs
```
Four PASS lines means the webhook refuses unsigned, wrongly signed and old requests and accepts a correctly signed one. To prove the whole chain into the database too, add `--grant-test <your user id>` with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set; it prints the one statement that removes the test item afterwards.

## 2. A real test purchase (5 minutes)

Use Stripe test cards (any future date, any CVC): `4242 4242 4242 4242` succeeds, `4000 0000 0000 0341` fails on the second charge, `4000 0000 0000 0259` creates a chargeback.

In the website (signed in with an email account, not a guest):
1. Buy a **monthly** plan. Pro should switch on within seconds. Settings → Dx Dash Pro → Manage opens Stripe's page.
2. Cancel it there. The app should say it ends on the date, and Pro should stay until then.
3. Buy a **Locker item** (💎 button, tap twice). It should appear in the Locker. Buy the same item again from a second tab: the second payment should be refunded by itself and the item should still be yours.
4. In the Stripe Dashboard refund the item payment. Within a few minutes (the app checks twice, so open the app twice) the item should disappear from the Locker.
5. Buy **Lifetime**, then refund it. Pro should end.
6. Create a chargeback with the `…0259` card on an item. The item should go; mark the dispute as won in test mode and it should come back.
7. Delete the account with an active subscription: the subscription should be cancelled in Stripe and the account gone. If cancelling fails the account must stay.

## 3. Does the database agree with Stripe?

```
STRIPE_SECRET_KEY=sk_... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node tools/reconcile-stripe.mjs --days 7
```
It prints "Everything matches" or one line per mismatch (paid and not delivered, or given back and still held). It changes nothing. Once you have customers, run it daily. The database also has owner views to look at in the SQL editor: `pro_v_active` (who has Pro), `pro_v_items` (what sells), `pro_v_store` (phone purchases) and `pro_v_recent_events` (webhook activity: if it is empty on a day with sales, the webhook is not arriving).

## 4. Phone-store purchases

Needs real store accounts and test products, so it cannot be scripted:
- **Android**: upload a build to the internal testing track, add yourself as a licensed tester, buy a product (tests are free and cancel quickly). Then, if you turned on server checking (`VITE_IAP_VERIFY=1`, see `docs/PRO.md`), the purchase should appear in `pro_v_store` and on the website for the same account.
- **iOS**: sandbox tester account in App Store Connect; same checks. A sandbox purchase is only known to Apple's sandbox, which the server tries automatically when production does not know it.
