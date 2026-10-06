# Marketing strategy

## 1. The one-line idea

**Dx Dash is the study game you can actually stick with: run, dodge, and answer real board-style questions until the facts stick.**

It is a real endless runner (3D tracks, power-ups, a monster chasing you) where the "gates" you run through are answers to USMLE and COMLEX style clinical vignettes. 3,010 cards across 15 subjects, spaced repetition under the hood, streaks, leaderboards, friends, a daily challenge. Free to start (300 cards); Pro unlocks the full bank and the study tools.

## 2. Who it is for

| Segment | Who | What they want | Message |
|---|---|---|---|
| **Primary: the doom-scroller with a boards date** | M1 to M4 students and DO/MD students in dedicated study, 22 to 28, phone-first, already pay for UWorld/AMBOSS/Anki | Studying that does not feel like punishment; a way to use phone-time for something that counts | "Same phone time. Actually studying." |
| **The fatigue-prone** | People who can do Anki for 20 minutes and then lose it; students who find long question blocks hard to start | Short, rewarding, low-friction reps | "Five minutes is a run. Runs add up." |
| **The competitive** | Class group chats, rank-chasers | A leaderboard with their friends, a streak to protect | "Beat your co-resident's streak." |
| **Secondary: pre-med, PA, NP, nursing, international students** | Anyone drilling clinical vignettes | A free way to start | The free 300-card start |

The ADHD angle sits inside the first two segments (many students and clinicians have ADHD, and "ADHD-friendly" is a real feature request): we speak to it as a **design quality of the app**, never as a claim about the viewer or a treatment (see 07-COMPLIANCE.md).

## 3. Positioning

- **Category:** a *study game*, not a question bank. We do not compete with UWorld on explanation depth; we sit **next to** it as the thing you will actually open on a bad day.
- **Against Anki:** Anki is the gold standard and free on desktop; Dx Dash is the phone-native, game-loop alternative for the days Anki feels like homework (and it imports Anki decks in Pro).
- **Against Duolingo-style apps:** same habit mechanics (streaks, leagues) for board content, from someone who understands the exams.
- **Against doomscrolling:** the emotional hook. People already spend hours in short-form video; Dx Dash is the same swipe-and-react reflex pointed at something useful.

**Reasons to believe (all true today):** 3,010 cards, 15 subjects, explanations for misses, FSRS spaced repetition, streaks and a daily goal, a weekly Gauntlet, friends and clan feed, Versus mode, offline pack, no ads, accessibility modes (dyslexia font, colorblind-safe, reduced motion, left-hand layout), plays in a browser or as a phone app.

## 4. Messaging pillars (every ad uses one)

1. **Replace the scroll.** "Your thumbs are already moving. Make it count." (digital wellbeing)
2. **Fun enough to open, hard enough to matter.** Real clinical questions, real stakes (the monster). (the game)
3. **Brain-rot friendly.** We meet fried brains where they are: fast, loud, silly on the surface; rigorous underneath. (the meme angle)
4. **Built for brains that bounce.** Short sessions, instant feedback, big rewards, no shame. (the ADHD-friendly design angle)
5. **Win together.** Friends, streaks, a weekly Gauntlet. (social proof and virality)

## 5. Tone of voice

Warm, quick, a little unhinged, never cruel. We joke about **the situation** (boards, exhaustion, doomscrolling), never about the viewer's condition or about patients. Plain words, short lines, lots of "you". No guarantees, no fake urgency, no "docs hate this". On Meta, avoid second-person lines that imply a condition (see compliance).

Visual voice: the in-app look (chunky outlines, Jersey 10 pixel type, gold and green on deep navy), real gameplay and real UI. No stock photography of stethoscopes on laptops.

## 6. Funnel and the numbers it must hit

`Impression → view 3s → click/install → first run → tutorial done → day-1 return → paywall view → paid`

Targets to reach before scaling spend (initial; replace with measured values after 60 days):

| Stage | Target |
|---|---|
| 3-second view rate (video) | at least 30% |
| Click-through (feed) | at least 1% (TikTok/Reels), 0.5% (Meta feed) |
| Install conversion (store page) | at least 25% (store listing conversion is an Apple/Google ranking signal) |
| First run within the first session | at least 70% of installs |
| Day-1 / Day-7 retention | at least 35% / 15% (industry D7 average is 15 to 20%, top quartile 25%+) |
| Download-to-paid | at least 3% (education median 3.1%; top decile 8.7%) |

Business logic: an install is worth about **$0.90 to $1.50 in the first year** (see MONETIZATION-STRATEGY.md). Broad paid install ads cost **$2 to $4.50** for casual/arcade games in the US, so **paid only works when the blended cost per install falls under about $1 to $1.50**. That drives the plan: organic and creators first, paid to learn and to retarget.

## 7. Phased plan (12 weeks from the day the app is live in both stores)

