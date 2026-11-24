# Google Play: policy forms (answers to paste or tick)

Play Console → **Policy and programs → App content**. Answer each item as below. They match `public/privacy.html`.

## Privacy policy
`https://pathomnemonic.github.io/buzzword-dash-v2/privacy.html`

## Ads
**No, my app does not contain ads.**

## App access
**All functionality is available without special access** (no login is needed to play; accounts are optional).

## Data safety

Does your app collect or share any of the required user data types? **Yes** (only if the player uses the optional online features).

Is all of the user data collected by your app encrypted in transit? **Yes**.
Do you provide a way for users to request that their data be deleted? **Yes.** In-app: Friends → Account → Delete my Dx Dash data (keeps a sign-in shared with other apps) or Delete my login everywhere (removes the sign-in too). Web link to paste: `https://pathomnemonic.github.io/buzzword-dash-v2/delete-account.html`

| Data type | Collected | Shared | Optional | Why | 
|---|---|---|---|---|
| Personal info → **Email address** (only if an account is made: by email, or with Google, Apple or Microsoft sign-in, which hand over the email address and an account id, never a password) | Yes | No | Yes | Account management |
| Personal info → **Name** (the display name the player chooses, shown to friends; with Google, Apple or Microsoft sign-in the sign-in service may also pass on the name on that account, which the sign-in system stores but the app does not show) | Yes | No | Yes | App functionality, account management |
| Financial info → **Purchase history** (which Pro plan or code the account holds, and when it ends; web payments are handled by Stripe, which keeps card details: the app never sees them. Purchases made in the Android app go through Google Play Billing) | Yes | No (Stripe and Google Play are payment processors acting for us) | Yes (only if the player buys or redeems a code) | App functionality (unlocking what was paid for), fraud prevention |
| Personal info → **User IDs** | Yes | No | Yes | App functionality, account management |
| App activity → **App interactions** (scores, streaks, runs shared to the feed, kudos, progress) | Yes | No | Yes | App functionality |
| App activity → **Other user-generated content** (decks a player chooses to share by code; feedback a player chooses to write, with an optional reply email) | Yes | No | Yes | App functionality (feedback: developer communications) |
| Device or other IDs (network address seen by the multiplayer connection service and the other player) | Yes | **Yes** (PeerJS connection service and the opponent) | Yes (only in live multiplayer) | App functionality |
| App activity → **App interactions** (anonymous usage statistics: modes played, questions answered, screens, settings) | Yes | No | **Yes (asked on first launch; can be switched off in Settings → Data)** | Analytics |
| App activity → **Other actions** / **In-app search history**: not collected | | | | |
| Device or other IDs → **a random install identifier** (generated on the device, not an advertising ID, not linked to the account) | Yes | No | **Yes (same switch)** | Analytics |
| App info and performance → **Crash logs** | Yes | No | **Yes (off by default; the player switches it on)** | Analytics (bug fixing) |
| App info and performance → **Diagnostics** | Yes | No | **Yes (same switch)** | Analytics (bug fixing) |

Note on service providers: with the "Help fix problems" switch on, crash reports go to Sentry, and with anonymous usage statistics agreed, screen views and error messages also go to PostHog. Both act as service providers on our behalf (Google does not count that as "sharing"), neither runs for anyone who has not opted in, and neither receives an account identifier, name or scores. If Google's form asks, App activity → App interactions is also processed by PostHog, optional and tied to the same consent.


Everything else (location, contacts, photos, files, financial, health, messages, audio, web browsing, search history, installed apps): **not collected**.
"Shared" is **No** for everything except the live-multiplayer network address: Supabase is a service provider that hosts the data for us, which Google does not count as sharing.
Crash/diagnostic data is not linked to the user (no ID is stored with it).
Anonymous usage statistics use a random install identifier, are processed by our own Supabase project (not shared with any analytics vendor), and can be deleted by the player (Settings → Data → Delete my analytics data), so answer "Yes" to "data can be deleted" for them as well.

