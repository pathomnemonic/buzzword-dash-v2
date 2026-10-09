# Real-device test script

Automated tests run in Chromium with software graphics. They cannot tell you how the game feels or performs on a phone,
and they cannot make a real phone call. Run this script on at least: one low-end Android (2 to 3 GB RAM), one recent
Android, one iPhone from the last three years, and one older iPhone. Write down model, OS version and result.

## 1. First launch (5 min)
- Fresh install: tutorial plays, starting coins are 300, the tutorial lets you buy the Pill Trail.
- Daily reward appears once, after the tutorial, never on top of a run.
- Offline: switch to airplane mode, open the app, play a full run, answer a flashcard, finish an exam block. All work.

## 2. Performance (10 min)
- Play a 5 minute Endless run on each of three maps. Smooth means no visible stutter at gates and map changes.
- Settings > Graphics: Auto, Low, High. Watch for heat and battery drain (note % lost in 10 minutes).
- Map change: you run through the glowing doorway and the colours blend. No flash of the old map.
- Memory: play ten runs in a row without closing the app. It must not slow down or restart.

## 3. Interruptions (the ones a computer cannot do)
- Phone call during a run: answer, talk 20 s, hang up. The run is paused, the pause screen shows, music is back after Resume.
- Call rejected, then alarm ringing, then Siri/Assistant: same.
- Lock the screen for 1 minute mid-run, unlock: paused, Resume works, time away was not counted.
- Switch to another app for 5 minutes and back. Then for 30 minutes (the system may close the app: it must open at Home with progress intact).
- Rotate the phone mid-run and on every screen. Nothing is cut off; Resume still works.
- Bluetooth headphones: connect and disconnect mid-run. Sound continues on the right output, or is silent and returns after a tap. Never stuck silent after a call.
- Low Power Mode / Battery Saver on: the game still runs, graphics drop a tier.
- Notification banner or Control Centre pulled down mid-run: pauses or ignores, never loses the run.

## 4. Time (5 min)
- Set the phone date forward one day: streak continues and the daily reward is available once.
- Set it back one day: nothing is paid twice and the streak is not lost.
- Change time zone (settings) at 23:50 and 00:10: no double rewards, no lost streak.

## 5. Accessibility (10 min)
- TalkBack (Android) and VoiceOver (iPhone): every button on Home, Locker, Profile, Settings, results has a spoken name; toasts are announced; pop-ups can be closed.
- Font size to the largest: nothing is cut off on Home, results, Settings.
- Bold text / high contrast / Reduce Motion on: text readable, no motion-sick effects (the map doorway and camera moves are reduced).
- Colour-blind mode on: right and wrong gates are told apart.

## 5b. Accounts, purchases and data safety (the ones that cost real money or progress)
- Sign in with **each** provider (Google, Apple, Microsoft, email link, email + password), as a guest ("I am new") and as a returning player ("I have an account"). The app must come back signed in after the browser sheet, with the same coins and characters (guest upgrades keep everything).
- On iPhone specifically: Sign in with Apple, then **Delete my account**: the Apple sign-in must disappear from Settings → Apple ID → Sign in with Apple → Apps using Apple ID within a minute.
- Buy a subscription and an item with a sandbox / test account; restore on a second device or after reinstalling; refund one in the store console and open the app twice: it must disappear.
- Clear the app's storage (Android: Settings → Apps → Dx Dash → Storage → Clear storage; iPhone: Settings → Dx Dash → remove website data, or offload and reinstall) and relaunch: the game must offer "Restore your progress?" with the right numbers. With an account it must instead load the cloud save.
- Airplane mode during a purchase and during sign-in: nothing is charged twice and the app explains what happened.

## 6. Stores
- Install the release build (not a debug build) from the internal test track / TestFlight and repeat section 1.
- Check the privacy and delete-account links open.
