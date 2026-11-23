# Applying for Google Play production access (draft answers)

When the closed test has run for 14 days with at least 12 testers opted in, Play Console → Dashboard shows **Apply for production**. Google asks three groups of questions. These drafts are written from what is really in the app; **replace every [bracket] with the true number or fact** before submitting, and delete anything that did not happen. Google reads these, so keep them honest and specific.

## About your closed test
**How did you recruit testers, and how many?**
> [N] testers, recruited from [classmates and friends in medical and pre-medical programmes / a study group / social posts]. Each installed the app from the Play Store opt-in link and kept it installed for the 14 days. I asked them to use the app as they would for board-exam study and to report problems by email.

**How engaged were the testers?**
> [Roughly N] of them played several sessions a week. They used the runner mode, flashcards and the stats screen, and [N] created an account with Google or email. [N] sent written feedback.

**Summarise the feedback you received.**
> [List the real feedback, for example: confusing first-run tutorial, text cut off on a small phone, questions about how Pro works, request for more subjects.] The most common themes were [...].

**What changes did you make based on it?**
> [Real changes. True ones from the project so far include: tablet and foldable support with a layout that turns with the device (phones stay upright); fixes to text that was cut off on small screens; clearer deletion options (delete my data, or delete my login everywhere); stricter protection of saved progress so it is never overwritten by a smaller save; sign-in with Google, Apple and Microsoft; and a check that every purchase plan matches its price before it is sold. Add the specific things your testers raised.]

## About your app
**What does the app do, and who is it for?**
> Dx Dash is a study game for medical students and other adults preparing for USMLE and COMLEX board exams. The player runs down a hospital corridor and steers into the answer to a short clinical clue. It includes 3,010 board-style cards, spaced-repetition review, flashcards, an exam simulator, a daily goal and streaks, optional friends and groups, and an optional Pro subscription for the full card bank and extra study tools. It is an educational study aid and not a medical device; it gives no medical advice.

**How do you know the app is ready for production?**
> It ran for 14 days with [N] testers on [N] different devices with no crashes reported [or: with these crashes, since fixed]. Automated tests cover the game logic, saved-progress protection, account deletion, payments and layouts at 21 screen sizes. The store listing, privacy policy, terms, in-app and web account deletion, and Data safety form are complete.

**Which countries will you launch in, and what is your expected audience?**
> [Countries, for example the United States, Canada, United Kingdom, Australia.] Medical students and residents; [N] expected installs in the first months.

**How will you keep the app updated and respond to problems?**
> I monitor Android vitals and reviews in Play Console, answer the support email (patho.mnemonic1@gmail.com), and ship fixes as staged rollouts (20% first, then 100%). Server-side payment and account changes are deployed separately and checked before an app update that depends on them.

## Before you press Submit
- The closed test shows 12 or more opted-in testers for 14 days.
- The latest app bundle is live on the closed track (so the testers ran what you will release).
- Store listing, App content forms (including Data safety from `store/google-play/policy-answers.md`) and Play products are complete.
- You have real numbers in every [bracket].
