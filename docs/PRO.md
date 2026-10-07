# Dx Dash Pro (ships with the first release)

Pro is on from day one. The reasoning, prices and numbers are in [MONETIZATION-STRATEGY.md](MONETIZATION-STRATEGY.md). This page is how it works and how to set it up.

**Free:** the whole game, friends, leaderboards, and **300 cards (20 per subject)**.
**Pro:** all 3,010 cards plus the study tools (detailed stats, Anki import, unlimited custom cards, every explanation, unlimited exam-sim blocks, offline pack).
**Full Library:** a cheaper one-time purchase that unlocks only the cards.

Files: `js/pro.js` (who has Pro, gates, buying), `js/proui.js` (paywall, "unlock all cards" strip, Settings row), `js/proconfig.js` (defaults and the remote switches), `js/iap.js` (the store connection shared with the tip jar), `js/freecards.js` (the 300 free card ids), `js/cardhub.js` (the playable pool follows the lock), `database/pro.sql` (web payments, codes, school seats), `tools/pick-free-cards.mjs` (how the 300 were chosen).

## The rule that protects you: it only limits when there is a way to pay

`proLive()` is true only when Pro is switched on **and** something can be bought:
- **Phone apps:** once the store answered with the Pro products (the answer is remembered for the next launch).
- **Web:** when `VITE_PRO_WEB_CHECKOUT=1` (the Stripe checkout functions are live; see Web payments below), or the older `VITE_PRO_WEB_URL` (a single Stripe Payment Link).
Otherwise nothing is limited and no Pro screen shows. So a local build, a store listing whose products are not set up yet, or the web before you add a payment link all behave as fully free. Nobody is ever locked out of something they cannot buy.

## Products to create (ids must match)

| id | Type | Suggested US price |
|---|---|---|
| `dxdash_pro_yearly` | auto-renewing subscription | 19.99 / year |
| `dxdash_pro_pass3m` | auto-renewing subscription, 3-month period | 7.49 |
| `dxdash_pro_monthly` | auto-renewing subscription, 1 month | 3.49 |
| `dxdash_pro_lifetime` | **non-consumable** (one purchase) | 39.99 |
| `dxdash_tip_small` / `_medium` / `_large` | consumable tips (see TIP-JAR.md) | 1.99 / 4.99 / 9.99 |

