# Production plan

Part 1 is what is **already produced and in the repo**. Part 2 is **exactly how to produce everything else** (the things that need a human, a camera, a voice or a store account), in the order that pays back fastest.

## Part 1. Produced here (re-renderable)

Everything is generated from the real app, so it never shows a feature that does not exist.

| Asset | Where | Notes |
|---|---|---|
| 9 ad concepts × 4 sizes = **36 static ads** | `assets/static/<concept>-<format>.png` | feed 1080×1350 (4:5), story/reel 1080×1920 (9:16), square 1080×1080, wide 1200×628. Concepts: `same-phone-time`, `doomscroll-less`, `brain-rot`, `monster`, `streak`, `adhd-design`, `free-300`, `accessible`, `beat-my-score` |
| **3 kinetic-text vertical videos** (12 to 14 s, 1080×1920, H.264, silent) | `assets/video/*.mp4` | `brain-rot-friendly` (series B1), `same-phone-time` (A1/A2), `adhd-friendly-design` (C1). They use real gameplay stills; add music and a voice line in CapCut (below) |
| 7 real app screenshots (390×844 @3×) | `assets/screens/` | home, locker, quests, stats, two real 3D runs. Used by the ads, the landing page and the store listings |
| Landing page | `public/landing/index.html` → `/landing/` on the live site | Keeps `utm_*`, `r`, click ids on the "Play" buttons so the app's attribution sees the campaign (see 06) |
| Source templates and the renderer | `assets/src/*.html`, `tools/make-ads.mjs` | `node tools/make-ads.mjs` re-renders everything; edit `CONCEPTS` / `VIDEOS` at the top for new copy |

To make a new static ad: add an object to `CONCEPTS` (headline with `[[gold word]]`, one sub line, which screen, accent colour, small print), run `node tools/make-ads.mjs --static`, upload the four PNGs. To add a video, add scenes to `VIDEOS` (each is `[start, end, html]`) and run `--video`.

The static ads and kinetic videos are **good enough to run today** as tests. They are not a replacement for real people and real gameplay (Part 2): the best-performing mobile-game and study-app ads are almost always a real screen recording with a human voice or a creator reacting.

## Part 2. What still needs a human (and how)

### 2.1 Real gameplay capture (do this first, 1 hour, $0)

You need 10 clean vertical gameplay clips. They feed almost every script (series D and the middle of A, B, C).

1. **Device.** A recent phone (iPhone 12+ or a Pixel/Samsung from the last 3 years). Do Not Disturb on, battery above 50%, brightness 100%, notifications off, airplane mode plus Wi-Fi if you want a clean status bar. Install the real build.
2. **Settings.** Turn sound **on** (the music is part of the feel). Pick the hero with the most charm and a trail with visible particles; unlock two or three maps so you can cut between them.
3. **Record.** iOS: Control Center screen recording (60 fps). Android: the built-in screen recorder at 1080p, 60 fps. Record landscape-free vertical. 10 takes of 60 to 90 seconds each, not chopped: pick the moments later.
4. **Moments to hunt for** (each is a hook):
   - A **near-miss dash** past the monster.
   - A **streak flourish** (the combo lights).
   - A **power-up combo**.
   - A **wrong gate** then the explanation card (shows it teaches).
   - A **gauntlet** or **versus** moment.
   - The **countdown with the monster's face**.
   - A **map reveal** (Pediatric Playland, Aquarium, Rooftop).
5. **Clean-up.** Trim to the moment, crop the status bar if it shows a carrier, export 1080×1920.

A desktop alternative that needs no phone: `npx vite preview`, open the app in Chromium's mobile emulator at 390×844, and record with OBS (60 fps, 1080×1920 canvas). The in-repo screenshots were captured this way with Playwright.

### 2.2 Editing (CapCut, free; or a freelancer at $150 to $300 per 10 cuts)

Standard recipe for every video (matches the script format in 02):
1. **Hook in the first 2 seconds**: either a gameplay moment already in motion or a text line from the hook bank. Never a logo.
2. **Burned-in captions** (CapCut auto-captions, fix the medical terms by hand). Most viewers watch muted.
3. **Cut every 1.5 to 2.5 seconds**; the game itself is the B-roll.
4. **Sound:** a licensed or royalty-free track from the platform's commercial library (see 07). Add the in-game coin and correct-gate sounds on key beats (they are in the app's audio files).
5. **End card (last 1.5 s):** DX DASH wordmark, "Free to start", store badges; use the `assets/static/*-story.png` file as the end card if you want it on-brand.
6. Export 1080×1920, H.264, 30 or 60 fps, a few MB per 15 seconds (smaller uploads faster).

Make **3 hooks per body** (see the hook bank in 02) so you can test hooks, not edits (06).

