# Compliance for ads and marketing

This is a practical checklist, not legal advice. Platform policies change often: **re-read the linked policy pages before each launch.** If you run paid ads for a real business, have a lawyer glance at the wording, especially the ADHD and exam-name lines.

## 1. The ADHD angle (the most sensitive one)

- **Never** imply the viewer has, or might have, a health condition. Meta's personal-attributes policy bars ad copy that asserts or implies a person's health condition or characteristic ("Struggle to focus?", "Got ADHD?", "Your ADHD brain…"). TikTok and Google have similar health and personal-data rules.
- **Do** describe the **product's design**, in the third person, with concrete features: "Study design with ADHD-friendly features: 3-minute runs, instant feedback, rewards for every answer, reduced-motion mode." This is what the `adhd-design` ad and the `adhd-friendly-design` video do, and they carry a small-print line: "Describes how the app is designed. It does not diagnose, treat or claim to help any condition."
- **Do not** say the app helps, treats, improves or manages ADHD, attention, focus disorders, anxiety or depression, and **never** show a diagnosis screen, a symptom list or a "test".
- **Creators:** a creator may talk about their **own** experience ("I have ADHD and long question blocks lose me; short runs work for me") if they are authentic and disclose the partnership; they may not make claims that the app treats it. Review each script; the brief in 04 forbids it.
- **Reddit (r/ADHD and similar):** many communities ban promotion; do not use ADHD as a hook there.
- **Neurodiversity-respecting tone:** no jokes at the expense of the condition; no "brain rot" implying a disorder (brain-rot is a meme about internet overuse, so keep that to the situation, not to a diagnosis).
- **In-app:** the settings (reduced motion, dyslexia font, left-hand layout, colorblind lanes) are accessibility features. Describe them as such.

## 2. Exam names and trademarks (USMLE, COMLEX, NBME, NBOME, FSMB, UWorld, AMBOSS, Anki)

- USMLE® is a program of the FSMB and NBME; COMLEX-USA® is a program of the NBOME. Use the names **descriptively** ("board-style questions for USMLE and COMLEX prep"), not in a way that implies endorsement or affiliation.
- **Always include the disclaimer** where there is room: "Dx Dash is a study aid, not affiliated with or endorsed by NBME, FSMB or NBOME." The static ads include it; the landing page and store listings do.
- Do **not** use the organisations' logos, official score reports, or "official" / "authentic" / "real exam questions" wording. Our questions are original board-style items; say "board-style".
- **Competitors:** name a competitor in ad copy only for truthful comparison, and avoid the trademark in headlines. In search ads you may bid on competitor keywords on most platforms but not use their trademark in the ad text.
- **Pass-rate claims:** make none ("pass your boards", "guaranteed", "raise your score by X"). Say what the app does, not what it will cause.

## 3. FTC and creator disclosure

- Any paid or free-product creator post must have a clear, up-front disclosure: `#ad`, "Paid partnership with Dx Dash", or the platform's branded-content toggle. "Thanks" or `#sp`/`#collab` alone is not enough; put it at the start of the caption and say it on camera if it is a video.
- Creators may only say what is true and what they experienced; give them the facts sheet (free 300, 3,010 total, no ads, the price) and keep the contract's disclosure clause.
- **Testimonials** must be real, current and typical, or be labelled; don't invent a person or a metric. If you use a quote or a number ("most players improve…"), keep the evidence.
- **Incentivised reviews:** do not offer rewards for store reviews or for positive ratings; both stores prohibit it. (The in-app rate-the-app flow asks and does not reward.)

## 4. Platform ad policies (quick checklist)

