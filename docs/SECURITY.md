# Keeping accounts, saves and payments safe

What protects players, what you must do on your side, and how to check it.

## 1. Database: run in this order, then check

In the Supabase SQL editor run `schema.sql`, `policies.sql`, then whichever of `cohorts.sql`, `discovery.sql`, `pro.sql`, `analytics.sql`, `analytics_views.sql` you use, then **`lockdown.sql` last**. All are safe to run again.

Then run **`database/audit.sql`**. It must return **no rows**. Each row it returns is something a player (or anyone holding the public app key) can reach but should not. Run it after every database change.

Why: Supabase gives every new function and table to the signed-in and signed-out roles by default. Left alone, the functions meant for the payment server (like the one that grants Pro) can be called by any player from the browser console. `lockdown.sql` closes everything, then opens only the short lists the app needs. `tests/unit/dbprivileges.test.js` runs the same check on every change, against a database that behaves like Supabase.

## 2. Supabase settings (cannot be checked from code)

- **Authentication → Providers → Email → Confirm email: ON.** Without it, anyone can make unlimited accounts with made-up addresses, each with its own free 7-day trial.
- **Authentication → Sign In / Providers → Allow anonymous sign-ins: ON** (guests use it). Guests cannot buy, redeem codes or get a trial.
- **Backups.** The free plan has **no backups**. Everything players have earned and bought lives in this one database, so use a plan with daily backups, and point-in-time recovery if you can. This is the only protection against the database itself being lost or damaged.
- Keep the **service role key** out of the website, the repository and chat. It is only for the two Edge Functions (Supabase provides it to them itself).
- Edge Functions: `stripe-webhook` is deployed with `--no-verify-jwt` (Stripe has no login) and refuses anything without a valid Stripe signature; `pro-checkout` is deployed normally.

## 3. Stripe settings

- Webhook events to send to `stripe-webhook`: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`.
- Use a **restricted API key** for `STRIPE_SECRET_KEY` (write: Checkout Sessions, Billing Portal, Refunds; read: Subscriptions, Charges, Invoices, Payment Intents, Prices) rather than the full secret key.
- Keep Radar on. Offer cards (and wallets built on cards); bank debits finish days later, and a purchase that finishes later is still delivered, but cards are simpler for players.
- If a payment ever shows in Stripe but not in the app: the app asks Stripe directly (every ten minutes while a purchase is pending, otherwise twice a day), and **Settings → Dx Dash Pro → Check again** does it at once.

## 4. What the code guarantees (and the tests that prove it)

| Promise | Test |
| --- | --- |
| Functions that grant Pro, items or points cannot be called by a player | `dbprivileges.test.js` |
| A player cannot read or change another player's save, profile or scores | `dbprivileges.test.js`, `database.test.js` |
| Only a validly signed Stripe event can grant anything | `edgefunctions.test.js` |
| The price charged is the server's, never the page's | `edgefunctions.test.js` |
| Refunds, chargebacks, repeats and late events in any order give the same result | `paymentflow.test.js` (400 random orders) |
| Paying twice for one item returns the second payment | `billing.test.js`, `paymentflow.test.js` |
| A refunded lifetime does not end a subscription still paid for | `paymentflow.test.js` |
| A purchase on its way is chased until it arrives | `proweb.test.js` |
| One account's Pro never shows on another's | `proweb.test.js` |
| Progress that was saved is never lost across devices, wipes and conflicts | `syncsimulation.test.js` (3,000 random lives) |
| A smaller save never pushes out the fullest copy, on the device or the server | `storagesafety.test.js`, `database.test.js` |
| A site on the same host cannot read or overwrite the save | `storagesafety.test.js` |

## 5. What cannot be made airtight

The game runs in the player's browser, so a determined player can edit their own device (give themselves a cosmetic, switch on Pro screens locally). They cannot change what the server says they have bought, cannot touch anyone else's data, and the cards and cosmetics they could unlock are all cosmetic or already shipped to the browser. Do not put anything in the client that must stay secret.
