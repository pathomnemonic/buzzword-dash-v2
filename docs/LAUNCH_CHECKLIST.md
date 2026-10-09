# Launch checklist: what only you can do

Everything the code can do is done and tested. These are the steps that need your accounts, money, devices or decisions. They are in the order I would do them. Boxes you can tick are in the sections below; a "↳" says where the instructions live.

## A. Things that block launch

### A1. Make the live database safe (30 minutes; the most important block)
- [ ] Supabase SQL editor: run `database/schema.sql`, `policies.sql`, then `cohorts.sql`, `discovery.sql`, `pro.sql`, `analytics.sql`, `analytics_views.sql`, then **`lockdown.sql`**. Then run **`audit.sql`**: it must return **no rows**. ↳ `docs/SECURITY.md`. *(Until this is done, any player could call the functions that grant Pro for free.)*
- [ ] Supabase → Authentication: **Confirm email ON**; **Allow anonymous sign-ins ON**; **Allow manual linking ON**; Redirect URLs = your site and `com.pathomnemonic.dxdash://auth` only; custom **SMTP** (the built-in sender allows only a few emails an hour). ↳ `docs/SIGNIN.md`
- [ ] Supabase plan with **daily backups** (the free plan has none). Everything players earned and bought lives in this database.
- [ ] Repository → Settings → Secrets and variables → Actions: variables/secrets `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PRO_WEB_CHECKOUT=1` (once Stripe works), `VITE_SUPPORT_EMAIL` (your support address; shown in the app), `VITE_REVIEW_URL`; optional `VITE_AUTH_PROVIDERS`, `VITE_IAP_VERIFY=1`. The `keepalive` workflow uses the two Supabase values to stop a free project pausing.

### A2. Sign-in providers (1–2 hours)
- [ ] **Google**: OAuth client + consent screen, switch on in Supabase. Set the consent screen to "In production" before launch. ↳ `docs/SIGNIN.md`
- [ ] **Apple**: Services ID, key, switch on in Supabase (the client secret **expires every 6 months**: put a reminder in your calendar). Required for the App Store because Google is offered.
- [ ] **Microsoft** (optional; hidden until switched on).
- [ ] Edge Function secrets for deleting an Apple account cleanly: `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_CLIENT_ID`. ↳ `docs/PRO.md` ("Sign in with Apple and account deletion")

