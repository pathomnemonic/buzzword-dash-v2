# Store policy check

Date: 2026-10-11. Policies were fetched live the same day: Apple App Review Guidelines (page says "Last Updated: June 8, 2026"), Google Play Health Content and Services, User Generated Content, User Data, Target API level pages, Apple age-rating definitions. Compared with `store/**`, `docs/STORE_LISTING.md`, `docs/PLAY_RELAUNCH.md`, `public/{privacy,terms,delete-account}.html`, `ios-config/PrivacyInfo.xcprivacy`, `android/variables.gradle`.

## Result at a glance

| Area | Status |
|---|---|
| Google target API level | **Pass.** `targetSdkVersion = 36` (Android 16). From 31 Aug 2026 new apps and updates must target 36 (extension to 1 Nov 2026 possible); existing apps need 35+ to stay visible to new users. Nothing to do. Next bump (Android 17) will be due 31 Aug 2027. |
| Medical disclaimer (Apple 1.4.1, Google Health policy) | **Gap, fixed.** Wording lacked Google's required sentence and the "consult a professional" reminder. |
| Google Health apps declaration | **Gap in our instructions, fixed** (text); the form itself must be completed by the owner. |
| Account deletion (Apple 5.1.1(v), Google) | Pass. In app (Friends → Account) and web page `delete-account.html`; Apple sign-in revoked on delete. |
| Privacy policy reachable in app and in metadata (Apple 5.1.1(i), Google User Data) | Pass (Settings → About; policy URL in both listings). |
| Analytics consent (Apple 5.1.1(ii)) | Pass: asked on first launch, can be switched off in Settings → Data, paid features do not depend on it. |
| UGC (Apple 1.2, Google UGC) | **Partial.** Report, block, published contact exist. Missing: terms acceptance before creating content (Google) — fixed in the sign-in form; automatic filter for objectionable names (Apple 1.2) — owner action. |
| In-app purchase (Apple 3.1.1/3.1.2, Google Payments) | Pass with one risk: redeem codes on iOS (below). |
| Apple privacy manifest | Pass, with a note. |
| Apple age rating | **Gap, fixed** in the listing instructions (new questionnaire). |
| Large screens (Google) | Pass: manifest is resizeable, orientation unspecified, touchscreen not required, tablet screenshots prepared. |

## Gaps and fixes

### 1. Medical disclaimer wording (APPLIED)

- Apple 1.4.1: "Apps should remind users to check with a doctor in addition to using the app and before making medical decisions." https://developer.apple.com/app-store/review/guidelines/#physical-harm
- Google Health Content and Services: other health/medical apps "must include a clear disclaimer in their app description indicating that the app is 'not a medical device and does not diagnose, treat, cure, or prevent any medical condition'" and "must also remind users to consult a healthcare professional". https://support.google.com/googleplay/android-developer/answer/12261419
- Before: "Dx Dash is an educational game, not medical advice..." (no device sentence, no reminder).
- Applied everywhere the disclaimer appears: `store/google-play/listing.md` (full description; still far under 4000 characters, now 1.8k), `docs/STORE_LISTING.md`, `public/terms.html` (box at top), and the in-app Settings → About text in `js/uisettings.js`. The App Store description reuses the Play text.

### 2. Google Health apps declaration instructions (APPLIED to text)

Play requires every developer to complete the Health apps declaration (App content page). Our `store/google-play/policy-answers.md` said to pick "not a health app" and `docs/PLAY_RELAUNCH.md` was vague. Updated both: declare no health features, no health data (no Health Connect, no sensors), not a medical device. Owner must submit the form in Play Console.

### 3. Terms acceptance before user-generated content (APPLIED)

Google UGC policy requires users to "accept the app's terms of use and/or user policy before users can create or upload UGC". https://support.google.com/googleplay/android-developer/answer/9876937
The email sign-up and sign-in form (`js/accountui.js`) now shows "By continuing you agree to the Terms of Use and the Privacy Policy" with links. Guest play never creates visible UGC. The Google, Apple and Microsoft sign-in buttons sit in the same Account screen; if the owner wants a hard acceptance gate for them too, add a checkbox (product decision).

