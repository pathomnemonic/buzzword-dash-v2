# Release guide: Google Play first, then the App Store

Everything that could be prepared without your accounts is done. This is the shortest list of what is left, in order. Tick as you go. Each step says roughly how long it takes.

## What is already prepared

| Thing | Where |
|---|---|
| Android app project, icons, splash screens, back button, haptics, signed-bundle build in GitHub Actions | `android/`, `.github/workflows/android.yml`, `docs/APP.md` |
| iOS build in the cloud (no Mac needed), signing and TestFlight upload | `codemagic.yaml` (not run yet) |
| Store text, ready to paste | `store/google-play/listing.md`, `store/app-store/listing.md` |
| Every policy form answered | `store/google-play/policy-answers.md`, `store/app-store/listing.md` |
| Icons, feature graphic, screenshots at the exact sizes | `assets/store/` (see below) |
| Privacy Policy, Terms, **Delete account** page (Google requires a web link) | `public/privacy.html`, `public/terms.html`, `public/delete-account.html` |
| In-app account deletion, report and block, medical disclaimer | already in the app |
| Where reports go and what to do with them | `docs/MODERATION.md` (`SELECT * FROM moderation_queue`) |

Assets in `assets/store/`: `play-icon-512.png`, `feature-graphic.png` (1024x500), `screenshots/` (Google Play, 1080x1920), `appstore/` (1290x2796, iPhone 6.9"), `appstore-6.5/` (1284x2778), `appstore-icon-1024.png`.

---

## Part 1: Google Play

**Heads-up about timing.** If you register as an *individual* (personal) developer, Google currently requires a **closed test with at least 12 testers who stay opted in for 14 days** before you can publish to production. You can do everything else tomorrow, upload to a closed test tomorrow, and publish after the 14 days. An *organization* account (needs a D-U-N-S number) skips this. Check the current rule in Play Console → Dashboard, since Google changes it.

### A. Accounts and secrets (about 40 minutes, plus Google's identity check)
- [ ] 1. Create a Google Play Developer account: https://play.google.com/console/signup ($25, once). Verify your identity (can take a day or two).
- [ ] 2. Create the upload key (run this on any computer with Java, e.g. Android Studio's terminal). Keep the file and the passwords safe: losing them is painful.
  ```bash
  keytool -genkey -v -keystore release.keystore -alias dxdash -keyalg RSA -keysize 2048 -validity 10000
  base64 -w0 release.keystore > release.keystore.b64     # on a Mac: base64 -i release.keystore -o release.keystore.b64
  ```
- [ ] 3. In GitHub: repo → Settings → Secrets and variables → Actions → **Secrets** → add `ANDROID_KEYSTORE_BASE64` (contents of `release.keystore.b64`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`dxdash`), `ANDROID_KEY_PASSWORD`.
- [ ] 4. Same page → **Variables**: check `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set (they should be, from the website deploy).

### B. Switch on the online features (about 10 minutes)
- [ ] 5. Supabase → SQL editor → paste and run `database/schema.sql`, then `database/policies.sql` (safe to run again; they add the new feed, kudos, moderation and reporting pieces). Leave `cohorts.sql` and `discovery.sql` for later: those features are hidden on purpose.
- [ ] 6. Supabase → Authentication → URL Configuration → Redirect URLs → add `com.pathomnemonic.dxdash://auth` (keep your website URL there too). This makes confirmation and password-reset emails reopen the app.
- [ ] 7. Play one ranked or head-to-head match between two real devices or accounts. If you have not, delete the "Ranked matches and leagues" line from the store description (`store/google-play/listing.md` notes where).

### C. Build the app file (about 15 minutes, mostly waiting)
- [ ] 8. GitHub → Actions → **Android app** → Run workflow (branch `main`). When it finishes, download two artifacts: the debug APK (try it on a phone first: `docs/APP.md` has a 7-point checklist) and the **release bundle `app-release.aab`**.
  - If you changed nothing since the last release, the first build is version code 1. For every later upload bump `versionCode` and `versionName` in `android/app/build.gradle`.

### D. Create the app in Play Console (about 60–90 minutes, all copy and paste)
- [ ] 9. Play Console → **Create app**: name `Dx Dash: Board Exam Runner`, language English, **App** (not game), **Free**. Accept the declarations.
- [ ] 10. **Store presence → Main store listing**: paste from `store/google-play/listing.md`; upload `play-icon-512.png`, `feature-graphic.png` and all files in `assets/store/screenshots/`.
- [ ] 11. **Policy and programs → App content**: go through every item with `store/google-play/policy-answers.md` open (privacy policy, ads, app access, **Data safety**, **account deletion link**, content rating, target audience).
- [ ] 12. **Testing → Closed testing** (or Internal testing first, to check it installs): create a release, upload `app-release.aab`, paste the release notes, add testers (a Google Group or email list). Send testers the opt-in link.
- [ ] 13. Submit. Google's first review usually takes a few days.
- [ ] 14. After the closed-test period (if required): **Production → Create release → promote**, and submit.

**You never have to touch:** code, icons, screenshots, store text, privacy pages.

---

## Part 2: Apple App Store (after Android is submitted)

You do not need a Mac: `codemagic.yaml` builds and signs the app on Codemagic's cloud Macs.

### A. Accounts (about 30 minutes, plus Apple's approval, often 1–2 days)
- [ ] 1. Enroll in the **Apple Developer Program**: https://developer.apple.com/programs/enroll/ ($99/year).
- [ ] 2. App Store Connect → **My Apps → + → New App**: iOS, name `Dx Dash: Board Exam Runner`, primary language English, bundle ID `com.pathomnemonic.dxdash` (register it in Certificates, Identifiers & Profiles → Identifiers first if it is not in the list), SKU `dxdash`.
- [ ] 3. App Store Connect → **Users and Access → Integrations → App Store Connect API → Generate API key** (access: App Manager). Download the `.p8` file (you can download it only once), and note the Key ID and Issuer ID.

### B. Cloud build (about 20 minutes, mostly waiting)
- [ ] 4. Sign up at https://codemagic.io with your GitHub account (free tier is enough) and add the repository. It finds `codemagic.yaml`.
- [ ] 5. Codemagic → Teams → **Integrations → App Store Connect** → add the key from step 3; name the integration exactly `Dx Dash App Store Connect` (or change the name in `codemagic.yaml`).
- [ ] 6. Codemagic → the app → Environment variables: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (secure, same values as GitHub). Also add `VITE_SUPPORT_EMAIL` (your support address: the back-up for the in-app feedback form) and, once the app exists in App Store Connect, `VITE_APPSTORE_ID` (its numeric Apple ID, so "Rate Dx Dash" can open the App Store page).
- [ ] 7. Start the **ios-release** workflow. It builds, signs (automatic) and uploads to TestFlight. This file has not been run before: if a step fails, the log says which; send me the error and the fix is usually one line.

### C. App Store Connect listing (about 60 minutes, copy and paste)
- [ ] 8. App Store Connect → the app: paste everything from `store/app-store/listing.md` (name, subtitle, promo text, description, keywords, URLs, category). Upload `assets/store/appstore/` screenshots (and `appstore-6.5/` if it asks).
- [ ] 9. Fill **App Privacy** and **Age Rating** from the same file. Add the reviewer notes.
- [ ] 10. When the TestFlight build appears (10–30 minutes after upload), open the version page → **Build → +** → pick it. Test it on your own iPhone through the TestFlight app first.
- [ ] 11. **Add for Review → Submit.** Review takes 1–3 days. Medical-study apps are fine as long as they say they are educational and give no medical advice; both are in place.

---

## If something goes wrong
- **Play rejects for "health" or "medical" content:** reply that it is a study game for exam prep, link the Terms page, and point to the in-app disclaimer (Settings → About).
- **Play asks how you moderate user content:** `docs/MODERATION.md` is the answer (report and block buttons, a review queue, removal of abusive accounts).
- **Apple asks for a demo account:** none is needed; say the app works without signing in.
- **Apple asks about "Sign in with Apple":** the app offers Continue with Apple next to Google and Microsoft, which is what Guideline 4.8 asks for, and deleting an account revokes the Apple login (see `docs/SIGNIN.md`). Make sure the Apple provider is switched on in Supabase before you submit, or the reviewer will see no Apple button.
- **Export compliance question:** the build sets "uses no non-exempt encryption" (HTTPS only).
