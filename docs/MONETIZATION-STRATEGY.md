# Dx Dash: monetization strategy (research and decisions)

_Researched October 2026. Sources are linked at the end. Where a number comes from a vendor blog or benchmark site it is a planning figure, not a promise; the plan is built so the first 60 days of real data replace them._

## 1. The decision in one paragraph

Dx Dash is **freemium with a content cap**: everyone gets the full game, friends, leaderboards and **300 hand-spread cards (20 in each of the 15 subjects)**. **Dx Dash Pro** unlocks the whole 3,010-card bank and the study tools. There are five ways in, ordered so the best-value one is the default: **Yearly with a 7-day free trial**, the **3-Month Dedicated Pass**, **Monthly**, **Lifetime**, and a cheaper **one-time "Full Library"** that unlocks only the cards. Nothing is limited anywhere there is no way to pay, so no one is ever locked out of something they cannot buy.

## 2. What the research says, and what we did with it

| Finding | Source | What we did |
|---|---|---|
| Hard-paywall apps convert download-to-paid at about 12% median vs about 2.2% for freemium, with roughly double year-one LTV; but hard paywalls work best when people arrive with high intent, and underperform when they arrive by browsing or leaderboards. | RevenueCat, Airbridge, Adapty | Dx Dash gets its growth from sharing, leaderboards, friends and short-form video, i.e. *browsing* traffic, so a hard paywall would kill the loop. We use freemium, but **cap the content** (300 cards) so the free tier is a real taste, not an endless free product. |
| Education apps: median download-to-paid about 3.1%, top decile about 8.7%. Education has the **strongest short-term retention** (weekly about 58%) but **weak annual renewal (about 24%)** because the goal ends when the exam does. | RevenueCat State of Subscription Apps | Plan for 3% conversion, hope for 5%+. Because renewal is weak, we **sell the exam window, not the year**: the 3-Month Dedicated Pass and a Lifetime option, plus yearly for the long tail (M1 to Step 3). |
| Education and Health apps run **longer trials (80% are 5 to 9+ days)**; trials are the strongest conversion tool when the trial offer is repeated through the paywall; annual plans are 59 to 66% of plan choices in education. | RevenueCat, Adapty | **7-day free trial on Yearly only**, shown in the plan label and the paywall status line, with "cancel any time". Yearly is the pre-eminent plan (gold button, first). |
| Paywall **timing outweighs design**; what happens in onboarding decides conversion. Paywall A/B tests move conversion 30 to 50%; price and plan tests are the highest-leverage. | RevenueCat, Airbridge | We do not show a paywall on first launch. The first moments are the tutorial and a run. The paywall appears **when someone reaches a limit they care about** (a locked subject view, Anki import, offline pack, the 301st card) or taps Unlock. The paywall has an experiment hook (`variant('pro_paywall')`) and every step is logged (`analytics_v_paywall`). |
| Price anchors in this category: AnkiMobile **$24.99 once**; Quizlet Plus **$7.99/mo or $35.99/yr**; Brainscape **$19.99/mo, $7.99/mo yearly, $199.99 lifetime**; Duolingo Super **$12.99/mo or $59.99/yr**; Finch Plus **$9.99/mo or $69.99/yr**; AMBOSS **$19.99/mo or $12.50/mo billed yearly** (full Qbank bundle **$448/yr**); UWorld up to about **$700**. | Vendor sites and price trackers | Dx Dash is a *supplement to* a question bank, not a replacement, so it is priced like a study app, **between Quizlet and Duolingo**, and far under a Qbank. See the price table. |
| Store fees: Google Play and Apple both take 15% on subscriptions and on small businesses; Apple's US storefront now allows external purchase links with no commission after the April 2025 ruling (under appeal). | Court/press coverage | In the apps we use in-app purchase. On the web we use a payment link (no store cut). We do **not** rely on the US external-link ruling; it is still being appealed. |
| UGC and creator video beat polished ads on TikTok and Reels; the first 1 to 3 seconds decide; 7 to 15 second Reels perform best; recycled/watermarked content is penalised. | RocketShip HQ, SmartSites, MediaPost | See the marketing plan. |
| Finch grew on a small creator-led TikTok strategy and relatable "tiny win" content (not aspirational wellness), reaching $2M+ MRR. | Growth mentor profile, MediaPost, Ad Age | Our wellbeing angle copies the *tone* (small, honest, kind), not the claims. |

