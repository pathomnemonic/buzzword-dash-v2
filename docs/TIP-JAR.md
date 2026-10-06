# In-app tip jar (Android and iOS)

On the website a tip is the plain link in `VITE_TIP_URL`. The stores do not allow an external payment link inside an app, so in the phone apps a tip is a small **consumable in-app purchase** (Google Play Billing / Apple StoreKit 2) through `capacitor-plugin-cdv-purchase`. A tip unlocks nothing and gives no coins; it is consumed at once so the same amount can be given again, and there is nothing to restore.

The code: `js/tipjar.js` (store logic), `js/tipui.js` (the sheet), `js/tips.js` (when to ask: after a good run, from the 5th run, at most weekly, never during a run). If the store has none of the products, nothing about tips appears in the app (no dead button).

## Product ids (must match exactly, in both stores)

| id | Suggested price | Label in the app |
|---|---|---|
| `dxdash_tip_small` | 1.99 | Small coffee |
| `dxdash_tip_medium` | 4.99 | Coffee and a pastry |
| `dxdash_tip_large` | 9.99 | A whole lunch |

Prices shown in the app are read from the store, in the player's own currency. Change prices in the store consoles; no app update is needed. To change labels or add amounts, edit `TIP_PRODUCTS` in `js/tipjar.js`.

## Google Play

1. Play Console → your app → **Monetize with Play → Products → In-app products** (set up a **merchant profile / payments profile** first if asked).
2. **Create product** ×3: id as above, name e.g. "Small coffee tip", description "A thank-you tip. It unlocks nothing.", set the price. **Activate** each.
3. The first release that contains the billing library must be uploaded to a testing track (internal is fine) before purchases work. Add yourself under **Settings → License testing** to buy for free while testing.
4. Data safety: Google processes the payment; the app receives no card details. Nothing new to declare beyond what `store/google-play/policy-answers.md` lists.

## Apple App Store

1. App Store Connect → **Agreements, Tax, and Banking**: accept the **Paid Applications** agreement and add bank and tax details (required before any in-app purchase can be sold).
2. Your app → **Monetization → In-App Purchases → +**: type **Consumable**, reference name and **product id as above**, price, a display name ("Small coffee tip") and description ("A thank-you tip. It unlocks nothing."), plus a review screenshot of the sheet (Settings → About & help → Leave a tip).
3. Submit the three purchases **with the app version** that first contains them (select them under the version's "In-App Purchases and Subscriptions").
4. Test with a **Sandbox** tester (App Store Connect → Users and Access → Sandbox) on a TestFlight or development build.
5. Add the "Leave a tip" description to the reviewer notes in `store/app-store/listing.md` ("tips are optional consumable purchases that unlock nothing").

## Checking it works

1. Install a build from the internal track / TestFlight on a real device (billing does not work in an emulator without Play services, or in a browser).
2. Settings → About & help should show **Support the developer → Leave a tip**. If the row is missing, the store returned none of the products: check ids, that they are **active**, that the app is uploaded to a track, and (iOS) the Paid Applications agreement.
3. Tap an amount: the store sheet opens with the local price. Buy with a test account: the sheet says thank you; buy again to confirm it can be repeated.
4. In analytics: `select * from analytics_v_tip_revenue;` (completed tips by product and currency, before the store's cut) and `analytics_v_tip_funnel` (prompts shown, clicked, dismissed).

## Money, tax, rules

- The stores keep 15% (Play, small business and first $1M; Apple Small Business Program, under $1M) or up to 30%. You are the merchant of record only for taxes you owe on your income; the stores collect and remit sales tax/VAT.
- Do not tie a tip to any in-game benefit (coins, items, removing ads). That would make it a normal in-app item with different rules, and it changes the privacy and review answers.
- A web visitor is still sent to `VITE_TIP_URL` (Ko-fi etc.). The two paths are separate.