### A3. Payments (2–3 hours)
- [ ] Stripe: business details, bank account, products and Prices for yearly, 3-month, monthly and lifetime; put the four Price ids in the Edge Function secrets (`STRIPE_PRICE_*`), plus `STRIPE_SECRET_KEY` (a **restricted** key), `STRIPE_WEBHOOK_SECRET`, `SITE_URL`. ↳ `docs/PRO.md`
- [ ] Stripe webhook events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`.
- [ ] Deploy the functions: `supabase functions deploy pro-checkout stripe-webhook` (and `iap-verify` if you want phone purchases checked on the server).
- [ ] Run the **test-mode walk-through** (`docs/PAYMENT-CHECKS.md`): `tools/smoke-webhook.mjs`, a real test purchase, refund, chargeback, delete-with-subscription; then repeat the first three steps in live mode. Run `tools/reconcile-stripe.mjs` once a day when you have customers.
- [ ] Tax: decide how you collect sales tax/VAT on web sales (Stripe Tax, or a merchant-of-record). The stores handle it for in-app sales.
- [ ] Have a lawyer read `public/terms.html` and `public/privacy.html` once (especially the digital-content "right to withdraw" wording, refunds and the privacy sections). I wrote them from how the app actually behaves; I am not a lawyer.

### A4. Google Play (Android)
- [ ] Play Console developer account ($25). **New personal accounts must run a closed test with at least 12 testers for 14 days before they can publish**: start this early. ↳ `docs/RELEASE_GUIDE.md`
- [ ] Create the app, upload key and signing (`ANDROID_KEYSTORE_*` secrets), run the Android workflow (it now includes the new `@capacitor/browser` plugin).
- [ ] Create the **store products**: 3 subscriptions + lifetime + 3 tips + **11 Locker items**, exact ids and prices in `docs/PRO.md`.
- [ ] Fill in: data safety (answers in `store/google-play/policy-answers.md`; add email address from Google/Apple/Microsoft sign-in), content rating, target audience (not for children), ads declaration (no ads), account-deletion URL (`.../delete-account.html`), privacy policy URL, listing text and the new screenshots in `assets/store/`.
- [ ] Optional: service account + `iap-verify` secrets and `VITE_IAP_VERIFY=1` (sandbox-test first).

### A5. App Store (iPhone)
- [ ] Apple Developer Program ($99/yr); App Store Connect app; **Paid Applications agreement + tax + banking** (without it, products cannot be sold).
- [ ] Sign in with Apple: Services ID + key (A2). In App Store Connect create the **same products** as on Android (`docs/PRO.md`).
- [ ] Codemagic set-up (`docs/RELEASE_GUIDE.md` Part 2). `codemagic.yaml` has **never been run**: expect to fix a line or two on the first build. It now adds the privacy manifest and builds iPhone-only.
- [ ] Listing: `store/app-store/listing.md` (updated), screenshots `assets/store/appstore/` (1290×2796) and `appstore-6.5/`, App Privacy answers (same file), age rating, reviewer notes, export compliance (already "no non-exempt encryption").
- [ ] **Test on a real iPhone via TestFlight** (see D): Sign in with Apple, Google sign-in in the Safari sheet, a sandbox purchase, restore purchases, delete account.

### A6. Real devices (nobody can do this for you)
- [ ] Run `docs/DEVICE-TESTING.md` on at least one Android phone and one iPhone, including: first launch, a run, sign-in with each provider, buy and restore, airplane mode, kill and relaunch (progress kept), delete account.

## B. Things that fell through the cracks in our conversation

- [ ] **Old `buzzword-dash` repository.** It shares browser storage with v2 on the same host and still runs older code, which is the most likely way a player's save got wiped. I could not change that repository from here (the environment blocked editing outside this project), so I wrote `tools/sync-standalone.mjs` and tested it on a copy: lint, types and the full unit suite pass there. Run `node tools/sync-standalone.mjs ../buzzword-dash`, then the checks it prints, then push. Also switch that repository's Pages source to **GitHub Actions** (Settings → Pages). Or tell me to do it and grant the permission.
- [ ] **Re-run the database files and redeploy both Edge Functions** after every update from me (the safety changes, the item/refund changes and the Apple/store tables all need `pro.sql` + `lockdown.sql`).
- [ ] **Check the live site really deployed.** The Pages deploy was silently failing for several of my pushes (a type check I did not run). It is fixed and the latest deploy succeeded; after any future push look at the Actions tab for a green "Deploy to GitHub Pages".
- [x] Firefox browser tests: the failures were a real bug for anyone without WebGL (the "graphics not available" notice stretched the PLAY block and pushed Speed off screen). Fixed, with a test. Firefox/Safari CI results should be re-checked after the next push; the WebKit job is very slow.
- [ ] A **support email and a name** for the privacy policy, terms and stores. Right now they point to GitHub issues, which is not acceptable for the stores.
- [ ] **Medical content review.** A clinician should skim a sample of the 3,010 cards for errors before launch (`docs/CARD-QUALITY.md` has what was automated).
- [ ] **Moderation routine.** Reports land in the `moderation_queue` view; decide who looks, how often, and the response (`docs/MODERATION.md`). Stores ask about this.
- [ ] **Delete requests by email.** Decide how you answer (the in-app delete does it itself).
- [ ] **Feature flags to revisit when you have players:** global leaderboard, ranked matches, cohorts, discovery (all built, hidden; `js/features.js`).
- [ ] **Pro limits.** `public/remote-config.json` has Pro on; the free tier is 300 cards. Re-read the gates once with the pricing you actually set.
- [ ] **Analytics.** Decide whether you want to look at the owner views (`docs/ANALYTICS-GUIDE.md`) and who does.
- [ ] **Trademarks and names.** "Dx Dash" availability and the disclaimer about NBME/FSMB/NBOME are in the app and ads; check the name in both stores.
- [ ] **A short "what's new" and a launch plan** (`docs/marketing/`): the ads were regenerated with the current screens, but the copy still needs your voice.

## C. Decisions I made that you may want to change
- iPhone-only for the first iOS release (no iPad screenshots or layout review needed). Remove the step in `codemagic.yaml` to allow iPad; then you also need iPad screenshots.
- Microsoft sign-in is on by default but hidden until switched on in Supabase.
- A refunded or charged-back item is taken back from the player's device after two checks in a row; paying twice for one item refunds the second payment automatically.
- Phone-store purchase checking on the server is **off** until you set the secrets and `VITE_IAP_VERIFY=1`.

## D. iOS things I could not test (watch for these)
- Sign in with Apple/Google/Microsoft opens in the in-app Safari sheet and returns to the app through the `com.pathomnemonic.dxdash://auth` link. iOS may ask "Open in Dx Dash?" once; if it is clumsy, the fix is Universal Links.
- `localStorage` in an iPhone web view can be cleared by the system under storage pressure. The app now keeps a second copy of the save in a file and offers it back; check this by clearing the app's website data in Settings and relaunching.
- Keyboard, safe areas (notch, home bar) and the 3D performance on an older iPhone.
