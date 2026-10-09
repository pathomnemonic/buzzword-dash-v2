# Google Play: from "testers enrolled" to live (and how to ship every update)

Where you are: the app exists in Play Console, a **closed testing** track exists, and you have started enrolling testers. This page takes you from there to a public launch. Screen names are from Play Console as of this writing; if one has moved, look for the nearest match. For first-time setup details see `docs/RELEASE_GUIDE.md` Part 1 and `docs/LAUNCH_CHECKLIST.md` 6.1.

**What changed in this release (version 1.0.4, version code 5):** the app now also works properly on tablets, foldables and Chromebooks (it turns with the device; phones stay upright), the layout was checked at 21 screen sizes, the support address is on the policy pages, and many fixes (see the commit history). Upload this as a **new release** on the closed track so your testers get it.

---

## 1. Understand the 14-day rule (so you do not lose days)

If your developer account is a **personal** one created after November 2023, Google requires: a closed test with **at least 12 testers who have stayed opted in for 14 days in a row**, then you apply for production access. (Check **Dashboard** in Play Console for the exact wording on your account: Google changes it. Organization accounts skip this.)

- The clock counts days that **12 or more testers are opted in** to a closed test that has a release live on it. Starting a new release does **not** reset the clock; testers leaving does, if you drop below 12.
- Recruit **15–20** so a few dropouts do not cost you days. Testers must be real people with Google accounts, on Android phones or tablets, who open the opt-in link and tap **Become a tester**, then install the app from the Play Store link on that page.
- Ask them to **keep it installed** and open it now and then; Google can look at engagement when you apply.

## 2. Make the new build

1. Version numbers are already bumped in `android/app/build.gradle` (`versionCode 5`, `versionName "1.0.4"`). **Every upload needs a higher versionCode than anything you have uploaded before.** If Play ever says "Version code 5 has already been used", ask me to bump it, or edit the file on GitHub (the number after `versionCode`) and commit.
2. GitHub → **Actions** → **Android app** → **Run workflow** → branch `main` → **Run workflow**. Wait for the green tick (about 10 minutes).
3. Open that run → **Artifacts** at the bottom → download **app-release** (the signed bundle `app-release.aab`) — unzip it if it downloads as a zip. (The debug APK is only for trying on your own phone.)
4. If the run did not produce an `.aab`, the signing secrets are missing: see `docs/LAUNCH_CHECKLIST.md` 6.1 steps 1–2.

## 3. Upload it to the closed track

1. Play Console → your app → left menu **Test and release** → **Testing** → **Closed testing** → click your track (usually "Closed testing - Alpha").
2. **Create new release** (top right). If it asks about **Play App Signing**, accept; Google then manages the final signing key.
3. **App bundles** → **Upload** → choose `app-release.aab`. Wait until it says it is uploaded and shows version 5 (1.0.4).
4. **Release name**: leave the suggestion. **Release notes**: paste, for example:
   `<en-US>`
   `Works on tablets and foldables, with a layout that turns with your device. Fixes for sign-in, saving your progress, and small layout problems.`
   `</en-US>`
5. **Next** → fix any red errors → **Save**. Then **Publishing overview** (left menu or the banner) → **Send changes for review** (or **Save and publish** on the track). A closed-test update is usually reviewed within hours to a day or two.
6. When it is live, testers receive the update from the Play Store automatically (they can also open the store page and tap **Update**).

## 4. Fill in everything Play wants before you can go to production

Do these now while testers run; none of them wait for the 14 days.

1. **Store settings → Store listing contact details**: email `patho.mnemonic1@gmail.com`, website `https://pathomnemonic.github.io/buzzword-dash-v2/`.
2. **Grow users → Store presence → Main store listing**: paste the text from `store/google-play/listing.md`. Upload the icon `assets/store/play-icon-512.png`, feature graphic `assets/store/feature-graphic.png`, **phone screenshots** `assets/store/screenshots/` (all, in order), **7-inch tablet** screenshots `assets/store/play-tablet-7/` and **10-inch tablet** screenshots `assets/store/play-tablet-10/`. (A **Chromebook** box also exists: reuse the 10-inch set.) Save.
3. **Policy and programs → App content**, answer every item with `store/google-play/policy-answers.md` open:
   - Privacy policy: `https://pathomnemonic.github.io/buzzword-dash-v2/privacy.html`
   - Ads: **No, my app does not contain ads**
   - App access: **All functionality is available without special access** (the app works without signing in)
   - **Data safety**: use the answers in `store/google-play/policy-answers.md`. Include email address (sign-in with Google, Apple, Microsoft or email), purchase history, and app activity if you keep analytics on. Say data is encrypted in transit and that users can request deletion.
   - **Account deletion**: web link `https://pathomnemonic.github.io/buzzword-dash-v2/delete-account.html`, and say the app also has Delete my account in Settings
   - Content rating: complete the questionnaire (no violence beyond cartoon, no user-generated content shared publicly beyond display names and scores; reporting and blocking exist)
   - Target audience: **18 and over** (not for children)
   - Health apps declaration: it is an exam study game, not a medical device and gives no medical advice
   - Government apps, financial features, news: **No**