## 3. Prices

Prices are for the US storefront. Other storefronts use the stores' price tiers, which scale automatically.

| Product id | What | Price | Role |
|---|---|---|---|
| `dxdash_pro_yearly` | Pro, auto-renewing (the 7-day trial is the account's, see below) | **$19.99 / year** (about $1.67 a month) | The default. Priced between Quizlet ($35.99) and Duolingo ($59.99). |
| `dxdash_pro_pass3m` | Pro for 3 months, auto-renewing | **$7.49 / 3 months** (about $2.50 a month) | The exam-window plan; low commitment. |
| `dxdash_pro_monthly` | Pro, monthly | **$3.49 / month** | The anchor that makes Yearly look like a 52% saving. |
| `dxdash_pro_lifetime` | Pro, one purchase, never expires | **$39.99** | Two years of the yearly plan; Brainscape sells lifetime at $199.99. Captures students who will not subscribe. |

**Update:** the cheaper "Full Library only" tier is no longer offered (one clear thing to buy converts better than a ladder). Instead every signed-in account gets a **free 7-day Pro trial with no card**, started automatically the first time the app sees it; guests get none, which is the nudge to make an account. The trial is the account's, so there is no store or Stripe trial on top.

Why Lifetime exists despite cannibalising recurring revenue: with education annual renewal at about 24%, a lifetime buyer is worth more than the average yearly buyer's second year, and it removes the cancellation churn problem. It is capped at four plans on screen (the config limit) so the paywall stays readable.

**Test, in this order, once there is traffic (each needs a few hundred paywall views per arm):** (1) default plan Yearly vs Pass; (2) trial 7 days vs 3 days vs none; (3) Yearly $39.99 vs $34.99 vs $49.99; (4) Library $14.99 vs $9.99; (5) paywall copy. Use `analytics.experiments` in `public/remote-config.json` and the `pro_paywall` variant.

## 4. What is free and what is Pro

| | Free | Pro |
|---|---|---|
| The game, all maps' mechanics, hero/monster Locker (earned with coins), friends, feed, leaderboards, Versus, daily quests, streaks, flashcards, basic stats | yes | yes |
| Cards | **300** (20 per subject, spread over difficulty and question type) | **All 3,010** |
| Shared games (the Daily, challenges, Versus, the weekly Gauntlet) | dealt from the free 300 for **everyone** so every player has the same cards | same |
| Detailed stats: subject breakdown, weakest concepts, exam-date pacing, report export | locked | yes |
| Anki / text deck import | locked | yes |
| Custom cards | 25 | unlimited |
| "Why" explanation after a miss (Study) | 8 a day | unlimited |
| Exam-sim blocks | 1 a week | unlimited |
| Offline pack | locked | yes |

Free is deliberately generous in the game and the social loop (that is where the sharing comes from) and limited in the *study depth* (that is what a student will pay for). The limits are all in `public/remote-config.json` and can be loosened without a release.

## 5. Revenue model (planning, not a forecast)

Assumptions: **3% of installs ever buy** (education median 3.1%), a purchase mix of 50% Yearly, 20% Pass, 10% Monthly (3 months average), 10% Library, 10% Lifetime.

| Per 10,000 installs | Gross | After 15% store fee |
|---|---|---|
| 300 payers × about $36 average first-year gross | about **$10,900** | about **$9,300** |
| Revenue per install | about **$1.09** | about **$0.93** |

At 5% (a good outcome): about **$1.55 per install** after fees. At 8.7% (top decile): about **$2.70**.

**What this means for advertising:** an install is worth roughly **$0.90 to $1.50** in the first year. Mobile game install ads in the US cost **$2 to $4.50 per install** (casual and arcade; TikTok and Meta CPIs have risen 15 to 20% year over year), and the education category looks even more expensive on Meta. So **broad paid installs do not pay back** until organic and creator content push the blended cost under about $1. That is why the marketing plan is organic- and creator-first, uses paid only to test creatives and to retarget, and sets hard stop-loss rules.

Revenue per install improves with: higher conversion (better paywall, trial), a bigger payer mix toward Lifetime and Yearly, referrals (free installs), and longer retention (the game loop). All of those are measured in the analytics views.

## 6. Risks and how they are handled

- **Education renews badly.** Sell the exam window (Pass, Lifetime); lean on the leaderboard and streaks for the long tail.
- **Free users who hit the cap and leave.** 300 cards is a lot of play (at 20 cards a day, 15 days before repeats; weaker students repeat anyway, which is the learning). The strip says "300 of 3,010" and never nags during a run.
- **Review risk.** Apple wants the price, period, trial terms and a clear way to cancel next to the buy button (the paywall shows them), a Restore Purchases button (present), and no tricks. Google wants the same. Pro must unlock real value (it does); tips unlock nothing.
- **Trust in a medical product.** No "guaranteed pass" claims anywhere (see the compliance notes).
- **Piracy and refunds.** Client-side entitlement can be spoofed on a rooted phone; receipt validation can be added later without changing the screens.
- **Existing web users.** The web build only limits things when a payment link (`VITE_PRO_WEB_URL`) is configured. Until then the web stays fully free.

## 7. Launch checklist (money side)

See `docs/PRO.md` for the exact store setup. In short: create the five products with the ids above in both stores (the three subscriptions in one subscription group, Lifetime and Library as non-consumables), run `database/pro.sql`, set the Stripe link for web, add the subscription wording to the privacy policy and terms, then ship. Watch `analytics_v_paywall`, `analytics_v_pro_revenue`, `analytics_v_pro_gates` and `analytics_v_pro_users`.

## Sources

- RevenueCat, [State of Subscription Apps 2025](https://www.revenuecat.com/state-of-subscription-apps-2025) and the [2026 Education report](https://www.revenuecat.com/state-of-subscription-apps-2026-education); [renewal rates by category](https://www.revenuecat.com/blog/growth/average-subscription-renewal-rates-by-app-category)
- RevenueCat, [hard paywall vs freemium](https://www.revenuecat.com/blog/growth/hard-paywall-vs-freemium); Airbridge, [hard paywall vs freemium 2026](https://www.airbridge.io/en/blog/hard-paywall-vs-freemium-2026) and [paywall structural decisions](https://www.airbridge.io/en/blog/paywall-conversion-structural-decisions); Adapty, [freemium to premium](https://adapty.io/blog/freemium-to-premium-conversion-techniques)
- RevenueCat, [paywall conversion boosters](https://www.revenuecat.com/blog/growth/paywall-conversion-boosters.md) and [paywall tests](https://www.revenuecat.com/blog/paywall-tests-grow-app-revenue/)
- Lecturio, [Best USMLE Qbanks 2026](https://www.lecturio.com/blog/best-usmle-qbanks-2026-uworld-vs-amboss-vs-lecturio/); iatrox, [why AMBOSS costs what it costs](https://www.iatrox.com/blog/why-amboss-costs-what-it-costs-honest-breakdown)
- [Is Anki free? costs](https://mandarinmosaic.com/blog/is-anki-free); [Quizlet Plus price](https://www.thepricer.org/how-much-does-quizlet-plus-cost/); [Duolingo Super price](https://www.thepricer.org/how-much-does-super-duolingo-cost/); [Brainscape pricing](https://softwarefinder.com/lms/brainscape/pricing); [Finch pricing](https://toolradar.com/tools/finch/pricing)
- [Apple external purchase ruling summary](https://fkks.com/news/court-finds-apple-violated-order-resulting-in-key-changes-for-ios-external-purchase-methods) and [ppc.land](https://ppc.land/apple-forced-to-eliminate-commissions-on-external-purchases-after-contempt-ruling/)
- Mobile CPI: [Segwise benchmarks](https://segwise.ai/blog/cpi-ipm-roas-benchmarks-optimizing-ad-spend/), [Mapendo](https://mapendo.co/blog/cost-per-install-2025-the-ultimate-report-to-grow-your-app-worldwide), [Superads education US](https://www.superads.ai/facebook-ads-costs/cost-per-app-install/education/united-states)