## Content rating (IARC questionnaire)
Category: **Reference, News or Educational** (or "Utility, Productivity, Communication, or Other" if Education is not offered). Then answer:
- Violence: **No** (cartoon monsters chase a character; nothing is depicted being harmed). If the form insists on a choice, pick "mild cartoon/fantasy violence".
- Sexuality, language, controlled substances, gambling: **No**.
- Users can interact or exchange content: **Yes** (friend requests, display names, a feed of run summaries and kudos; no free-text messaging, no photos or files).
- Shares the user's location: **No**. Digital purchases: **Yes** (Pro subscriptions, a lifetime unlock and optional tips, all through Google Play Billing). Unrestricted web access: **No**.
Expected result: Everyone / PEGI 3 / low rating.

## Target audience and content
Target age: **18 and over** (medical students and professionals). Not designed for children, does not appeal to children. Tick that the app is **not** primarily child-directed.

## Government apps / Financial features / Health apps
- Government app: **No**. Financial features: **No**.
- Health: complete the **Health apps declaration** (Play requires it from every app, App content page). Answer that the app has no health features, does not access health data (no Health Connect, no sensors) and is **not a medical device**; if asked for a category, it is a medical *education* study aid, not diagnostic or treatment functionality. The full description must carry the disclaimer "not a medical device and does not diagnose, treat, cure, or prevent any medical condition" plus a reminder to consult a healthcare professional (already in `store/google-play/listing.md`; policy: https://support.google.com/googleplay/android-developer/answer/12261419).

## News app, COVID-19, advertising ID
**No**. Advertising ID: **No** (the app does not use it). Tick that you do not use the advertising ID.

## Account deletion (new Play requirement)
Provide: in-app path (Friends → Account → Delete my Dx Dash data, or Delete my login everywhere) and the web link above.

## Declarations you may be asked for
- Permissions: network, vibration, and notifications (the optional daily study reminder, which the player turns on; Android 13+ asks them first). No sensitive permissions.
- Foreground services, exact alarms, photo/video permissions: **not used**.

## Subscriptions and in-app products (Play Console > Monetize)
Create these in Play Console with exactly these product IDs, then activate them:
- Subscription `dxdash_pro_yearly` (base plan yearly, no store trial offer: the free trial is given to every account by our own server), `dxdash_pro_monthly` (monthly), `dxdash_pro_pass3m` (auto-renewing 3-month base plan).
- One-time products `dxdash_pro_lifetime` and the tip consumables `dxdash_tip_small`, `dxdash_tip_medium`, `dxdash_tip_large`.
Subscription disclosure requirements: the paywall shows price, billing period, trial length and "cancel anytime in Google Play". Link the Privacy Policy and Terms. The in-app list of what free vs Pro includes is in docs/PRO.md.


## Walkthrough of the Data safety form (page by page)
Play Console → Policy and programs → App content → **Data safety**.
1. **Overview:** read it, then **Next**.
2. **Data collection and security:** "Does your app collect or share any of the required user data types?" **Yes**. "Is all of the user data collected by your app encrypted in transit?" **Yes**. "Do you provide a way for users to request that their data be deleted?" **Yes** (in-app and the web link above).
3. **Data types:** tick only these groups, then expand each and tick the items in the table above: **Personal info** (Name, Email address, User IDs), **Financial info** (Purchase history), **App activity** (App interactions, Other user-generated content), **App info and performance** (Crash logs, Diagnostics), **Device or other IDs** (Device or other IDs).
4. **For each type**, Play asks four things. Use the table: *Collected* Yes. *Shared* No (except the multiplayer network address). *Processed ephemerally* No (the data is stored). *Required or optional* Optional (every item is optional: the game works with no account and with analytics off). Then pick the purposes from the Why column.
5. **Preview** the summary, check that "Data shared" lists only the multiplayer network address, then **Save**, and **Submit**.
6. If Play later flags a mismatch, send me the exact message: the usual causes are a data type the app handles that the form missed, or the form saying "not shared" for something that goes to a third party.

What changed since the earlier version of this sheet: Google, Apple and Microsoft sign-in (the email address and, where given, the name), purchase history (the Pro plan an account holds), and the two deletion choices (data only, or the login as well).
