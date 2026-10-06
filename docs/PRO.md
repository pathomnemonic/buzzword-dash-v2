# Dx Dash Pro (built, dormant, launch later)

Pro is a subscription for the study tools. It is **fully built and invisible**: until it is switched on there is no Pro screen, no Settings row, no limit on any feature, and the store is not asked about subscriptions. Launching is mostly a config change, no app release needed (apart from store setup, which needs the app on a track once).

Files: `js/pro.js` (who has Pro, gates, buying), `js/proui.js` (paywall and Settings row), `js/proconfig.js` (the remote switches), `js/iap.js` (the store connection, shared with the tip jar), `database/pro.sql` (web payments, codes, seats), `docs/TIP-JAR.md` (the same store setup for tips).

## What it gates (you choose, in the remote config)

Five features can be limited. Each is `open` (default), `"locked"` (Pro only) or `{ "limit": N, "per": "day" | "week" | "total" }`:

| feature | what it limits | `total` means |
|---|---|---|
| `custom_cards` | creating your own cards | cards in total |
| `anki_import` | importing a deck | cards in one import |
| `offline_pack` | the "play with no connection" download | n/a (use `locked`) |
| `explanations` | the "why" teaching text after a missed card in Study | uses per `day` / `week` |
| `exam_sim` | starting an exam-sim block | blocks per `day` / `week` |

Everything else stays free. **Do not gate things people already have and use** without thinking: use `launchAt` + `grandfather` so players who installed before launch keep chosen features free.

## Launching, step by step

1. **Store products.** Create three auto-renewing subscriptions in both stores (ids must match):
   - `dxdash_pro_yearly` (suggested 29.99/yr, with a 7-day free trial offer for new subscribers)
   - `dxdash_pro_monthly` (4.99/mo)
   - `dxdash_pro_pass3m` (14.99 for 3 months; a 3-month plan on Google, a non-renewing choice is not supported here: use a 3-month subscription period)
   Google Play: Monetize → Subscriptions (base plans and offers; set the trial as an offer on the yearly base plan). Apple: App Store Connect → Subscriptions → a subscription group (introductory offer = free trial), plus the Paid Applications agreement, tax and bank details. Both need the app uploaded (internal track / TestFlight) at least once, and a review screenshot of the Pro screen for Apple.
2. **Server (web payments, codes, schools).** Run `database/pro.sql` in the Supabase SQL editor. Hand out codes: `INSERT INTO pro_codes (code, days, max_uses, note) VALUES ('LAUNCH30', 30, 500, 'launch');`. For a web checkout create a Stripe Payment Link and set `VITE_PRO_WEB_URL` for the web build; a Stripe webhook (checkout.session.completed) calls `pro_grant(client_reference_id::uuid, 365, 'yearly', 'stripe')` with the service key. Players on the web are sent to the link with their account id attached.
3. **Switch on.** Edit `public/remote-config.json`:
   ```json
   "pro": { "enabled": true,
            "plans": ["dxdash_pro_yearly", "dxdash_pro_monthly", "dxdash_pro_pass3m"],
            "gates": { "custom_cards": { "limit": 50, "per": "total" }, "offline_pack": "locked",
                       "explanations": { "limit": 5, "per": "day" }, "exam_sim": { "limit": 2, "per": "week" } },
            "launchAt": 1790000000000, "grandfather": ["custom_cards"] }
   ```
   (`launchAt` is milliseconds since 1970 of launch time.) Players pick it up next time the app opens. To pull Pro back: `"enabled": false`: every limit disappears at once.
   Alternatively build with `VITE_FEATURE_PRO=1` to force it on (testing).
4. **Paperwork, the same day:** add a "Subscriptions" paragraph to `public/privacy.html` and `public/terms.html` (price, auto-renewal, trial, how to cancel in the store, refunds handled by the store), update the Play Data safety / App Store privacy forms (purchase history is handled by the store, not collected by the app), and add the subscription disclosure text Apple requires near the buy button (the paywall already shows price, period, trial and "cancel any time in your store account").
5. **Watch it:** `analytics_v_paywall` (what opened the paywall and how many bought), `analytics_v_pro_revenue`, `analytics_v_pro_gates` (which limits are hit most: raise or lower them), `analytics_v_pro_users`, and `pro_v_active` / `pro_v_codes` in the database. Test price or wording with the experiment system: define `pro_paywall` in `analytics.experiments` and read `variant('pro_paywall')`.

## Trying it before launch

- **Debug build** (`?debug=1`): `window.__pro.setProDebug(true)` pretends to have Pro, `false` pretends not to, `null` clears it. Turn Pro on locally by serving a `remote-config.json` with `"pro": {"enabled": true, ...}` or building with `VITE_FEATURE_PRO=1`.
- **Phone:** use a License tester (Play) or a Sandbox tester (Apple). The paywall lists the store's own prices; buying and Restore purchases work against the test account.

## How Pro status is decided

- Phone: an active store subscription (`store.owned`) for any of the configured plans.
- Server: `get_my_pro()` for the signed-in account (web payment, code, seat).
- The best answer is saved on the device; if the stores/server cannot be reached it is trusted for 3 days, then lapses. A purchase that just completed is trusted at once.
- The app cannot grant itself Pro: tables are closed to it, `redeem_pro_code` is rate-limited (10 wrong guesses an hour), and only `pro_grant` (owner/service role) can add time.

## Not included (decide at launch)

- Server-side receipt validation (a determined user with a rooted phone could fake a local purchase; the cost is a few tips-worth of lost revenue, and RevenueCat/Iaptic can be added later without changing the screens).
- Family sharing, upgrade/downgrade proration copy, and win-back offers: set in the store consoles.