**Phase 0, before launch (2 weeks).** Landing page live (`public/landing/`), store pages polished (screenshots, preview video, keywords), 10 gameplay captures recorded, 20 short videos cut from them, creator list of 50, 3 communities warmed up (see playbooks), analytics verified end to end, campaign UTMs built.

**Phase 1, soft launch and learn (weeks 1 to 3).** Post 1 to 2 organic videos a day on TikTok, Reels and Shorts (tests of hooks, not polish). Ten to 20 micro-creators (see budget). Reddit and SDN honest "I made this" posts. **Paid: $20 a day** on TikTok Spark Ads boosting the best organic posts, to measure CPI and D1. Ship the first weekly Gauntlet and start collecting testimonials.

**Phase 2, double down (weeks 4 to 8).** Cut anything under the 3-second target, make more of the three best hooks, expand to 40 creators, run campus-ambassador codes (Pro codes via `pro_codes`), start retargeting (paywall viewers) and Apple Search Ads on brand and competitor terms. Raise paid only on creatives with install cost under about $1.50 and D1 above target.

**Phase 3, the exam season engine (weeks 9 to 12 and every exam window).** Build content around Step 1, Step 2 CK, COMLEX Level 1 and 2 and shelf windows; the 3-Month Dedicated Pass and Lifetime are the offers; email and push to lapsed users; "streak rescue" retargeting.

## 8. Budget (a lean, test-first plan)

| Item | Phase 0 | Phase 1 | Phase 2 | Notes |
|---|---|---|---|---|
| Creator micro-payments (10 to 20 creators × $150 to $500 per video; free Pro + a Lifetime code as sweetener) | $0 | $1,500 | $4,000 | UGC averages about $200 per video; micro-influencer TikTok $200 to $800 |
| Paid social (Spark Ads / Reels boosts) | $0 | $420 ($20 a day × 21) | $2,000 | scale only on winners |
| Apple Search Ads | $0 | $0 | $600 | brand + "usmle" + "anki" terms |
| Video editing / voice (freelancer or tools) | $300 | $300 | $300 | CapCut is free; a freelance editor per 10 cuts is $150 to $300 |
| Giveaways / swag / Pro codes | $0 | $200 | $300 | codes cost nothing |
| **Total** | **$300** | **about $2,400** | **about $7,200** | **about $10k for 12 weeks** |

Stop-loss: pause any paid ad set after $75 spent with no installs, or after $150 with installs costing more than $3 and D1 under 25%. Never spend more than the previous week's measured net revenue plus the planned test budget.

## 9. Channels, ranked for this product

1. **TikTok** (organic + Spark Ads): the study and "MedTok" community is big and the format fits gameplay.
2. **Instagram Reels:** med students and residents live here (higher intent, better D7, higher CPI).
3. **YouTube Shorts:** cheap reach, evergreen search for "study with me" and "USMLE".
4. **Reddit** (r/medicalschool, r/step1, r/step2, r/Residency, r/premed, r/ADHD for the design angle only if the rules allow, which they often do not): honest posts, ask for feedback. **Never** spam; read each community's self-promotion rules first.
5. **Creators / med-fluencers / campus ambassadors:** social proof, free Pro codes.
6. **Apple Search Ads and Google App campaigns:** capture people already searching.
7. **ASO:** the long game; screenshots and the first three lines decide conversion.
8. **Student Doctor Network and class group chats:** word of mouth with a referral hook (the share link and referral code already exist).
9. **Press and podcasts:** small med-ed newsletters, the "indie dev builds a game for boards" story.

Details: 05-CHANNEL-PLAYBOOKS.md.

## 10. The viral loop (already built, so use it)

Every share is tagged (`utm_source=dxdash_share&utm_medium=<what>&utm_campaign=viral&r=<code>`), so `analytics_v_virality` and `analytics_v_top_referrers` show who brings installs. Mechanics that feed it: share your run's result, challenge links, friend invites, the weekly Gauntlet, streak share cards. Marketing job: remind people to use them (end cards on videos: "Beat my score: link in bio"), and give the top referrers free Pro.

## 11. Creative testing method (short version)

Test **hooks first, not edits**: the same 12 to 25 seconds of gameplay with 3 different first-3-second hooks. Keep the winner's hook, then test the body, then the CTA. A hook "wins" when its 3-second view rate and cost per click beat the median of its peers by at least 20% on a few thousand impressions. Detail in 06-MEASUREMENT.md.

## 12. What would make this fail, and the guard

- **Ads over-promise the game.** Show real gameplay by second 2; never fake a feature.
- **Health-claim rejections.** Follow 07-COMPLIANCE.md; keep ADHD ads about *design*, never about the viewer.
- **Paying for installs that never convert.** The stop-loss rules above and the payback math.
- **Burnt-out meme voice.** Keep brain-rot to one of five series; rotate; keep rigour in every ad ("it still teaches real vignettes").
- **Exam-season only.** The Pass and Lifetime plus the game's habit loop keep off-season users.