### 2.3 Voice and on-camera

| Need | Cheapest good option | Cost |
|---|---|---|
| A "founder voice" for the story ("I built a game so I'd stop doomscrolling during boards") | Record yourself on a phone in a quiet room, or in a closet full of clothes, 30 seconds at a time. The unpolished version outperforms the polished one in this category | $0 |
| A consistent narrator voice | ElevenLabs or a similar text-to-voice tool (read the terms for commercial use and disclose synthetic voices where the platform asks) | $5 to $22 / month |
| Creator reactions (series A/B/E) | UGC creators (below) | $150 to $500 per video |
| Real students saying real lines | Your own beta users: ask for a 15-second selfie video in exchange for a free Lifetime code; get written permission | $0 |

### 2.4 Creators and UGC (the highest-ROI paid item)

- **Where to find them:** TikTok Creator Marketplace, Instagram search for `#medschool #medstudent #step1 #studytok #medtok`, the "study with me" YouTubers who post 5k to 100k followers, and your own users who already post. Marketplaces (Insense, Billo, Collabstr) cost more but remove admin.
- **Who:** medical, DO, pre-med and PA students with 3k to 80k followers. Micro-creators are cheaper, believable, and convert better than celebrities.
- **Budget:** $150 to $500 per video for micro-creators (UGC averages about $200; TikTok micro-influencer $200 to $800), plus a free Lifetime Pro code. Start with 10.
- **Brief (copy this):** goal; the one pillar to hit (pick from 01); required: show real gameplay in the first 3 seconds, say "free to start", disclose with `#ad` or the platform's paid-partnership tool (FTC rule, see 07); forbidden: guarantees, "cure/treat", "do you have ADHD" lines, the word "USMLE" as an endorsement; deliver: raw vertical file, 3 hook variations, usage rights for **30 days of paid use** (Spark Ads / partnership ads) in the contract.
- **Contract basics:** a one-page agreement: fee, deliverables, deadline, usage rights and period, disclosure, no disparagement, payment on delivery. Offer a bonus per 1,000 installs by creator code (`pro_codes` supports unique codes, and `analytics_v_top_referrers` shows who brought installs).

### 2.5 Store creative (do before launch)

- **Screenshots (6 to 8):** reuse `assets/screens/`; add the gold headline bar from `assets/static/*-story.png` style. Order: (1) real run with the question, (2) the streak and monster, (3) the 300 free / 3,010 total, (4) the locker, (5) the study stats, (6) friends and the Gauntlet, (7) accessibility. First two screenshots do most of the conversion work.
- **App preview video (15 to 30 s):** cut from 2.1; first 3 seconds are gameplay. Apple requires it to be actual in-app footage; Google allows a YouTube URL.
- **Feature graphic (Google, 1024×500):** crop from the `wide` format of any concept.
- Both stores have **custom product pages / store listing experiments** (Apple: Product Page Optimization; Google: Store Listing Experiments). Use them to test the first screenshot.

### 2.6 Things that need an account or a legal person

| Item | Who | Notes |
|---|---|---|
| Apple Search Ads, Google Ads, TikTok Ads, Meta Ads accounts | You | Verify the business, add a card, install the platform SDK **only if** you want their install attribution (not required: our first-party analytics attributes via UTMs and the store's referrer, see 06) |
| Store listings and in-app products | You | `docs/PRO.md` and `store/` list product IDs, prices and the policy answers |
| Press kit and one-pager | You | Use the pitch in 03 section 10; include 3 screenshots and the founder story |
| Trademarks (USMLE®, COMLEX-USA®) | Anyone running ads | Only descriptive use; see 07 |

### 2.7 Schedule (4 weeks to a first full launch)

| Week | What | Output |
|---|---|---|
| −3 | Record gameplay (2.1); render static ads; set up landing page; store listing | 10 clips; 36 ads; page live |
| −2 | Edit 20 videos (D1, D2, A1, B1, B3, C1, C5, A6, E3, B6 first); recruit 10 creators; write the Reddit and SDN posts | Videos queued |
| −1 | Beta users post; internal test of the attribution (a UTM link → install → `analytics_v_acquisition`) | Measurement works |
| 0 | Launch: 2 organic posts a day, creators go live, $20/day Spark Ads on the best organic | First data |

### 2.8 Cost to produce (lean)

| Item | Cost |
|---|---|
| Gameplay capture, editing in CapCut, voice by you | $0 |
| Freelance editor (20 cuts) | $300 to $600 |
| 10 micro-creator videos | $1,500 to $2,500 |
| Voice tool | $5 to $22 / month |
| Music | $0 (platform libraries) to $15 / month |
| **Total to be fully stocked** | **about $2,000 to $3,500**, within the $10k plan in 01 |
