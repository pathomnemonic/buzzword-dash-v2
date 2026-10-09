# Launch checklist: what only you can do

Everything the code can do is done and tested. This page is the click-by-click list of what needs **your** accounts, money, devices or decisions. Do it top to bottom: each part says what you need first and how you know it worked.

**Read this once before you start**

- **Websites change.** Supabase, Stripe, Google, Apple and the stores rename buttons and move menus. Where a name here does not match your screen, look for the closest one. If you are stuck, tell me exactly what you see on screen (no passwords or keys) and I will tell you where to click.
- **Never paste a secret into chat, a GitHub issue or a file in the repo.** Secrets are: Stripe secret keys (`sk_…`, `rk_…`, `whsec_…`), Supabase `service_role` key, the Apple `.p8` file, the Android keystore and its passwords, Google client secrets. Paste them only into the box the instructions name. The anon key and `VITE_` variables are public and are fine.
- **Keep a private note** (a password manager is ideal) with: the Supabase project reference, each provider's client ID, where each key file is saved, and the date each expires.
- **Test mode first.** Stripe, Apple and Google all have a way to practise without real money. Practise first, then switch to live.
- **Words used here.** *Supabase* is the online database and sign-in service behind the game. *Edge Function* is a small server program stored in Supabase. *Secret* is a private setting for a server program. *Variable* is a public build setting in GitHub. *The site* is the web version at `https://pathomnemonic.github.io/buzzword-dash-v2/`.

**Where things stand (9 Oct 2026)**

| Done | Still to do |
| --- | --- |
| Code, tests, store text, screenshots, legal pages, old-repo sync | Part 1 onward |
| **1.1 Database files run, `audit.sql` returned no rows** | |

---

## Part 1: The online backend (about 1 hour)

### 1.1 Database (done), and how to repeat it
You ran `schema.sql`, `policies.sql`, `cohorts.sql`, `discovery.sql`, `pro.sql`, `analytics.sql`, `analytics_views.sql`, `lockdown.sql`, then `audit.sql` (no rows). **Repeat this whenever I tell you a `database/` file changed:**
1. Supabase dashboard (supabase.com/dashboard) → click your project.
2. Left sidebar → **SQL Editor** → **New query**.
3. Open the file from the repo on GitHub (github.com/pathomnemonic/buzzword-dash-v2 → `database` folder → file → **Raw** → select all → copy). Paste into the editor → **Run**. Run only the files I name, in the order above. Always finish with `lockdown.sql` and then `audit.sql`.
4. `audit.sql` must say "Success. No rows returned". Any rows: copy them to me.

### 1.2 Supabase sign-in settings
Supabase dashboard → your project → left sidebar → **Authentication**.
1. **Sign In / Providers** (may be called just *Providers*):
   - Click **Email** → make sure it is **Enabled** → turn **Confirm email** ON → **Save**.
   - On the same page (or in *Authentication → Sign In / Providers → User Signups*): turn ON **Allow new users to sign up**, **Allow anonymous sign-ins** and **Allow manual linking**. Save each.
2. **URL Configuration**:
   - **Site URL**: `https://pathomnemonic.github.io/buzzword-dash-v2/`
   - **Redirect URLs** → **Add URL**, one at a time: `https://pathomnemonic.github.io/buzzword-dash-v2/` and `com.pathomnemonic.dxdash://auth`. Nothing else (no `localhost`, no wildcards) once you are live.
   - Save.
