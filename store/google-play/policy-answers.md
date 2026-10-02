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
Do you provide a way for users to request that their data be deleted? **Yes.** In-app: Friends → Account → Delete my account. Web link to paste: `https://pathomnemonic.github.io/buzzword-dash-v2/delete-account.html`

| Data type | Collected | Shared | Optional | Why | 
|---|---|---|---|---|
| Personal info → **Email address** | Yes | No | Yes (only if an account is made) | Account management |
| Personal info → **Name** (display name) | Yes | No | Yes | App functionality (shown to friends) |
| Personal info → **User IDs** | Yes | No | Yes | App functionality, account management |
| App activity → **App interactions** (scores, streaks, runs shared to the feed, kudos, progress) | Yes | No | Yes | App functionality |
| App activity → **Other user-generated content** (decks a player chooses to share by code) | Yes | No | Yes | App functionality |
| Device or other IDs (network address seen by the multiplayer connection service and the other player) | Yes | **Yes** (PeerJS connection service and the opponent) | Yes (only in live multiplayer) | App functionality |
| App info and performance → **Crash logs** | Yes | No | **Yes (off by default; the player switches it on)** | Analytics (bug fixing) |
| App info and performance → **Diagnostics** | Yes | No | **Yes (same switch)** | Analytics (bug fixing) |

Everything else (location, contacts, photos, files, financial, health, messages, audio, web browsing, search history, installed apps): **not collected**.
"Shared" is **No** for everything except the live-multiplayer network address: Supabase is a service provider that hosts the data for us, which Google does not count as sharing.
Crash/diagnostic data is not linked to the user (no ID is stored with it).

## Content rating (IARC questionnaire)
Category: **Reference, News or Educational** (or "Utility, Productivity, Communication, or Other" if Education is not offered). Then answer:
- Violence: **No** (cartoon monsters chase a character; nothing is depicted being harmed). If the form insists on a choice, pick "mild cartoon/fantasy violence".
- Sexuality, language, controlled substances, gambling: **No**.
- Users can interact or exchange content: **Yes** (friend requests, display names, a feed of run summaries and kudos; no free-text messaging, no photos or files).
- Shares the user's location: **No**. Digital purchases: **No**. Unrestricted web access: **No**.
Expected result: Everyone / PEGI 3 / low rating.

## Target audience and content
Target age: **18 and over** (medical students and professionals). Not designed for children, does not appeal to children. Tick that the app is **not** primarily child-directed.

## Government apps / Financial features / Health apps
- Government app: **No**. Financial features: **No**.
- Health: choose **"The app is not a health app"**... if the form asks about medical information, it is an **educational study aid for medical exams** that does not diagnose, treat or give personal medical advice (the in-app terms say so).

## News app, COVID-19, advertising ID
**No**. Advertising ID: **No** (the app does not use it). Tick that you do not use the advertising ID.

## Account deletion (new Play requirement)
Provide: in-app path (Friends → Account → Delete my account) and the web link above.

## Declarations you may be asked for
- Permissions: the app asks for vibration only (and network). No sensitive permissions.
- Foreground services, exact alarms, photo/video permissions: **not used**.