| Platform | Watch for | Notes |
|---|---|---|
| **Meta** | Personal attributes (health, ADHD); misleading claims; before/after; "you" lines that imply a condition; text-heavy images (no formal limit now but keep clean) | Disclose branded content; ads about education are fine; keep the ADHD ad in the third person |
| **TikTok** | Music licensing (business accounts: Commercial Music Library only); health claims; AI-generated content label; paid-partnership toggle | Spark Ads with creator authorisation codes |
| **Google / YouTube** | Healthcare and medicines policy (this app is education, not healthcare, but avoid anything that sounds like a medical service); misleading claims; the app-promotion asset rules | Set the category to Education |
| **Apple Search Ads** | Ad text must match the app; no unapproved trademark in text | Custom Product Pages |
| **Reddit** | Per-subreddit self-promotion rules; ads must not be misleading | Disclose that you are the developer |
| **App Store / Google Play** | Metadata accuracy: no competitor names, no unapproved claims ("#1"), screenshots must show the real app | Subscription disclosure: price, period, trial, "cancel any time in your store account" next to the buy button (the paywall does this) |

## 5. Subscription marketing rules

- State the price, billing period and trial length clearly **wherever you advertise a trial**; "free" must mean free for a defined period, with the renewal price stated.
- Auto-renewal disclosure on the paywall (it has it), cancel path in the store settings (the paywall and Settings link to it), no dark patterns: a clear "No thanks" and a restore button exist.
- **Apple external purchase links:** in the US, Apple's rules on linking to external payments have been in litigation; the app's web checkout (`VITE_PRO_WEB_URL`) is off unless you set it. Check the current rules before using it in the iOS app. Google Play has its own "alternative billing" rules.
- **The free trial:** every signed-in account gets 7 days of Pro from our server (no card). Say "free 7-day trial when you make an account" in ads, never "free trial, cancel any time" (there is nothing to cancel); it is not a store introductory offer.
- **Refunds** are the store's job; do not promise a refund policy of your own in ads unless you honour it.

## 6. Children and age

The app targets adults (medical students and professionals): 18+ in the store forms. Do **not** target under-18s in ads (set the minimum age to 18 in Meta and TikTok), and do not use child-appealing creative or tag minors in organic posts.

## 7. Privacy in marketing

- The privacy policy states we do not send marketing email, and analytics are first-party and opt-in. **Update the policy before sending any marketing email or push**, and keep an unsubscribe link (CAN-SPAM, GDPR/ePrivacy).
- Do **not** install ad-network SDKs or pixels in the app without updating the privacy policy, the App Store privacy labels, the Play data-safety form and adding consent (Apple's App Tracking Transparency applies if you track across other companies' apps and sites). Today the app does no cross-app tracking.
- The landing page sets no cookies and loads no third-party scripts. Keep it that way; if you add an ad pixel, add a consent banner.
- Respect "do not track" requests and local laws (GDPR, UK, CCPA/CPRA) in any list you build.

## 8. Accuracy: say only what is true

A check before posting any ad: every claim must be verifiable in the build you ship.

| Claim | True today? | Source |
|---|---|---|
| 3,010 board-style cards, 15 subjects | Yes | card data; `docs/PRO.md` |
| 300 free, 20 per subject | Yes | `js/freecards.js` |
| No ads | Yes | no ad SDK in the app |
| Spaced repetition (FSRS) | Yes | `js/fsrs.js` |
| Explanations for misses | Yes (limited per day in free) | `docs/PRO.md` gates |
| Dyslexia font, colorblind-safe, reduced motion, left-hand layout | Yes | settings |
| Anki import | Pro | gated |
| Works offline | Yes (offline packs are Pro) | gates |
| Friends, study groups, weekly Gauntlet | Yes (online features optional) | social |
| "Used by N students" or ranks like "#1" | **Do not claim** unless measured | none |

## 9. Pre-flight for every ad

- [ ] Real gameplay or real UI; nothing that does not exist.
- [ ] No health, ADHD or performance guarantees; third person for the ADHD angle.
- [ ] Disclaimer present (static) or in the caption/end card (video).
- [ ] Creator disclosure present and on camera.
- [ ] Music is licensed for commercial use.
- [ ] Price and trial wording match the stores exactly.
- [ ] Link carries UTMs (06) and lands on a page that matches the ad.
- [ ] Targeting 18+, no sensitive-category targeting.
