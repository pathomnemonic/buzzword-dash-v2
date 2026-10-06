# Channel playbooks

Concrete steps for each channel, in the order to start them. Budgets are the lean plan from 01. Always send traffic through a UTM link (06) so `analytics_v_acquisition` can tell channels apart.

UTM template: `https://<your-site>/landing/?utm_source=<platform>&utm_medium=<organic|paid|creator>&utm_campaign=<launch|exam_s1|...>&utm_content=<script id, e.g. B1_hookC>`

---

## 1. TikTok (start here)

**Why:** the "MedTok / StudyTok" audience is large; gameplay is native to the platform; low cost to test.

**Account:** a brand account ("Dx Dash") plus the founder account. Add the landing link in the bio (switch to a Business account for a clickable link; use the `utm_medium=organic` link). Pin 3 posts: the best gameplay, the "what is this", and the free-300 post.

**Organic cadence:** 1 to 2 posts a day for the first three weeks. The goal is **hook tests**, not polish. Each post: one script from 02, one hook, 12 to 25 seconds, captions on, a **question comment** you pin ("what subject should I add next?") to drive comments, which the algorithm loves.

**Posting details:** keep captions short, 3 to 5 tags (`#medschool #studytok #usmle #medtok #brainrot` plus one niche tag per post). Reply to comments with video replies (they are cheap content). Do not use trending sounds you cannot license for a **business** account: use the **Commercial Music Library** (business accounts can only use that).

**Paid:** boost winners with **Spark Ads** (use the organic post, keeping its comments and likes). Start at **$20/day**, one ad group, one winning post per ad group. Objective: App installs (or Traffic to the landing page if you have no store link yet). Audience: 18 to 30, US, interests: education, medicine, studying; let the algorithm widen after 50 conversions.

**Creator ads:** ask creators for Spark codes (the "authorize post" code) so you can run their post under their handle: it converts far better than a brand voice.

**Watch:** 3-second view rate (≥30%), 6-second, average watch time, comment sentiment. Kill any ad under target after $75.

## 2. Instagram Reels (and Facebook)

**Why:** residents and med students are here; ad targeting is good; costs more than TikTok.

- Same videos, **re-exported without the TikTok watermark**, uploaded natively. Put the hook text higher than on TikTok (the bottom UI covers more).
- **Account:** link in bio to the landing page; Stories with the poll sticker ("Which subject do you dread most?") feed the hook bank.
- **Paid:** Advantage+ app campaign or a Traffic campaign. Creative: the 4:5 feed ads (`assets/static/*-feed.png`) and the 9:16 videos. **Rules:** no second-person lines that imply a health condition (see 07); put the ADHD-design ad copy in the third person about the app's features.
- Start $10/day on a Reel boost to the post that won on TikTok; scale only if CPI < $1.50 and D1 holds.

## 3. YouTube Shorts

**Why:** cheapest reach and evergreen search ("USMLE study", "study with me").

Re-upload the same cut with a **title that holds the search words** ("Studying for boards without doomscrolling", "A board-review game that doesn't feel like homework"). First line of the description: one sentence and the link. Add `#Shorts`. Do not run ads here at first.

## 4. Reddit

**Why:** r/medicalschool (huge), r/step1, r/step2, r/Residency, r/premed, r/anki. High trust if you are honest; instant ban if you spam.

1. **Read each sub's rules on self-promotion first.** Many allow a post if you are a regular contributor and flag it ("I made this"). Some require mod permission: message the mods first.
2. **Be a member before you post** (comments for a few weeks).
3. **The post:** "I built a game to make short study sessions less painful, honest feedback wanted." Include the free 300, what it is, what it is not (no replacement for UWorld), a clip, and the ask. Answer **every** comment for 24 hours. Never use alt accounts to upvote.
4. **Not for r/ADHD** unless the rules allow it and you lead with feedback, not promotion; never use ADHD as a hook there.
5. Reddit Ads: start with $10/day in r/medicalschool and r/premed; headlines in plain language, no hype.

## 5. Student Doctor Network and Discord / group chats

SDN forums (Step 1, Step 2, COMLEX): same honesty rules as Reddit. Ask class presidents and study-group admins to share the link (give them a unique code in `pro_codes`). Discord servers for med students: ask the mods before posting.

## 6. Creators and campus ambassadors

See 04 section 2.4 for the brief and rates. **Campus ambassadors:** 1 per school, a unique Pro code that gives their friends a Pro trial; reward = free Lifetime plus a bonus per 100 installs. Track by code: `analytics_v_top_referrers`.

## 7. Apple Search Ads (start in Phase 2)

**Why:** people searching "usmle" or "anki" are already motivated; this is the highest-intent paid install.

- **Campaigns (separate, so you can see each):** Brand (your name), Category (`usmle`, `step 1`, `comlex`, `medical flashcards`, `board review`, `anki`), Competitor (be careful with trademarks in ad text; target the keyword, never put their name in your ad copy), Discovery (broad match, to find new terms).
- **Budget:** $20/day total at first; bids start at about $1.50 to $2.50 (Education category CPTs are often $1 to $3); use exact match on the winning terms.
- **Creative:** Custom Product Pages per campaign (e.g. the Anki-import screenshot for the "anki" keywords).

## 8. Google App campaigns / Google Ads

Run only after TikTok and Apple data say what works. A Google **App campaign** needs only text, images and video; Google's system mixes them. Supply: 5 headlines from 03, 4 descriptions, the 1200×628 `wide` PNGs, the square PNGs, one 9:16 video. Bid on **install** first, then optimise for the in-app event `run_start` once you have 50 conversions, then `paywall purchase`.

## 9. ASO (app store optimisation; the long game)

- **Title (30 chars) and subtitle (Apple) / short description (Google):** the highest-weight keywords: "Dx Dash: Board Study Game", "USMLE COMLEX question game". Details in 03 section 2.
- **First 2 screenshots** carry most of the conversion; test them with the stores' experiments (04 section 2.5).
- **Reviews:** the rate-the-app flow already asks happy players for a store review; reply to every review in the first month.
- **Keywords:** Apple keyword field (100 chars, no spaces after commas, no repeats of the title); Google reads the full description, so write for humans, with the keywords used naturally two or three times.
- **Update cadence:** a release every 2 to 3 weeks; stores reward fresh updates, and each update's notes are a free ad.

## 10. Press, podcasts and newsletters

Small med-ed newsletters, the "indie dev builds a game for boards" story, student-run podcasts, and the med school tech blogs. The pitch is in 03 section 10. One personalised email each (not a blast), with 3 screenshots and a Pro code for the reviewer. Expect a low hit rate and a high trust payoff.

## 11. Email and push (once you have opt-ins)

Use only addresses people gave you for this (privacy policy says we do not send marketing email today; **update the policy before sending**). Lifecycle: day 0 welcome, day 2 "your first streak", day 7 "your weak spots", exam-window campaigns, lapsed streak rescue. Copy is in 03 section 8.

## 12. Seasonal calendar

| When | Moment | Angle |
|---|---|---|
| Jan to Feb | New-year resolutions; spring Step windows | "A study habit that survives February" |
| Mar to Jun | Peak dedicated-study windows; Step 1 and Step 2 CK; COMLEX | The 3-Month Dedicated Pass; "exam date is the monster" |
| Jul | New interns; M3 starts | Shelf and clerkship hooks |
| Aug to Sep | New M1 class; orientation | Free-300 and the Gauntlet; campus ambassadors |
| Nov to Dec | Finals; holiday map | Holiday Wards map, streak shields, gift Lifetime |

(Exact dates for each exam change; check the NBME/NBOME sites each year.)