**Google Play:** Monetize → Subscriptions (one subscription "Dx Dash Pro" with three base plans yearly / 3-month / monthly; no store trial offer, the free trial is the account's, see below), an In-app product for Lifetime. **Apple:** one subscription group "Dx Dash Pro" holding the three subscriptions (no introductory offer), a non-consumable in-app purchase for Lifetime; accept the Paid Applications agreement, tax and bank details; attach the purchases to the version you submit and add a review screenshot of the paywall. Both stores need a build uploaded (internal track / TestFlight) before purchases work.

## The free trial (every account)

Everyone who signs in with an account (not a guest) gets **7 days of Pro, once, with no card and nothing to cancel**. The app starts it by itself the first time it sees the account has not had one (`start_my_trial()` in `database/pro.sql`; one row per account in `pro_trials`), on the website and in the phone apps alike, and only once Pro is live. Guests do not get it: it is the reason to create an account. When it ends the player goes back to the free version (300 cards) and can subscribe. Because the trial is the account's, do not also add a trial to the store subscriptions or to Stripe.

## Web payments, codes and seats

On the website the paywall shows your real Stripe prices and sends the player to Stripe's own payment page. Stripe then tells a small server function, which turns Pro on in the database; the page asks again when the player comes back. Nothing about payment is stored in the app. Four products work: yearly, 3-month pass, monthly and Lifetime. (There is no Full Library offer any more; Pro is the one thing for sale.) Renewals extend Pro by themselves, cancelling is done on Stripe's page (Settings → Dx Dash Pro → Manage), and a full refund of Lifetime takes it back.

**One-time setup (about an hour):**

1. **Database.** Run `database/pro.sql` in the Supabase SQL editor (safe to run again).
2. **Stripe products.** In Stripe (start in Test mode) create four Products with a Price each, matching the table above: yearly (recurring every year), 3-month pass (recurring every 3 months), monthly (recurring monthly), Lifetime (one time). Do not add a free trial in Stripe: the trial is built into accounts. Copy each **Price id** (`price_...`). The customer portal (where subscribers cancel) needs no setup: the function creates its own settings the first time someone taps Manage subscription, unless you have saved your own in the Dashboard.
3. **Deploy the two functions** (needs the [Supabase CLI](https://supabase.com/docs/guides/cli), logged in and linked to your project):
   ```
   supabase functions deploy pro-checkout --use-api
   supabase functions deploy stripe-webhook --use-api
   ```
4. **Function secrets** (Supabase dashboard → Edge Functions → Secrets, or `supabase secrets set ...`):
   `STRIPE_SECRET_KEY` (Stripe → Developers → API keys), `SITE_URL` (your site address with no slash, e.g. `https://pathomnemonic.github.io/buzzword-dash-v2`), and one Price id each: `STRIPE_PRICE_YEARLY`, `STRIPE_PRICE_PASS3M`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_LIFETIME` (leave out any you do not want to sell).
5. **Webhook.** In Stripe → Developers → Webhooks add the endpoint `https://<your-project>.supabase.co/functions/v1/stripe-webhook`, choose the events `checkout.session.completed`, `invoice.paid` and `charge.refunded`, and save its **Signing secret** as the function secret `STRIPE_WEBHOOK_SECRET`.
6. **Switch it on.** In GitHub add the repository variable `VITE_PRO_WEB_CHECKOUT` = `1` (Settings → Secrets and variables → Actions → Variables) and re-run the deploy. Until you do, the website behaves as fully free with no Pro screens. (`VITE_SUPABASE_URL` must be set too; it already is for the leaderboard.)
7. **Test.** With Stripe in Test mode, open the site, tap a locked section → a plan → pay with card `4242 4242 4242 4242` (any future date and CVC). You should land back on the game with "Welcome to Dx Dash Pro!". Then switch Stripe to Live mode, swap the live key, Price ids and webhook secret into the function secrets, and you are selling.

Notes: web Pro belongs to an **account**, so a guest is told to create one first (Friends → Account) or they lose it with their browser data. A subscription runs to the end of the paid period plus two days of grace. The same person can also hold Pro from the phone stores; whichever ends last wins. You see everything in Stripe, and who has Pro in the database views `pro_v_active`.

Files: `supabase/functions/pro-checkout` (prices, start checkout, billing portal), `supabase/functions/stripe-webhook`, `supabase/functions/_shared/billing.js` (all the rules, unit-tested in `tests/unit/billing.test.js`), `database/pro.sql`, and in the app `js/pro.js` (`webPlans`, `webBuy`, `webManage`, `waitForWebPayment`) and `js/proui.js` (the website paywall).

The old way, a single Stripe Payment Link in `VITE_PRO_WEB_URL`, still works if you set that instead (no plan choice, no Manage button; you call `pro_grant` yourself or from your own webhook).

**Promo and seat codes:** `INSERT INTO pro_codes (code, days, max_uses, note) VALUES ('LAUNCH30', 30, 500, 'launch week');`. Players enter them on the paywall ("Have a code?"). Use for creators, ambassadors, schools.

## Changing what is limited (no release)

Edit `public/remote-config.json`:
```json
"pro": {
  "enabled": true,
  "plans": ["dxdash_pro_yearly", "dxdash_pro_pass3m", "dxdash_pro_monthly", "dxdash_pro_lifetime"],
  "library": "dxdash_library",
  "gates": {
    "card_library": "locked",
    "analytics_detail": "locked",
    "anki_import": "locked",
    "offline_pack": "locked",
    "custom_cards": { "limit": 25, "per": "total" },
    "explanations": { "limit": 8, "per": "day" },
    "exam_sim": { "limit": 1, "per": "week" }
  }
}
```
A gate is `"open"`, `"locked"`, or `{ "limit": N, "per": "day" | "week" | "total" }`. `"enabled": false` switches Pro off entirely (everything free). `launchAt` plus `grandfather` keeps chosen features free for people who installed earlier (not needed at first release).

## Shared games use the free cards for everyone

The Daily, challenges, the weekly Gauntlet and Versus deal from the free 300 for every player, so a Pro player and a free player always see the same questions and Versus can verify both phones hold the same pool. (Study, Endless, Flashcards and the exam sim use everything a player owns.)

## The free 300

Chosen by `tools/pick-free-cards.mjs`: 20 per subject, spread across the three difficulty levels and the question types, never flashcard-only cards. The list in `js/freecards.js` is **fixed**: do not regenerate it after launch, or cards move in and out of the free set. A test checks it is 300 distinct existing cards, 20 per subject.

## Where players meet Pro

- A **"300 of 3,010 cards free · UNLOCK"** strip on the subject picker, the card browser and every third results screen.
- Locked sections of Stats ("🔒 Pro") and the report export.
- A limit being hit (Anki import, offline pack, the 26th custom card, the 9th explanation of the day, the second exam block of the week).
- Settings → About & help → Dx Dash Pro.
Never during a run, never on first launch.

## Trying it

- `?debug=1`: `window.__pro.setProDebug(true|false|null)` pretends to have Pro or not; `localStorage.dx_pro_force_sell = '1'` pretends the web can sell (to see the paywall and limits without a payment link).
- Phone: a License tester (Play) or Sandbox tester (Apple). The paywall lists the store's own prices; Buy and Restore work against the test account.

## How status is decided

Phone: an active store subscription or the Lifetime purchase (`store.owned`), and the Library purchase for cards. Server: `get_my_pro()` for the signed-in account. The best answer is saved on the device and trusted for 3 days offline (Lifetime never expires). A purchase that just completed is trusted at once. The app cannot grant itself Pro: the tables are closed to it and `redeem_pro_code` allows 10 wrong guesses an hour.

## Analytics

`paywall_viewed`, `paywall_action` (plan_selected, purchase_started, purchased, cancelled, failed, restore_*, code_*, web_opened, closed), `pro_gate_hit`, `pro_status`. Views: `analytics_v_paywall` (funnel by trigger and variant), `analytics_v_pro_revenue`, `analytics_v_pro_gates`, `analytics_v_pro_users`, and in the database `pro_v_active`, `pro_v_codes`.

## Paperwork the same day

The Subscriptions paragraphs are already in `public/privacy.html` and `public/terms.html`, and `store/` has the product list for both consoles. Still do by hand: (price, auto-renewal, trial, cancel in the store, refunds are the store's), update the Play Data safety and App Store privacy forms (purchases are handled by the store), and keep the disclosure text next to the buy button (price, period, trial, "cancel any time in your store account").

## Not included

Server-side receipt validation (add RevenueCat or Iaptic later without changing the screens), family sharing, win-back and upgrade offers (set in the store consoles), and a Library-to-Pro upgrade credit.


## The monthly Locker gift

Anyone with Pro (not during the free 7-day trial) can take one free Locker item of their choice each month. The months are counted from when
their Pro began (`pro_entitlements.started_at`, returned by `get_my_pro()` as `since`): a member who joined on the 12th gets
a new pick on the 12th of every month. The start date is kept across renewals, and begins again after a lapse or when a
trial turns into a purchase (so the first gift comes with the first purchase). Re-run `database/pro.sql` after updating (it adds the column; running it again is safe).