4. **Monetize with Play → Products** (only possible after the first bundle upload, which you have done):
   - **Subscriptions**: create three, product ids exactly `dxdash_pro_yearly`, `dxdash_pro_pass3m`, `dxdash_pro_monthly`, each with one auto-renewing base plan (1 year, 3 months, 1 month), prices as in `docs/PRO.md`, **no free trial**. Activate each.
   - **In-app products**: `dxdash_pro_lifetime` (and, optionally, the three tips `dxdash_tip_small`, `dxdash_tip_medium`, `dxdash_tip_large`), ids and prices from `docs/PRO.md`. Activate each.
   - **The Locker items (`dxdash_item_*`) are not needed for this launch.** Their buttons show "Soon" and nothing can be bought, because the build leaves `VITE_FEATURE_LOCKER_ITEMS` off. When you want to sell them: create the 11 products (table in `docs/PRO.md`), finish the website backend steps, build with that variable set to `1`, and ship an update.
   - You also need a **merchant account** (Payments profile): Play Console → **Setup → Payments profile**, add tax and bank details.
5. **Setup → License testing**: add your testers' Gmail addresses (or a Google Group) so their test purchases are free and cancel quickly. Ask 2–3 testers to try a purchase and a restore.
6. **App access, Government, Advertising ID**: declare the Advertising ID as **not used** (the app does not read it).

## 5. What to ask your testers to do (copy this into a message)

> Thanks for testing Dx Dash! Please install it from this link [your opt-in link], keep it installed, and over the next two weeks please:
> 1. Play a few runs and answer some questions. Does anything feel broken or confusing?
> 2. Try the Flashcards and the Stats tab.
> 3. Make a free account (Friends → Account) with Google or email and check you stay signed in after closing and reopening the app.
> 4. Rotate your phone or tablet — the app should adapt.
> 5. Tell me your device model and anything odd, by email to patho.mnemonic1@gmail.com (screenshots welcome).

Keep a list of who is opted in. If it drops below 12, recruit more straight away.

## 6. After 14 days: ask for production access

1. Play Console → **Dashboard** → the card **Apply for production** (or **Release → Production** shows a banner). It only appears after the 14-day condition is met.
2. Answer the questions honestly: how you recruited testers, what feedback you got, what you changed, and why the app is ready. Use the feedback you really got (bugs fixed, tablet support added, and so on).
3. Submit. Google answers in about a week (sometimes faster). If it is refused, it explains why; fix that and re-apply after a further test period.

## 7. Go to production

1. **Test and release → Production → Create new release.** Click **Add from library** to reuse the exact bundle that testers ran (best), or upload a newer one. Add release notes.
2. **Countries / regions**: choose where to launch. For a first release, the countries where you can handle support and tax (US, Canada, UK, Australia are typical). You can add more later.
3. **Staged rollout**: when you start the rollout, choose 20% first (**Release options → staged rollout**), watch **Quality → Android vitals** and **Ratings and reviews** for a few days, then raise to 100%.
4. **Send for review.** First production reviews can take several days.
5. After approval, copy the store link (**Grow users → Store presence → Store listing → View on Google Play**) and put it in the GitHub variable `VITE_REVIEW_URL`, then redeploy the site.

## 8. Every update after that

1. Bump `versionCode` (+1) and `versionName` in `android/app/build.gradle`.
2. Run the **Android app** workflow, download the `.aab`.
3. **Production → Create new release** → upload → release notes → **Send for review**. Use staged rollout again for risky changes.
4. If a release goes wrong: **Production → Releases → Halt rollout**, then ship a fix with a higher versionCode. (Play cannot roll back to an older versionCode.)
5. Re-run database files / redeploy functions only if I tell you a `database/` or `supabase/functions/` file changed (`docs/LAUNCH_CHECKLIST.md` 1.1 and 4.4).

## 9. If you mean something else by "relaunch"

- **The app was already live and you want to publish a new version:** steps 2, 3 and 8 only (use the Production track instead of the closed one).
- **The closed test needs to start over** (for instance you lost testers): the clock restarts only if you drop below 12 opted-in testers for the period you are counting; add testers and keep going. Do not unpublish the closed track.
- **Google rejected something:** open **Policy status** in Play Console, read the exact reason, and send it to me. The common ones are Data safety mismatches (the form must match what the app does, `store/google-play/policy-answers.md` has the answers), the account-deletion link, and the health-content declaration.
