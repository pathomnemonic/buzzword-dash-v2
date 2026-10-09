# Sign in with Google, Apple and others

The Account panel (Friends → Account, and the profile button on Home) offers **Continue with Google**, **Continue with Apple** and **Continue with Microsoft** above the email form, plus **Email me a sign-in link instead** under it. A provider button only appears once that provider is switched on in Supabase (the app asks Supabase which are on), so nobody is shown a button that cannot work. Nothing to remember, no password, and the email is already verified (so no fake-email trial farming).

- **"I am new"** upgrades the player's guest account in place, so scores, friends, groups and cloud save stay with them.
- **"I have an account"** signs in to the account that already exists, and its cloud save loads (the usual "which save?" question appears if both have progress).
- In the phone app the provider opens in the system browser (Google refuses embedded web views) and the app's link brings the player back.

## Switch it on (once, in each provider and in Supabase)

1. **Supabase → Authentication → URL Configuration → Redirect URLs**: add your site (`https://<you>.github.io/buzzword-dash-v2/`) and the app link `com.pathomnemonic.dxdash://auth`.
2. **Supabase → Authentication → Sign In / Providers → "Allow manual linking": ON.** Without it, "I am new" cannot upgrade a guest and says so.
3. **Google**: Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web application). Authorized redirect URI: `https://<your-project>.supabase.co/auth/v1/callback`. Paste the client ID and secret into Supabase → Providers → Google, and turn it on. (Configure the consent screen with your app name, logo and privacy-policy link.)
4. **Apple**: Apple Developer → Identifiers → Services ID with "Sign in with Apple", return URL `https://<your-project>.supabase.co/auth/v1/callback`, plus a key. Paste the Services ID and the generated client secret into Supabase → Providers → Apple. (Apple's client secret expires every 6 months; Supabase's Apple page explains how to regenerate it. Put a reminder in your calendar.)
5. **Microsoft** (on by default, hidden until you switch it on): Azure Portal → App registrations → New registration (accounts in any organizational directory and personal Microsoft accounts), redirect URI `https://<your-project>.supabase.co/auth/v1/callback`, create a client secret, and paste the application ID, secret and `https://login.microsoftonline.com/common` as the tenant URL into Supabase → Providers → Azure. Discord and Facebook are also built in: list the ones you want in the build setting `VITE_AUTH_PROVIDERS` (default `google,apple,azure`), for example `google,apple,azure,discord`, and switch each on in Supabase the same way. GitHub and X are left out on purpose: they can hand back no email, and an account with no email is treated as a guest (no purchases, codes or trial).
6. Android build: run `npx cap sync android` once (a new plugin, `@capacitor/browser`, opens the sign-in page), then rebuild the app.

A provider that is listed but not switched on shows "<Provider> sign-in is not switched on for this game yet." instead of a broken page.

## Rules the stores impose

- **App Store**: an app that offers Google (or any third-party login) must also offer Sign in with Apple. That is why Apple is on by default; do not remove it from an iOS build.
- **Apple account deletion**: Apple requires that deleting an account also revokes the Sign in with Apple token. Deleting an account in the app removes all your data, but revoking the token needs Apple's REST call with your key; add it to the delete path before shipping an iOS build.
- **Google Play** needs the data-safety form to mention sign-in with Google (email address).

## How accounts combine

If someone made an email-and-password account and later taps Continue with Google using the same (verified) email, Supabase joins them into one account. Their purchases and progress stay.

## Sign-in links (no password)

"Email me a sign-in link instead" needs nothing to set up beyond Supabase's normal email sending (its Magic Link and Change Email templates). For a guest choosing **I am new** it upgrades the guest in place (Supabase emails a confirmation to that address, and their scores, friends and groups stay); for **I have an account** it signs in to the account that exists and never creates one by accident. Supabase's built-in email sender is limited to a few emails an hour, so before launch set up your own SMTP (Authentication → SMTP Settings) or sign-in emails will start failing for players.
