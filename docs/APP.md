# Turning Dx Dash into a phone app

The game is wrapped with [Capacitor](https://capacitorjs.com/): the same web code runs inside a native shell, so the website and the apps stay in step. Android is fully set up in this repository. iOS is set up as a build recipe; because Apple only allows iOS builds on a Mac, that part is finished on a Mac (or a cloud Mac).

## What is already done

- Android project (`android/`), app icon and splash screens in every size (generated from `assets/`), portrait lock, keep-screen-on, vibration permission.
- Native behavior (`js/native.js`): Android back button (closes things in order, only leaves the app from Home), auto-pause when the app goes to the background, native haptics, status bar and splash handling, and email links (confirm address, reset password) that reopen the app.
- Store requirements: in-app **account deletion** (Leaderboard → Account), **Privacy Policy** and **Terms of Use** pages (`public/privacy.html`, `public/terms.html`, linked in Settings), medical-education disclaimer, and the tip link hidden inside the apps (Apple and Google restrict external payment links).
- Build tooling: `npm run app:build` (web build and sync), `npm run app:android` (also builds a debug APK), and GitHub Actions workflows `android.yml` (debug APK, plus a signed release bundle when secrets are set) and `ios.yml` (proves the iOS project builds).

## What only you can do

| Step | Why it needs you | Cost |
|---|---|---|
| Create a **Google Play Developer** account | Publishing under your identity | $25 once |
| Create an **Apple Developer Program** account and use a Mac | iOS builds and App Store upload | $99 per year |
| Choose the final **app ID** | It is permanent once published. It is currently `com.pathomnemonic.dxdash` | free |
| Add the app's email-link address in Supabase | Lets confirmation and reset emails reopen the app | free |
| Make **screenshots** and approve the store text | Store listing | free |
| Create the **signing key** | Only you should hold it | free |

### 1. App ID
Change it now if you want a different one (for example `com.yourname.dxdash`), before the first upload. Search for the current value and replace it everywhere: `capacitor.config.json`, `js/native.js` (`APP_SCHEME`), `android/app/build.gradle` (`namespace`, `applicationId`), `android/app/src/main/AndroidManifest.xml` (the `<data android:scheme>` line), the Java package folder under `android/app/src/main/java/`, and `MainActivity.java`'s `package` line. Then run `npm run app:build`.

### 2. Supabase: email links that reopen the app
In Supabase, go to **Authentication → URL Configuration → Redirect URLs** and add:

```
com.pathomnemonic.dxdash://auth
```

(Keep your website URLs there too.) Without this, confirmation and password-reset emails opened from the app would not return to it.

### 3. Signing key (Android)
Generate a key once and keep it (and its passwords) somewhere safe. Losing it means you cannot update the app:

```bash
keytool -genkey -v -keystore release.keystore -alias dxdash -keyalg RSA -keysize 2048 -validity 10000
```

Use **Play App Signing** (Google holds the final key; yours is an "upload key"), which lets you recover if it is lost. To let GitHub build the release bundle, add these repository **secrets**: `ANDROID_KEYSTORE_BASE64` (the keystore, run through `base64`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.

## Building

**On a computer with Android Studio** (this repo's machine has it):

```bash
npm install
npm run app:android        # web build, sync, and android/app/build/outputs/apk/debug/app-debug.apk
```

Install the APK on a phone with USB debugging (`adb install -r android/app/build/outputs/apk/debug/app-debug.apk`) or drag it onto an emulator.

**On GitHub (no local setup):** Actions tab → **Android app** → Run workflow. Download the APK artifact. With the signing secrets set it also produces `app-release.aab`, the file Google Play wants.

**Open the project in Android Studio:** `npx cap open android`.

**iOS (on a Mac):** `npm i @capacitor/ios && npx cap add ios && npm run app:build && npx cap open ios`, then set your Team under *Signing & Capabilities* and archive. The `ios.yml` workflow checks that this recipe builds.

## Testing checklist (do this on a real phone before submitting)

1. Fresh install: the splash shows, then the game; onboarding shows touch wording ("Swipe", "Double-tap").
2. Play a run: character and monster, sound, haptics on answers, no stutter. Try Settings → Graphics → Auto/Medium/Low, and Battery saver.
3. Back button: in a run it pauses; on other screens it goes Home; on Home it leaves the app.
4. Switch away mid-run: the run pauses.
5. Create an account, confirm the email from the phone's mail app (the link should reopen the game signed in), sign out, sign in, reset a password, then use **Delete my account**.
6. Airplane mode: the game and flashcards still work; online features say they cannot connect.
7. Rotate: the game stays portrait.

## Store listing

See `docs/STORE_LISTING.md` for draft text, the data-safety and privacy-label answers, and the content-rating notes.

## Updating the app later

The game files are bundled inside each release, so a change reaches players when you publish a new version: bump `versionCode` and `versionName` in `android/app/build.gradle`, run the **Android app** workflow (or a tag such as `v1.0.1`), and upload the new bundle. The website updates immediately on every push, so it is a fast place to try changes first. If you later want instant updates inside the apps too, Capacitor supports live-update services; that is not set up here.

## Known limits

- iOS has not been built on a Mac here; the recipe and workflow are provided, and the Android app has been built.
- The animated models add about 5 MB to the app. Very old phones may run better on **Graphics → Low** (Auto chooses this automatically on weak devices).
- Tips are web-only by design.
