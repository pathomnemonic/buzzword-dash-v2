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

1. **Database.** Run `database/pro.sql` in the Supabase SQL editor (safe to run again), then run `database/lockdown.sql` after it. **This is required**: Supabase lets every signed-in player call new functions by default, so until `lockdown.sql` (or the revokes at the end of each file) has run, the functions that grant Pro could be called by anyone.
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

**Redeem codes** (a contingency, not a sales channel): see "Redeem codes" below. Players enter them in Settings → About & help, folded away at the very bottom ("Have a redeem code?").

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


## The Pro gift

Anyone who pays for Pro (not during the free 7-day trial) can take one free Locker item of their choice, once, ever.
It is tracked in the player's save (`progression.proGiftItem`), so it needs no database change. Items sold for real
money (see "Premium items" below) cannot be taken as the gift.

## Safety nets: paying members are never left without Pro

- A failed or empty answer from the server is never read as "no Pro" (only a real `active: false` is), so a network or server hiccup keeps what the member had.
- A store purchase is not taken back on one wrong "not owned" answer from the store; it has to persist for hours and the paid period has to be over.
- Renewals extend Pro even when they cost nothing (a 100% coupon), and a subscription that arrives without a period end still gets one paid period.
- Two payment events in either order, or the same one twice, end in the same state; a grant never shortens what someone has.
- A refunded lifetime takes back only the lifetime (`pro_revoke_plan`), never a subscription or trial held as well.
- If a payment event never reaches us, the app asks `pro-checkout` (action `sync`) when the server says "no Pro" (at most twice a day, and right after a purchase), which reads the customer's subscriptions and lifetime purchase from Stripe and grants what they hold. One-time purchases now create a Stripe customer so they can be found again.
- A customer saved while Stripe was in test mode does not break live checkout: it starts fresh.
- Buying needs a real account (not a guest), checked in the app and in `pro-checkout`.

After updating: re-run `database/pro.sql`, then `supabase functions deploy pro-checkout` and `stripe-webhook`.


## Premium items (real money)

A few Locker items are sold for money only, with a dollar price on the button (`supabase/functions/_shared/premium.js` lists
them and the prices; the app and the payment function read the same list, so the button and the charge always agree):
five heroes (Attending Arthur $2.99; Anatomy Abby, MRI Mo $2.49; Pharmacist Pip, Night-Shift Nico $1.99), the Dragon Lecturer
monster ($1.49), two maps (Aquarium Imaging Center, DNA Helix Tunnel, $1.49) and three trails (Fire, Neural Sparks, Red Blood
Cells, $0.99). They sort to the bottom of their list, cannot be bought with coins, and cannot be taken as the Pro gift.
Anyone who already owned one, or had reached the level that used to unlock one of the maps, keeps it (a one-time migration).
Anyone who already owned one before this keeps it.

- **How a purchase works.** On the website, tapping the price twice opens a Stripe Checkout page created by `pro-checkout`
  (action `item`; no per-item setup in Stripe: the amount comes from the catalog). The webhook grants the item
  (`pro_grant_item`, stored in the `pro_items` table) and `get_my_pro()` lists the member's items, which the app merges
  into their Locker on every refresh. In the phone apps each item is a one-time store product named
  `dxdash_item_<item id>` (create them in Play Console / App Store Connect); until the store lists one, its button
  reads "Soon" and is disabled. On the web, the app first asks `pro-checkout` (action `capabilities`) whether it
  supports items; an older deployment shows "Soon" and nobody is sent to pay for something it cannot deliver. Every tap says
  something (price confirm, sign-in prompt, "coming soon", or an explained failure).
- **Safety.** A member needs a real account to buy (so the item stays with them), a double purchase is refused, the grant is
  safe to repeat, a lost payment event is put right by the `sync` action (it also finds items), and the app only ever
  adds items: a failed or empty answer cannot remove one. A full refund takes the item back on the server.
- **Adding or changing an item.** Edit `premium.js`. A new store product is needed in the apps for each new item.

After updating: re-run `database/pro.sql` (it adds the `pro_items` table), then redeploy `pro-checkout` and `stripe-webhook`.


## Redeem codes

A code gives one person some days of Pro for free. They are for exceptions: an app-store or press reviewer, a creator, a
teacher, or a member you want to make good with after a billing problem. Nothing in the app asks people to find one, and the
entry box is folded away at the bottom of Settings → About & help, so people do not write to you for them.

**Making a code** (Supabase SQL editor, one line each; it prints the code to hand over):

```sql
SELECT pro_make_code(p_days => 90, p_note => 'reviewer: Jane at Example');          -- one person, 90 days, e.g. DX-7F3A-91C2-0B4E
SELECT pro_make_code(p_days => 30, p_note => 'sorry about the double charge', p_expires_days => 14);
SELECT pro_make_code(p_days => 30, p_note => 'Dr Lee class', p_max_uses => 25, p_code => 'LEE-CLASS');   -- a deliberate group code
```

**How a code is protected.** It works only for an account with a login (an email and password), never a guest, and is tied to
that account the moment it is used. By default (`p_max_uses` = 1) it works for exactly one account, once, then is spent, so
passing it on does nothing. A person can try ten wrong codes an hour. The days are added to whatever Pro they have, never
replacing it. Codes can have an end date.

**Seeing what happened.** In the SQL editor: `SELECT * FROM pro_v_codes;` (all codes and how many times each was used) and
`SELECT * FROM pro_v_redemptions;` (which account used which code, and when).