3. **Email sending (SMTP).** Supabase's built-in sender allows only a few emails an hour, so sign-up and sign-in-link emails will fail once people arrive.
   - Make a free account at an email provider such as Resend (resend.com) or Postmark, verify your sending domain or address (they give you step-by-step DNS records; if you have no domain, use the provider's own test address while testing, and a real address before launch), and create an **SMTP** user.
   - Supabase → **Authentication → Emails → SMTP Settings** (older dashboards: *Project Settings → Authentication → SMTP*) → turn on **Enable custom SMTP** → fill sender email, sender name ("Dx Dash"), host, port, username, password → **Save**.
   - Test: sign up on the site with a real address and check the email arrives (and is not in spam).
4. **Email templates** (Authentication → Emails → Templates): open *Confirm signup* and *Magic Link*. Change nothing unless you want your own wording; keep the `{{ .ConfirmationURL }}` link in each.
5. **Backups**: Supabase dashboard → **Database → Backups**. If it says daily backups need a paid plan, go to your organization (top-left name) → **Billing** → change the project to the **Pro** plan ($25/month). Everything players earned and bought is in this database. After upgrading, return to **Database → Backups** and confirm daily backups show.
6. **Find your project reference** (you need it later): **Project Settings** (gear, bottom of the sidebar) → **General** → **Reference ID**, 20 letters. Your project address is `https://<reference>.supabase.co`.
7. **Find your two public keys** (also needed later): **Project Settings → API** (newer dashboards: *API Keys*). Copy the **Project URL** and the **anon / public** key (newer name: *publishable key*). Do **not** use the `service_role` / *secret* key for anything in Part 2.

**How you know it worked:** on the site, make an account with email and password; you get a confirmation email; clicking it brings you back to the game signed in.

### 1.3 Support email and public name
The stores, the privacy policy and the terms need a real contact.
1. Create an address players can write to, e.g. `support@yourdomain` or a dedicated Gmail like `dxdash.support@gmail.com`.
2. Decide the name shown as the publisher/seller (your name or your business name).
3. **Done:** the support address is `patho.mnemonic1@gmail.com` and it is now in `public/privacy.html`, `public/terms.html`, `public/delete-account.html` and the store text. It is shown publicly, and a free Gmail address is fine to start; switch to an address on your own domain later if you buy one. Remember to set the GitHub variable `VITE_SUPPORT_EMAIL` to it (2.1) so the in-app feedback form uses it too.

### 1.4 Supabase command-line tool (needed for Part 4; do it now to save time)
1. Install Node.js 20 or newer from nodejs.org if you do not have it (`node -v` in a terminal should print a version).
2. **Do not** run `npm install -g supabase`: Supabase does not support that. Use one of:
   - Any computer: no install, just put `npx supabase@latest` where the guide says `supabase`.
   - Mac: `brew install supabase/tap/supabase`. Windows: install Scoop, then `scoop bucket add supabase https://github.com/supabase/scoop-bucket.git` and `scoop install supabase`.
3. In a terminal, in the folder where you cloned `buzzword-dash-v2`: `npx supabase@latest login` (a browser tab opens; approve), then `npx supabase@latest link --project-ref <your Reference ID>` (it asks for the database password you chose when you created the project; reset it under *Project Settings → Database* if you lost it).

---

## Part 2: GitHub settings and the live site (about 20 minutes)

### 2.1 Build variables
GitHub → `pathomnemonic/buzzword-dash-v2` → **Settings** → **Secrets and variables** → **Actions** → tab **Variables** → **New repository variable**. Add each (name exactly, then value):

| Name | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | the Project URL from 1.2 step 7 |
| `VITE_SUPABASE_ANON_KEY` | the anon / publishable key from 1.2 step 7 |
| `VITE_SUPPORT_EMAIL` | your support address from 1.3 |
| `VITE_REVIEW_URL` | leave for now; add the store page link after launch |
| `VITE_PRO_WEB_CHECKOUT` | **leave unset until Part 4 works**, then `1` |
| `VITE_AUTH_PROVIDERS` | leave unset (default is Google, Apple, Microsoft). Never create it with an empty value |
| `VITE_IAP_VERIFY` | leave unset unless you do 6.5 |

(The `keepalive` workflow uses the two Supabase values to stop a free project pausing.)

### 2.2 Serve the site from GitHub Actions
GitHub → the repo → **Settings → Pages** → **Build and deployment → Source** → choose **GitHub Actions**. Do the same in the old `buzzword-dash` repository (**Settings → Pages**).

### 2.3 Redeploy so the variables take effect
GitHub → **Actions** tab → left list **Deploy to GitHub Pages** → **Run workflow** (button on the right) → branch `main` → **Run workflow**. Wait for the green tick (about 4 minutes). Open the site and refresh.

**Check:** on the site, Friends → Account shows the sign-in form, and a new account can be created.

---

## Part 3: Sign-in with Google, Apple and Microsoft (about 2–3 hours)
Allow time for Apple: it needs the paid Apple account (6.2). Do Google first.

### 3.1 Google
1. Go to console.cloud.google.com, sign in, click the project picker (top bar) → **New project** → name it "Dx Dash" → **Create** → make sure it is selected.
2. Left menu (☰) → **APIs & Services** → **OAuth consent screen** (new layout: **Google Auth Platform**). Click **Get started** / **Configure consent screen**.
   - App name: `Dx Dash`. User support email: your support email. Audience/User type: **External**. Developer contact: your email. Agree → **Create**.
   - **Branding**: add the app logo (`assets/store/play-icon-512.png` works), **Application home page** = the site, **Privacy policy link** = `https://pathomnemonic.github.io/buzzword-dash-v2/privacy.html`, **Terms** = `.../terms.html`, **Authorized domains**: just `pathomnemonic.github.io` (the one Google accepts; you cannot add `supabase.co` because you do not own it, and you do not need to: the Supabase address goes in the OAuth client's redirect URI in step 3, which is checked separately).
   - **Data access / Scopes**: add only `.../auth/userinfo.email`, `.../auth/userinfo.profile` and `openid`. These need no extra Google review.
   - **Audience**: click **Publish app** / **Make external → In production** and confirm. (While it says "Testing", only listed test users can sign in.)
3. Left menu → **Clients** (older: **Credentials → + Create credentials → OAuth client ID**) → **Create client**:
   - Application type: **Web application**. Name: "Dx Dash web".
   - **Authorized redirect URIs** → **Add URI**: `https://<your Reference ID>.supabase.co/auth/v1/callback`
   - **Create**. A box shows the **Client ID** and **Client secret**. Copy both (the secret can be shown again under the client's page).
4. Supabase → **Authentication → Sign In / Providers → Google** → turn ON → paste the Client ID and Client secret → **Save**.

**Check:** on the site, Friends → Account → **Continue with Google** → choose an account → you return signed in. If you see "redirect_uri_mismatch", the URI in step 3 is not exactly the one above (https, your reference, `/auth/v1/callback`, no trailing slash).

### 3.2 Apple (needs the Apple Developer account from 6.2)
1. developer.apple.com/account → **Certificates, Identifiers & Profiles** → **Identifiers**.
2. **App ID** (for the iPhone app): click **+** → **App IDs** → **App** → Continue. Description "Dx Dash", Bundle ID **Explicit** `com.pathomnemonic.dxdash`. Under **Capabilities** tick **Sign in with Apple**. Continue → **Register**. (If it already exists from 6.2, open it, tick the capability and **Save**.)
3. **Services ID** (for the website): click **+** → **Services IDs** → Continue. Description "Dx Dash web", Identifier `com.pathomnemonic.dxdash.web` → Continue → **Register**. Click it in the list → tick **Sign in with Apple** → **Configure**:
   - Primary App ID: Dx Dash (the one from step 2).
   - **Domains and Subdomains**: `<your Reference ID>.supabase.co` (no https).
   - **Return URLs**: `https://<your Reference ID>.supabase.co/auth/v1/callback`
   - **Next → Done → Continue → Save.**
4. **Key**: left menu **Keys** → **+**. Name "Dx Dash sign in". Tick **Sign in with Apple** → **Configure** → pick the Primary App ID → Save → Continue → **Register**. **Download** the `.p8` file now (Apple lets you download it **once**). Note the **Key ID** shown (10 characters). Keep the file somewhere private and back it up.
5. Find your **Team ID**: developer.apple.com/account → **Membership details** → Team ID (10 characters).
6. Make the secret Supabase needs. In a terminal in the repo folder:
   ```
   node tools/apple-client-secret.mjs --team <Team ID> --key-id <Key ID> --services-id com.pathomnemonic.dxdash.web --p8 <path to the .p8 file>
   ```
   It prints one long line (the secret) and the date it expires (about 6 months away). Copy the line.
7. Supabase → **Authentication → Sign In / Providers → Apple** → turn ON → **Client IDs** = `com.pathomnemonic.dxdash.web` (add `com.pathomnemonic.dxdash` after a comma too: that is the iPhone app) → **Secret Key** = the long line → **Save**.
8. **Put a reminder in your calendar for 5 months from today: run step 6 again and paste the new secret in step 7.** When it expires, Apple sign-in silently stops working.
9. Deleting accounts cleanly (Apple rule) needs four more secrets later, in 4.2.

**Check:** on the site, **Continue with Apple** opens Apple's page and returns signed in. (Full iPhone checks are in 6.2.)

### 3.3 Microsoft (optional; the button stays hidden until you finish this)
1. portal.azure.com (sign in with any Microsoft account) → search **Microsoft Entra ID** → **App registrations** → **+ New registration**.
   - Name: Dx Dash. **Supported account types**: *Accounts in any organizational directory and personal Microsoft accounts*.
   - **Redirect URI**: platform **Web**, value `https://<your Reference ID>.supabase.co/auth/v1/callback` → **Register**.
2. On the app's **Overview** page copy **Application (client) ID**.
3. **Certificates & secrets** → **New client secret** → description, 24 months → **Add** → copy the **Value** immediately (not the "Secret ID"). Put an expiry reminder in your calendar.
4. **Token configuration** → **+ Add optional claim** → token type **ID** → tick **email** → Add (accept the prompt to add the Graph email permission). Without it Microsoft may hand back no email.
5. Supabase → **Authentication → Sign In / Providers → Azure** → turn ON → Application (client) ID, the secret **Value**, and **Azure Tenant URL** = `https://login.microsoftonline.com/common` → **Save**.

### 3.4 Check that logging in combines accounts properly
Sign up with email/password using address X, sign out, then **Continue with Google** using the same X: you should land in the same account with the same coins and purchases.

---

## Part 4: Payments with Stripe (about half a day, plus Stripe's verification)
You need the support email (1.3) and Part 1 and 2 done. Stay in Stripe's **Test mode** (a switch/toggle at the top of the Stripe dashboard, labelled *Test mode* or *Sandbox*) until 4.7.

### 4.1 Stripe account and products
1. dashboard.stripe.com → sign up and verify your email. To take live payments Stripe will ask for business details, an ID check and a bank account (**Settings → Business → Account details / Activate your account**). Start this now; it can take days.
2. With **Test mode** on: left menu **Product catalog** → **+ Add product**. Create four products (name, then price). Do **not** add a free trial in Stripe; the trial is built into accounts.

   | Product name | Price | Billing |
   | --- | --- | --- |
   | Dx Dash Pro – Yearly | $19.99 | Recurring, every **year** |
   | Dx Dash Pro – 3 months | $7.49 | Recurring, every **3 months** (choose *Custom* interval) |
   | Dx Dash Pro – Monthly | $3.49 | Recurring, every **month** |
   | Dx Dash Pro – Lifetime | $39.99 | **One time** |

   (These are the suggested prices from `docs/PRO.md`; change them if you decide differently, and tell me so the app text matches.)
3. Open each product → under **Pricing**, click the price row (or its ⋯ menu) → **Copy price ID** (starts `price_…`). Paste the four ids into your private note labelled yearly / 3-month / monthly / lifetime.
4. **Tax**: Stripe dashboard → **Settings → Tax** (or **Tax** in the menu). Either turn on **Stripe Tax** and add where you must collect (it guides you), or use a merchant-of-record service. The app stores handle tax for in-app sales themselves. If unsure, ask an accountant before going live.

### 4.2 Server secrets
Supabase → **Edge Functions** (left sidebar) → **Secrets** tab (or run `npx supabase@latest secrets set NAME=value` for each). Add:

| Secret name | Value |
| --- | --- |
| `SITE_URL` | `https://pathomnemonic.github.io/buzzword-dash-v2` (no slash at the end) |
| `STRIPE_PRICE_YEARLY` | the yearly price id |
| `STRIPE_PRICE_PASS3M` | the 3-month price id |
| `STRIPE_PRICE_MONTHLY` | the monthly price id |
| `STRIPE_PRICE_LIFETIME` | the lifetime price id |
| `STRIPE_SECRET_KEY` | a **restricted** key, made in 4.3 |
| `STRIPE_WEBHOOK_SECRET` | from 4.5 |

(Supabase already provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to functions; you do not add them.)
For Apple account deletion (iPhone rule), also add: `APPLE_TEAM_ID` (Team ID), `APPLE_KEY_ID` (Key ID), `APPLE_PRIVATE_KEY` (open the `.p8` in a text editor, copy **all** of it including the BEGIN and END lines), `APPLE_CLIENT_ID` (`com.pathomnemonic.dxdash.web`).

### 4.3 The restricted Stripe key
Stripe → **Developers → API keys** → **+ Create restricted key**. Name "Dx Dash functions". Set permissions:
- **Write**: Checkout Sessions, Customer portal (Billing portal), Refunds, Subscriptions.
- **Read**: Charges, Invoices, PaymentIntents, Prices, Customers.
- Everything else: **None**.
Create → copy the key (`rk_test_…`) once → paste into the `STRIPE_SECRET_KEY` secret. A restricted key limits the damage if it ever leaks.

### 4.4 Deploy the functions
In a terminal in the repo folder:
```
npx supabase@latest functions deploy pro-checkout --use-api
npx supabase@latest functions deploy stripe-webhook --use-api
```
Each prints "Deployed". (Deploy `iap-verify` too only if you do 6.5.) Repeat this whenever I tell you a file under `supabase/functions/` changed.

### 4.5 The webhook (how Stripe tells your server a payment happened)
1. Stripe → **Developers → Webhooks → + Add endpoint** (newer: **Add destination → Webhook endpoint**).
2. Endpoint URL: `https://<your Reference ID>.supabase.co/functions/v1/stripe-webhook`
3. Select these events (search for each): `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`.
4. **Add endpoint**. On the endpoint page click **Reveal** under **Signing secret** (`whsec_…`) → copy → paste into the `STRIPE_WEBHOOK_SECRET` secret (4.2).
5. After changing any secret, redeploy both functions (4.4) so they pick it up.

### 4.6 Switch web payments on
GitHub → **Settings → Secrets and variables → Actions → Variables** → add `VITE_PRO_WEB_CHECKOUT` = `1` → then run **Deploy to GitHub Pages** again (2.3).

### 4.7 Test mode walk-through (do all of this before real money)
Follow `docs/PAYMENT-CHECKS.md`. In short:
1. **Webhook wiring** (no payment): in a terminal, `WEBHOOK_URL=https://<ref>.supabase.co/functions/v1/stripe-webhook STRIPE_WEBHOOK_SECRET=whsec_… node tools/smoke-webhook.mjs` → four PASS lines. (On Windows PowerShell, set the two variables first with `$env:NAME="value"`.)
2. **A real test purchase**: on the site, signed in with an email account (not a guest), tap a locked Pro section → choose monthly → pay with card `4242 4242 4242 4242`, any future date, any CVC, any postcode. You return to the game with "Welcome to Dx Dash Pro!".
3. **Manage / cancel**: Settings → Dx Dash Pro → Manage → cancel. Pro stays until the period ends.
4. **A Locker item** (💎 button, tap twice): it appears. Buy the same one again from a second tab: the second payment is refunded automatically.
5. **Refund** the item in Stripe (**Payments** → the payment → **Refund**). Open the app twice over a few minutes: the item disappears.
6. **Lifetime then refund**: Pro ends. **Chargeback card** `4000 0000 0000 0259`: item removed; mark the dispute won (Stripe test mode lets you) and it returns.
7. **Delete the account** while a subscription is active: the subscription cancels and the account goes.
8. Look in Supabase **SQL Editor**: `SELECT * FROM pro_v_recent_events;` should show the webhook events. If it is empty after purchases, the webhook is not arriving (check the URL and the signing secret).
Tell me which step fails and what the screen says.

### 4.8 Go live in Stripe
1. Finish Stripe's account activation (4.1 step 1).
2. Turn **Test mode off**. Re-create the four products and prices in live mode (the toggle keeps separate data), copy the new price ids.
3. Create a new **live** restricted key (4.3), a new **live** webhook (4.5, same URL and events; it has its own `whsec_…`).
4. Replace `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and the four `STRIPE_PRICE_*` secrets with the live values, then redeploy both functions (4.4).
5. Repeat test steps 1–3 of 4.7 with a real card for the cheapest plan, then refund yourself in the Stripe dashboard.
6. From now on, run daily: `STRIPE_SECRET_KEY=… SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node tools/reconcile-stripe.mjs --days 7`. It prints "Everything matches" or one line per mismatch. (This one needs the `service_role` key: keep it only in your terminal, never in a file in the repo.)

---

## Part 5: The two developer accounts (start these on day one; they have waiting times)

### 5.1 Google Play
1. play.google.com/console/signup → sign in with the Google account you want to own the app → choose **Personal** (or **Organization** if you have a D-U-N-S number) → pay $25 → verify identity (a document and, for personal accounts, a phone with the Play Console app). Approval: a day or two.
2. **Closed-test rule for personal accounts:** you need a closed test with at least **12 testers who stay opted in for 14 days** before Google lets you publish. Start recruiting now (friends, classmates; they need Android phones and Google accounts). Check Play Console **Dashboard** for the current wording.

### 5.2 Apple
1. developer.apple.com/programs/enroll → sign in with your Apple ID (turn on two-factor if asked) → Individual or Organization → pay $99/year. Approval: a day or more.
2. appstoreconnect.apple.com → **Business** (older: **Agreements, Tax, and Banking**) → accept the **Paid Applications** agreement → add your **bank account** and **tax forms**. Without this, nothing can be sold on iPhone. It can take a few days to show as "Active".

---

## Part 6: Publishing the apps

### 6.1 Android
Use `docs/RELEASE_GUIDE.md` Part 1 for the full list; the click paths are:
1. **Signing key.** On a computer with Java (Android Studio includes it), in a terminal:
   ```
   keytool -genkey -v -keystore release.keystore -alias dxdash -keyalg RSA -keysize 2048 -validity 10000
   base64 -w0 release.keystore > release.keystore.b64      (Mac: base64 -i release.keystore -o release.keystore.b64)
   ```
   Back up `release.keystore` and its two passwords somewhere safe (losing them means you cannot update the app).
2. GitHub → repo → **Settings → Secrets and variables → Actions → Secrets** → **New repository secret**: `ANDROID_KEYSTORE_BASE64` (the contents of `release.keystore.b64`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`dxdash`), `ANDROID_KEY_PASSWORD`.
3. **Actions** tab → **Android app** → **Run workflow** → `main`. When done, open the run → **Artifacts** → download the release bundle `app-release.aab` (and the debug APK to try on your own phone first: allow "install unknown apps", open the file).
4. Play Console → **Create app**: name `Dx Dash: Board Exam Runner`, English, **App**, **Free**, accept declarations.
5. **Store listing**: Grow → **Store presence → Main store listing**: paste text from `store/google-play/listing.md`; upload `assets/store/play-icon-512.png`, `assets/store/feature-graphic.png`, the phone screenshots in `assets/store/screenshots/`, and the tablet screenshots (the **7-inch tablet** and **10-inch tablet** boxes) from `assets/store/play-tablet-7/` and `assets/store/play-tablet-10/`. Chromebook screenshots can reuse the 10-inch set.
6. **App content** (Policy and programs → App content): answer every item using `store/google-play/policy-answers.md`: privacy policy URL `https://pathomnemonic.github.io/buzzword-dash-v2/privacy.html`; ads: **No ads**; app access: no login needed; **Data safety** (answers in that file, including email address for sign-in and purchase history); **Account deletion** URL `.../delete-account.html`; content rating questionnaire; target audience **18+ / not for children**; health apps declaration: it is a study game, not a medical device.
7. **Products** (after step 8's first upload; Play only lets you create them once a bundle exists). Monetize with Play → **Products → Subscriptions** → **Create subscription**, three times. Each one: **Product ID** exactly `dxdash_pro_yearly`, `dxdash_pro_pass3m`, `dxdash_pro_monthly` (the app looks products up by these ids); name "Dx Dash Pro"; **one base plan** each, auto-renewing, billing period 1 year, 3 months and 1 month; prices per `docs/PRO.md`; **no free trial or introductory offer**. Then **Products → In-app products** → **Create product** for `dxdash_pro_lifetime`, the three `dxdash_tip_*` tips and the 11 `dxdash_item_*` Locker items, exact ids and prices as in the tables in `docs/PRO.md`. After the first internal-test install, confirm the paywall shows the real store prices; if a plan shows no price, the product id or its activation is wrong: tell me which. (`docs/PRO.md` describes this as one subscription with three base plans; three separate subscriptions is what matches the ids the app asks for.)
8. **Testing → Closed testing** → **Create track / Create release** → upload `app-release.aab` → release notes → **Next → Save** → **Testers** tab: create an email list or Google Group with your 12+ testers → copy the **opt-in link** and send it to them. Ask each to open it, **Become a tester**, and install. They must stay opted in 14 days.
9. Under **Setup → License testing** add your own Google account so test purchases are free and quick to cancel.
10. After the 14 days: **Production → Create new release → promote from closed testing → submit**. Review takes a few days.

### 6.2 iPhone
Use `docs/RELEASE_GUIDE.md` Part 2 for the full list; the click paths are:
1. App Store Connect → **Apps → +** → **New App**: iOS, name `Dx Dash: Board Exam Runner`, English, bundle ID `com.pathomnemonic.dxdash` (register it first in developer.apple.com → Identifiers if it is not listed; see 3.2 step 2), SKU `dxdash`.
2. **API key for the build robot:** App Store Connect → **Users and Access → Integrations → App Store Connect API → Team Keys → +** → access **App Manager** → **Generate** → **Download** the `.p8` (once). Copy the **Issuer ID** and **Key ID**.
3. codemagic.io → sign in with GitHub → **Add application** → pick `buzzword-dash-v2` → it finds `codemagic.yaml`. **Teams → Integrations → App Store Connect** → add the key from step 2, naming the integration exactly `Dx Dash App Store Connect`.
4. Codemagic → the app → **Environment variables**: add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (mark secure), `VITE_SUPPORT_EMAIL`, and later `VITE_APPSTORE_ID` (the app's numeric Apple ID from App Store Connect → App Information).
5. **Start new build → ios-release.** This file has never run: if a step fails, copy the red log lines to me; the fix is usually one line.
6. App Store Connect → the app → **Monetization → In-App Purchases / Subscriptions**: create a **subscription group** "Dx Dash Pro" with the three subscriptions (`dxdash_pro_yearly`, `dxdash_pro_pass3m`, `dxdash_pro_monthly`, no introductory offer), a **non-consumable** `dxdash_pro_lifetime`, **consumables** for the three `dxdash_tip_*`, and **non-consumables** for the 11 `dxdash_item_*` ids. Each needs a display name, description, price and a review screenshot (use the paywall or Locker screenshot).
7. **Version page** (Distribution → iOS App → the version): paste text from `store/app-store/listing.md`; upload screenshots from `assets/store/appstore/` (6.9") and `appstore-6.5/`, and for iPad `assets/store/ipad-13/` (13" iPad; the 12.9" slot takes `ipad-12.9/`); fill **App Privacy** and **Age Rating** from the same file; paste the **reviewer notes**; set **Sign-in information**: not required.
8. When the Codemagic build appears under **TestFlight** (10–30 minutes after upload), open the version page → **Build → +** → pick it. Install it on your own iPhone from the **TestFlight** app and run the tests in 6.4.
9. **Add for Review → Submit.** Review takes 1–3 days.

### 6.3 Optional: check phone-store purchases on the server
Only if you want purchases made on a phone to show on the website and on a new phone. Details and the Google/Apple service keys are in `docs/PRO.md` ("Checking phone-store purchases"). In short: add the secrets listed there, `npx supabase@latest functions deploy iap-verify --use-api`, re-run `database/pro.sql` and `database/lockdown.sql`, then set the GitHub variable `VITE_IAP_VERIFY` = `1` and rebuild the apps. Test with sandbox purchases first. Skip it for the first release if you are short of time: purchases still work.

### 6.4 Real-device test (do not skip)
Run `docs/DEVICE-TESTING.md` on at least one Android phone and one iPhone, writing down model and OS version. The ones that matter most (section 5b of that file):
1. First launch: tutorial plays; offline run works in airplane mode.
2. Sign in with each provider, once as a guest ("I am new") and once as a returning player. You must come back to the app signed in, with the same coins.
3. iPhone: Sign in with Apple, then **Delete my account**. Within a minute the app must vanish from iPhone **Settings → [your name] → Sign-In & Security → Sign in with Apple**.
4. Buy a subscription and an item with a test account; restore after reinstalling; refund in the store console and open the app twice.
5. Clear the app's storage and relaunch: it offers "Restore your progress?". iPhone: Settings → Dx Dash → remove website data, or offload and reinstall.
6. Airplane mode during a purchase and during sign-in: nothing charged twice.
Send me anything odd.

---

## Part 7: Things that fell through the cracks

- [ ] **Re-run database files and redeploy functions after every update from me** (1.1 and 4.4). I will name exactly which.
- [ ] **Check the live site really deployed** after each push: GitHub → **Actions** → a green "Deploy to GitHub Pages". (It was silently failing before and is fixed.)
- [ ] **Firefox and Safari browser tests.** Firefox now passes in CI. The Safari (WebKit) job is very slow; check **Actions → CI** for a green result on the latest commit, or tell me and I will.
- [ ] **Medical content review.** Ask a clinician to skim a sample of the 3,010 cards. `docs/CARD-QUALITY.md` lists what was automated.
- [ ] **Lawyer.** Have a lawyer read `public/terms.html` and `public/privacy.html` once (digital-content "right to withdraw" wording, refunds, privacy sections). I wrote them from how the app behaves; I am not a lawyer.
- [ ] **Moderation routine.** Reports land in the `moderation_queue` view (Supabase → SQL Editor → `SELECT * FROM moderation_queue;`). Decide who looks, how often, and what you do about abuse (`docs/MODERATION.md`). The stores ask.
- [ ] **Delete requests by email.** Decide how you answer (the in-app delete does it automatically).
- [ ] **Hidden features** (global leaderboard, ranked matches, cohorts, discovery): built but hidden; revisit when you have players (`js/features.js`).
- [ ] **Pro limits.** `public/remote-config.json` has Pro on and the free tier at 300 cards; re-read the gates against the prices you chose.
- [ ] **Analytics.** Decide whether you will look at the owner views (`docs/ANALYTICS-GUIDE.md`) and who does.
- [ ] **Name and trademarks.** Check "Dx Dash" is free in both stores. The app and ads carry the disclaimer about NBME, FSMB and NBOME.
- [ ] **What's new text and launch plan** (`docs/marketing/`): the images were regenerated from the current app; the wording needs your voice.
- [ ] **Calendar reminders:** Apple sign-in secret (every 6 months, 3.2), Microsoft client secret (3.3), Apple Developer renewal (yearly).

## Part 8: Decisions I made that you can change
- The app now runs on iPhone **and iPad** (and on Android tablets, foldables and Chromebooks). Phones stay upright; tablets and open foldables turn any way. The layout is checked at 21 screen sizes in `tests/e2e/devices.spec.js`. App Store Connect needs the iPad screenshots in `assets/store/ipad-13/` (6.2), and Google Play takes the tablet screenshots in `assets/store/play-tablet-7/` and `play-tablet-10/` (6.1).
- Microsoft sign-in is on by default but hidden until you switch it on in Supabase.
- A refunded or charged-back item is taken back from the player's device after two checks in a row; paying twice for one item refunds the second payment automatically.
- Server-side checking of phone-store purchases is off until you do 6.3.

## Part 9: iOS things I could not test (watch for these in 6.4)
- Sign in with Apple/Google/Microsoft opens an in-app Safari sheet and returns through the `com.pathomnemonic.dxdash://auth` link. iOS may ask "Open in Dx Dash?" once. If that is clumsy, the fix is Universal Links.
- iPhone web views can lose stored data under storage pressure. The app keeps a second copy of the save in a file and offers it back; check by removing the app's website data and relaunching.
- Keyboard, safe areas (notch, home bar) and 3D performance on an older iPhone.

## If you get stuck
Tell me: which step number, what you clicked, and what the screen says (a screenshot with keys blurred is fine). I can read error messages and logs; I cannot log in to your accounts, so I rely on you for what you see.