### 4. Filter for objectionable names (NOT APPLIED, owner action)

Apple 1.2 requires "a method for filtering objectionable material from being posted". Today the safeguards are report, block and manual review (`docs/MODERATION.md`); there is no automatic check of display names or group names. Exact fix: add a server-side check in the `upsert_player_profile` and group-create functions that rejects names matching a short blocklist (and a client-side message), then say so in the review notes. Without it a reviewer can reject under 1.2; the report/block/contact items are already covered.

### 5. Redeem codes on iOS (NOT APPLIED, owner decision)

Apple 3.1.1: apps "may not use their own mechanisms to unlock content or functionality, such as license keys". The folded "Have a redeem code?" row (`js/proui.js`, grants free Pro) is available on iOS. It is hidden and meant for reviewers, but a reviewer who finds it can cite 3.1.1. Fix: hide the row in the iOS build (use Apple Offer Codes via App Store Connect for promotions) or keep it only on web/Android. Check `docs/PRO.md` "Redeem codes" if you rely on it for App Review access.

Related, no action: web checkout (Stripe) is web only; the native apps sell through the stores. The guideline now explicitly allows US-storefront external links but the app does not use them.

### 6. Apple age rating (APPLIED to `store/app-store/listing.md`)

The questionnaire changed (new 13+/16+/18+ tiers and new questions). Definitions: https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions
- "Medical or Wellness" is its own topic. Our old advice ("Medical or treatment information: None") understated the content (diseases, findings, treatments in vignettes). Now: "Infrequent medical or treatment information".
- Capability "User-generated content: Yes", "Messaging and chat: No", "Advertising: No".
- Also set "Declare Regulated Medical Device Status → No" and the Digital Goods and Services/trader declaration (EU) in App Store Connect.
Expected rating 9+ to 12+. A wrong "None" can be flagged in review; the new text is the safe answer.

### 7. Apple privacy manifest (`ios-config/PrivacyInfo.xcprivacy`): no change

Tracking false, no tracking domains. Declared data types match `store/app-store/listing.md` (email, user id, other user content, product interaction, device id, purchase history, crash, performance, other diagnostics). Required-reason APIs declared: UserDefaults `CA92.1`, file timestamp `C617.1` (what Capacitor Preferences/Filesystem use). Plugins ship their own manifests. Re-check when running `npx cap sync` after the Capacitor patch bump: if a build warns "ITMS-91053 missing API declaration", add the category it names (typically `SystemBootTime 35F9.1` or `DiskSpace E174.1`).

### 8. Data safety (Google)

`store/google-play/policy-answers.md` matches the privacy policy: email, name, user IDs, app interactions, user content, device IDs (random install id; network address shared with PeerJS), crash and diagnostics (opt-in). The sharing row for the PeerJS signalling host is correct and conservative. No change.

### 9. Other checks, no gap

- Apple 5.1.1(v): Sign in with Apple offered next to Google/Microsoft; deletion revokes the Apple login.
- Apple 3.1.2: paywall shows price, period, renewal and cancel text, with Terms and Privacy links; restore purchases present. Subscription period 1 month, 3 months, 1 year (all above 7 days).
- Apple 5.1.2(i): third-party sharing limited to Supabase (processor) and PeerJS (live play only); no AI vendor, no ads, no ATT needed.
- Apple SDK requirement: `codemagic.yaml` uses `xcode: latest`, so builds use the current SDK.
- Google subscriptions: price, billing period and cancel path are on the paywall; products ids documented.
- Google large screens: manifest `resizeableActivity=true`, `screenOrientation=unspecified`, `touchscreen required=false`. With target 36 the system ignores orientation locks on large screens, which the app already handles.
- `terms.html` and `privacy.html` are plain, public, non-geofenced HTML (Google needs no PDF).

## Owner checklist (cannot be done from the repo)

1. Play Console: submit the Health apps declaration, Data safety, content rating (UGC = yes) using `policy-answers.md`.
2. App Store Connect: answer the new age questionnaire, medical-device status = No, trader status, paste the updated description.
3. Decide on the iOS redeem-code row (item 5) and the name filter (item 4).
4. Refresh the screenshots only if the Settings → About text appears in them.
