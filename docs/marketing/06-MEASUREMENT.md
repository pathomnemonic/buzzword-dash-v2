# Measurement

How to know which ad, channel and message is working, using the analytics already built into the app (`docs/ANALYTICS.md`, `docs/ANALYTICS-GUIDE.md`). No ad-network SDK is needed to start, and none is shipped.

## 1. Tag every link (the UTM scheme)

Every link you put anywhere gets four parameters. The app reads them on first open (`js/analytics/attribution.js`), stores them on the install, and every report can then be split by them.

| Parameter | Use | Examples |
|---|---|---|
| `utm_source` | Where the person was | `tiktok`, `instagram`, `youtube`, `reddit`, `sdn`, `apple_search`, `google`, `creator_<handle>`, `campus_<school>` |
| `utm_medium` | How | `organic`, `paid_social` (counts as paid), `cpc`, `retargeting`, `creator`, `email`, `social` |
| `utm_campaign` | Which push | `launch`, `exam_step1_2027`, `free300`, `streak_rescue` |
| `utm_content` | Which creative | the **script id plus hook**, e.g. `B1_hookC`, `D2_v2`, `static_monster_feed` |

Rules: lowercase, no spaces (use `_`), same names every time. A spreadsheet of every link you have created is the best insurance against messy reports.

Medium values `cpc, ppc, paid, paidsocial, paid_social, paidsearch, display, cpm, cpv, retargeting, banner, affiliate` are grouped as the **paid** channel in reports; everything else is grouped as organic, social, email, campaign, share, search or referral.

**Where the link goes:**
- Landing page: `https://<site>/landing/?utm_source=...` (the page forwards the whole query string to the app when someone taps Play).
- The web app directly: `https://<site>/?utm_source=...`.
- **Store links are the weak point.** Apple and Google do not pass UTMs through the install. Use **Apple Custom Product Page links** (`?ppid=`) and **Google Play `referrer=` parameters** (`play.google.com/store/apps/details?id=<id>&referrer=utm_source%3Dtiktok%26utm_medium%3Dpaid_social%26utm_campaign%3Dlaunch`), and give each campaign its own. The Play referrer is read on first launch; Apple's page id is visible in App Store Connect analytics (not the app), so compare weekly installs per custom page there against `analytics_v_installs_by_week`.
- Sharing from inside the app tags itself: `utm_source=dxdash_share&utm_medium=<kind>&utm_campaign=viral&r=<code>`.

## 2. The question → the view that answers it

Run `npm run analytics:report` (or paste the view into the Supabase SQL editor).

| Question | View | What to look at |
|---|---|---|
| Which channel/campaign brings people who **stay**? | `analytics_v_acquisition` | `installs`, `ran_in_first_day_pct`, `d1_pct`, `d7_pct`, `runs_per_install` by `source`, `medium`, `campaign` |
| Is traffic growing, and from where? | `analytics_v_installs_by_week` | installs by week × channel × platform |
| Which landing page or referrer works? | `analytics_v_landing` | landing page and referring site |
| Do people get through onboarding? | `analytics_v_onboarding_funnel` | tutorial finished, first run |
| Do they come back? | `analytics_v_retention`, `analytics_v_retention_by_channel` | D1 / D7 / D30 by channel |
| Who sees the paywall and what do they do? | `analytics_v_paywall` | views → plan chosen → started → bought, by trigger and variant |
| Which free limit sells Pro? | `analytics_v_pro_gates` | which gate is hit, by how many installs |
| What is revenue by plan? | `analytics_v_pro_revenue` | weekly purchases, buyers, gross (before the store's cut) |
| Who has Pro now? | `analytics_v_pro_users` | active / trial by source and plan |
| Is the viral loop working? | `analytics_v_virality`, `analytics_v_top_referrers` | referred installs per active install; the people (by code) who bring friends |
| Do the numbers reflect everyone? | `analytics_v_consent` | opt-in rate; **all results only cover people who said yes**, so scale up accordingly |

Join your ad platform spend (from its dashboard) to `installs` by `utm_campaign` and `utm_content` in a spreadsheet to get **cost per install (CPI)**, **cost per first run**, and **cost per purchaser**. The platform's own "install" numbers overstate; trust ours for run-level quality.

## 3. The metrics that matter, in order

1. **Cost per *first run*** (not per install): an install that never runs is waste.
2. **D1 and D7 retention** by channel: this is what predicts revenue.
3. **Paywall view rate and buy rate** (`analytics_v_paywall`): tune the paywall, not the ad.
4. **Revenue per install** at day 30: `gross / installs` for the same cohort.
5. **Payback**: `revenue per install ÷ cost per install`. Scale spend only when payback is above 1 within about 60 days. Education has high renewal friction; do not model more than the first-year value (see MONETIZATION-STRATEGY.md).
6. **Viral coefficient** (`referred_per_active_install`): if above 0.1 sustained, organic is doing real work.

Vanity metrics to ignore: likes, raw views, follower count.

## 4. Creative testing method

**Test hooks, not edits.** Same body, three first-3-second hooks.

1. **Make the variants.** Take one body (say D1) and attach three hooks from the hook bank in 02. Name them `D1_hookA/B/C` in `utm_content`.
2. **Run them in parallel**, the same budget each ($15 to $20/day per variant is enough on TikTok). One ad set, creative-level split, same audience.
3. **Decide at about 2,000 to 5,000 impressions each (usually 2 to 4 days).** Compare 3-second view rate, click-through, and CPI. A hook **wins** when its 3-second view rate and click-through both beat the median of its peers by at least 20%.
4. **Second round:** keep the winning hook; test the **body** (two cuts), then the **CTA** (two end cards).
5. **Keep a log** (a spreadsheet: date, script id, hook, spend, impressions, 3-second rate, CTR, installs, first-run rate, D1). The learning is the asset.
6. **Refresh** every 3 to 4 weeks, or when frequency passes about 3, or when CTR halves.

Paywall and price tests are separate and use the app's own experiment system (`js/analytics/experiments.js`; `variant` appears in `analytics_v_paywall`). Change **one thing at a time** and wait for at least about 300 viewers per arm before reading a difference.

## 5. Stop-loss and scale rules

| Situation | Action |
|---|---|
| $75 spent, zero installs | Pause the ad |
| $150 spent, CPI above $3 and D1 under 25% | Pause the ad set |
| CPI under about $1.50, D1 at or above 35% | Raise the budget by 20% every 2 to 3 days |
| Frequency above 3 | New creative |
| A winner on one platform | Port the same hook to the other two within a week |
| Weekly spend exceeds last week's net revenue plus the planned test budget | Stop and reassess |

## 6. A weekly review (30 minutes)

1. `analytics_v_installs_by_week` and `analytics_v_acquisition`: what grew, what did not.
2. `analytics_v_retention_by_channel`: which channel's users stay.
3. `analytics_v_paywall` and `analytics_v_pro_revenue`: conversion and money.
4. Spend vs. installs in your ad dashboards; update the test log.
5. Decide: kill, keep, scale, and what 3 videos to make this week.

## 7. Sanity checks before you trust any number

- Click a UTM link yourself on a fresh browser profile and confirm a row appears in `analytics_installs` with the right `first_source`/`first_campaign` (unit tests cover the parser; check your **production** database too).
- Remember opt-in: only people who accepted the anonymous-statistics prompt appear. Use `analytics_v_consent` to see the share and be modest about small numbers.
- Do not compare Apple and Google CPIs without noting that Apple's attribution is thinner (custom product pages only).
