-- ================================================================
-- Dx Dash Pro: who has it, and the codes that grant it. Safe to run again.
--
-- Pro bought in the phone apps lives in the store (Google Play / App Store) and is read from there. This file is for
-- everything else: web payments (a Stripe webhook or you, with the service key, calls pro_grant), promo and
-- ambassador codes, and school or group seats (hand out codes). The app can only ask "do I have Pro?" and "redeem
-- this code"; it cannot grant itself anything.
--
-- Handing out a code (SQL editor):
--   INSERT INTO pro_codes (code, days, max_uses, note) VALUES ('LAUNCH30', 30, 500, 'launch week');
-- Granting by hand / from a webhook (service role):
--   SELECT pro_grant('<user uuid>', 365, 'yearly', 'stripe');
-- ================================================================

CREATE TABLE IF NOT EXISTS pro_entitlements (
  user_id uuid PRIMARY KEY,
  plan text NOT NULL DEFAULT 'pro',
  source text NOT NULL DEFAULT 'manual',
  until timestamptz NOT NULL,
  trial boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- When this stretch of Pro began: kept across renewals, restarted after a lapse or when a trial turns into a purchase.
-- The monthly Locker gift counts its months from here.
ALTER TABLE pro_entitlements ADD COLUMN IF NOT EXISTS started_at timestamptz NOT NULL DEFAULT now();

-- Every grant of Pro, kept apart by where it came from (issue 55): one row per member and source ('stripe', 'store',
-- 'trial', 'code', 'manual'). Within a source, grants behave exactly as the single summary row always did: the
-- longest wins and a shorter one never shortens it. Across sources they no longer destroy each other.
-- pro_entitlements above stays the summary the app reads: the longest-running grant is the one the member holds.
-- Before this table existed the summary was the only record, so revoking the grant it happened to show erased any
-- other source's grant underneath it for good.
CREATE TABLE IF NOT EXISTS pro_grants (
  user_id uuid NOT NULL,
  source text NOT NULL,
  plan text NOT NULL DEFAULT 'pro',
  until timestamptz NOT NULL,
  trial boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, source)
);
ALTER TABLE pro_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pro_grants FROM PUBLIC, anon, authenticated;

-- Grants made before this table existed, taken from the summary rows (the only record there was).
INSERT INTO pro_grants (user_id, source, plan, until, trial, started_at)
SELECT user_id, source, plan, until, trial, started_at
FROM pro_entitlements
ON CONFLICT (user_id, source) DO NOTHING;

-- Rebuild the summary row from the grants: the longest-running grant is the one the member holds. The summary's
-- started_at is kept as it is (grants maintain it under the usual rules); a fresh summary takes the winning
-- grant's. Used where a grant can shrink or disappear: store grants and revocations. Service role only.
CREATE OR REPLACE FUNCTION pro_recompute_entitlement(p_user uuid) RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE best pro_grants%ROWTYPE;
BEGIN
  SELECT * INTO best FROM pro_grants WHERE user_id = p_user ORDER BY until DESC, updated_at DESC LIMIT 1;
  IF NOT FOUND THEN
    DELETE FROM pro_entitlements WHERE user_id = p_user;
    RETURN NULL;
  END IF;
  INSERT INTO pro_entitlements AS e (user_id, plan, source, until, trial, updated_at, started_at)
  VALUES (p_user, best.plan, best.source, best.until, best.trial, now(), best.started_at)
  ON CONFLICT (user_id) DO UPDATE SET
    plan = excluded.plan, source = excluded.source, until = excluded.until, trial = excluded.trial, updated_at = now();
  RETURN best.until;
END $$;
REVOKE ALL ON FUNCTION pro_recompute_entitlement(uuid) FROM PUBLIC, anon, authenticated;

-- Locker items bought with real money (the premium items). One row per member and item; kept for good unless refunded.
CREATE TABLE IF NOT EXISTS pro_items (
  user_id uuid NOT NULL,
  item_id text NOT NULL CHECK (item_id ~ '^[a-z0-9_]{3,64}$'),
  source text NOT NULL DEFAULT 'stripe',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);
-- Which payment bought it, so paying twice for the same item is noticed (and the second payment can be returned) and a
-- refund of that second payment cannot take away the item the first one paid for.
ALTER TABLE pro_items ADD COLUMN IF NOT EXISTS payment_ref text;
ALTER TABLE pro_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS pro_codes (
  code text PRIMARY KEY CHECK (code = upper(code) AND code ~ '^[A-Z0-9_-]{4,32}$'),
  days integer NOT NULL CHECK (days BETWEEN 1 AND 3650),
  max_uses integer NOT NULL DEFAULT 1 CHECK (max_uses >= 1),
  used integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pro_redemptions (
  code text NOT NULL REFERENCES pro_codes (code) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (code, user_id)
);

-- failed guesses per user per hour (stops code guessing)
CREATE TABLE IF NOT EXISTS pro_attempts (
  user_id uuid NOT NULL,
  hour timestamptz NOT NULL,
  n integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, hour)
);

-- web payments (Stripe): who paid, which Stripe customer is whose, and which webhook events were already handled
CREATE TABLE IF NOT EXISTS pro_library (
  user_id uuid PRIMARY KEY,
  source text NOT NULL DEFAULT 'manual',
  granted_at timestamptz NOT NULL DEFAULT now()
);
-- the free trial every signed-in (not guest) account gets once
CREATE TABLE IF NOT EXISTS pro_trials (
  user_id uuid PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pro_stripe_customers (
  customer_id text PRIMARY KEY,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pro_stripe_customers_user ON pro_stripe_customers (user_id);
CREATE TABLE IF NOT EXISTS pro_stripe_events (
  event_id text PRIMARY KEY,
  kind text,
  handled_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pro_trials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pro_trials FROM PUBLIC, anon, authenticated;
ALTER TABLE pro_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE pro_stripe_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE pro_stripe_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pro_library, pro_stripe_customers, pro_stripe_events FROM PUBLIC, anon, authenticated;

ALTER TABLE pro_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE pro_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE pro_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pro_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pro_entitlements, pro_codes, pro_redemptions, pro_attempts, pro_items FROM PUBLIC, anon, authenticated;

-- Is the caller a guest (anonymous sign-in, no account)? Guests get no trial: it is the reason to create an account.
CREATE OR REPLACE FUNCTION pro_is_guest() RETURNS boolean
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
$$;

-- Do I have Pro right now? { active, until, plan, source, trial, since, library, trial_available }
-- (library: I hold the one-time Full Library unlock from before it was withdrawn, which opens every card but not the tools;
--  trial_available: I have an account, have never had the free trial and have no Pro, so the app may start it)
CREATE OR REPLACE FUNCTION get_my_pro() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); r pro_entitlements%ROWTYPE; lib boolean; can_trial boolean; its jsonb;
BEGIN
  IF me IS NULL THEN RETURN jsonb_build_object('active', false, 'library', false, 'trial_available', false, 'items', '[]'::jsonb, 'signed_in', false); END IF;
  its := coalesce((SELECT jsonb_agg(item_id ORDER BY created_at) FROM pro_items WHERE user_id = me), '[]'::jsonb);
  lib := EXISTS (SELECT 1 FROM pro_library WHERE user_id = me);
  can_trial := NOT pro_is_guest() AND NOT EXISTS (SELECT 1 FROM pro_trials WHERE user_id = me);
  SELECT * INTO r FROM pro_entitlements WHERE user_id = me;
  IF NOT FOUND OR r.until <= now() THEN RETURN jsonb_build_object('active', false, 'library', lib, 'trial_available', can_trial, 'items', its, 'signed_in', true); END IF;
  RETURN jsonb_build_object('active', true, 'until', r.until, 'plan', r.plan, 'source', r.source, 'trial', r.trial, 'since', r.started_at, 'library', lib, 'trial_available', false, 'items', its, 'signed_in', true);
END $$;

-- Start my free trial: seven days of Pro, once per account, for a signed-in (not guest) player who has no Pro.
CREATE OR REPLACE FUNCTION start_my_trial() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); new_until timestamptz;
BEGIN
  IF me IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Sign in first.'); END IF;
  IF pro_is_guest() THEN RETURN jsonb_build_object('ok', false, 'error', 'Create an account to get your free trial.'); END IF;
  IF EXISTS (SELECT 1 FROM pro_entitlements WHERE user_id = me AND until > now()) THEN RETURN jsonb_build_object('ok', false, 'error', 'You already have Pro.'); END IF;
  BEGIN
    INSERT INTO pro_trials (user_id) VALUES (me);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'The free trial has already been used.');
  END;
  new_until := pro_grant_until(me, now() + interval '7 days', 'trial', 'trial', true);
  RETURN jsonb_build_object('ok', true, 'until', new_until, 'days', 7);
END $$;

-- Give Pro for some days (adds to what is left). Service role / SQL editor only.
-- The days land on the grant row for their source (issue 55), added to that source's remaining time, and the summary
-- is extended by the same additive rule it has always had.
CREATE OR REPLACE FUNCTION pro_grant(p_user uuid, p_days integer, p_plan text DEFAULT 'pro', p_source text DEFAULT 'manual', p_trial boolean DEFAULT false) RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_until timestamptz;
BEGIN
  IF p_days IS NULL OR p_days < 1 OR p_days > 3650 THEN RAISE EXCEPTION 'days must be 1 to 3650'; END IF;
  INSERT INTO pro_grants AS g (user_id, source, plan, until, trial, updated_at, started_at)
  VALUES (p_user, coalesce(p_source, 'manual'), coalesce(p_plan, 'pro'), now() + make_interval(days => p_days), coalesce(p_trial, false), now(), now())
  ON CONFLICT (user_id, source) DO UPDATE SET
    until = greatest(g.until, now()) + make_interval(days => p_days),
    plan = excluded.plan, trial = excluded.trial AND g.until > now(), updated_at = now(),
    started_at = CASE WHEN g.until <= now() OR (g.trial AND NOT excluded.trial) THEN now() ELSE g.started_at END;
  INSERT INTO pro_entitlements AS e (user_id, plan, source, until, trial, updated_at, started_at)
  VALUES (p_user, coalesce(p_plan, 'pro'), coalesce(p_source, 'manual'), now() + make_interval(days => p_days), coalesce(p_trial, false), now(), now())
  ON CONFLICT (user_id) DO UPDATE SET
    until = greatest(e.until, now()) + make_interval(days => p_days),
    plan = excluded.plan, source = excluded.source, trial = excluded.trial AND e.until > now(), updated_at = now(),
    started_at = CASE WHEN e.until <= now() OR (e.trial AND NOT excluded.trial) THEN now() ELSE e.started_at END
  RETURNING until INTO new_until;
  RETURN new_until;
END $$;

-- End someone's Pro now, every grant of it. Service role / SQL editor only.
CREATE OR REPLACE FUNCTION pro_revoke(p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE pro_grants SET until = now(), updated_at = now() WHERE user_id = p_user;
  UPDATE pro_entitlements SET until = now(), updated_at = now() WHERE user_id = p_user;
END $$;

-- Give a member a premium Locker item they paid for (safe to repeat). Service role only.
-- Returns 'granted' (new), 'already' (the same payment again, or an older item with no payment on record) or 'duplicate'
-- (they already own it from a DIFFERENT payment: the second payment should be returned).
DROP FUNCTION IF EXISTS pro_grant_item(uuid, text, text);
CREATE OR REPLACE FUNCTION pro_grant_item(p_user uuid, p_item text, p_source text DEFAULT 'stripe', p_ref text DEFAULT NULL) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE had text; have boolean;
BEGIN
  INSERT INTO pro_items (user_id, item_id, source, payment_ref) VALUES (p_user, p_item, coalesce(p_source, 'stripe'), p_ref)
  ON CONFLICT (user_id, item_id) DO NOTHING;
  IF FOUND THEN RETURN 'granted'; END IF;
  SELECT payment_ref INTO had FROM pro_items WHERE user_id = p_user AND item_id = p_item;
  IF had IS NULL THEN
    IF p_ref IS NULL THEN RETURN 'already'; END IF;
    -- The item is owned with no payment on record (a grant from before refs were kept, or one made by hand), and a
    -- NEW payment has arrived for it (issue 54). That payment bought nothing the member did not already have, so it
    -- is a duplicate: the caller returns the money. The new ref is NOT attached — the item belongs to the earlier
    -- payment, and attaching this one would let this payment's refund take the item away.
    RETURN 'duplicate';
  END IF;
  IF p_ref IS NULL OR p_ref = had THEN RETURN 'already'; END IF;
  RETURN 'duplicate';
END $$;

-- Take back a premium item after a full refund. Service role only.
-- With p_ref, only if that payment is the one that bought it (the refund of a duplicate payment must not take the item).
DROP FUNCTION IF EXISTS pro_revoke_item(uuid, text);
CREATE OR REPLACE FUNCTION pro_revoke_item(p_user uuid, p_item text, p_ref text DEFAULT NULL) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM pro_items WHERE user_id = p_user AND item_id = p_item AND (p_ref IS NULL OR payment_ref IS NULL OR payment_ref = p_ref);
$$;

-- Does this member already own this premium item? Service role only (the checkout function uses it to stop a double purchase).
CREATE OR REPLACE FUNCTION pro_has_item(p_user uuid, p_item text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM pro_items WHERE user_id = p_user AND item_id = p_item);
$$;

-- Take back only a particular plan (a refunded lifetime must not end a subscription the same person also holds). Service role only.
-- Only the purchase grants for that plan go (issue 55): the Stripe or store row holding that plan is removed and the
-- summary is rebuilt from what is left, so a grant from another source underneath survives the refund. Within one
-- source the richest grant is the row, exactly as the single summary row behaved before: a lifetime bought over a
-- subscription from the same source replaced it, and refunding the lifetime ends that source's grant.
CREATE OR REPLACE FUNCTION pro_revoke_plan(p_user uuid, p_plan text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM pro_grants WHERE user_id = p_user AND plan = p_plan AND source IN ('stripe', 'store');
  IF FOUND THEN
    PERFORM pro_recompute_entitlement(p_user);
  ELSIF NOT EXISTS (SELECT 1 FROM pro_grants WHERE user_id = p_user) THEN
    -- no grants on record at all (state from before the grants were kept apart): the summary is the only record
    UPDATE pro_entitlements SET until = now(), updated_at = now() WHERE user_id = p_user AND plan = p_plan;
  END IF;
END $$;

-- Forget a member's payment records when their account is deleted (these tables hold a user id but, unlike the rest of the
-- app's data, do not cascade from the login). Service role / the delete function only.
-- p_final is true only when the login itself is being deleted. An app-only deletion keeps the Sign in with Apple token
-- (issue 66): the token exists so a later delete-everywhere can revoke the Apple login, and deleting it here would
-- quietly make that revocation impossible.
DROP FUNCTION IF EXISTS pro_forget_user(uuid);
DROP FUNCTION IF EXISTS pro_forget_user(uuid, boolean);
CREATE OR REPLACE FUNCTION pro_forget_user(p_user uuid, p_final boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM pro_entitlements WHERE user_id = p_user;
  DELETE FROM pro_grants WHERE user_id = p_user;
  DELETE FROM pro_items WHERE user_id = p_user;
  DELETE FROM pro_library WHERE user_id = p_user;
  DELETE FROM pro_trials WHERE user_id = p_user;
  DELETE FROM pro_redemptions WHERE user_id = p_user;
  DELETE FROM pro_attempts WHERE user_id = p_user;
  DELETE FROM pro_stripe_customers WHERE user_id = p_user;
  IF coalesce(p_final, false) THEN
    DELETE FROM apple_tokens WHERE user_id = p_user;
  END IF;
  DELETE FROM pro_store_purchases WHERE user_id = p_user;
END $$;

-- The one-argument form is the final deletion, the meaning it has always had for the account-deletion code in
-- schema.sql: the login itself is going, so the Apple token goes with everything else.
CREATE OR REPLACE FUNCTION pro_forget_user(p_user uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT pro_forget_user(p_user, true);
$$;

-- The Sign in with Apple token of an account, kept only so that deleting the account can revoke it (an App Store rule).
-- Service role only; it is removed with the account.
CREATE TABLE IF NOT EXISTS apple_tokens (
  user_id uuid PRIMARY KEY,
  refresh_token text NOT NULL,
  saved_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE apple_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON apple_tokens FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION apple_token_save(p_user uuid, p_token text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO apple_tokens (user_id, refresh_token) VALUES (p_user, p_token)
  ON CONFLICT (user_id) DO UPDATE SET refresh_token = excluded.refresh_token, saved_at = now();
$$;
CREATE OR REPLACE FUNCTION apple_token_get(p_user uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT refresh_token FROM apple_tokens WHERE user_id = p_user;
$$;
REVOKE ALL ON FUNCTION apple_token_save(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION apple_token_get(uuid) FROM PUBLIC, anon, authenticated;

-- Purchases made through Google Play or the App Store and checked with them (supabase/functions/iap-verify). One purchase
-- belongs to one account: the first account to present it keeps it. Service role only.
CREATE TABLE IF NOT EXISTS pro_store_purchases (
  platform text NOT NULL CHECK (platform IN ('android', 'ios')),
  store_key text NOT NULL,
  user_id uuid NOT NULL,
  product_id text NOT NULL,
  expires_at timestamptz,
  revoked boolean NOT NULL DEFAULT false,
  verified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (platform, store_key)
);
ALTER TABLE pro_store_purchases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pro_store_purchases FROM PUBLIC, anon, authenticated;

-- Record a checked purchase for an account. 'ok' (new, or the same account again), or 'other_account' when a different
-- account already holds this purchase.
CREATE OR REPLACE FUNCTION pro_store_claim(p_platform text, p_key text, p_user uuid, p_product text, p_expires timestamptz, p_revoked boolean) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner uuid;
BEGIN
  SELECT user_id INTO owner FROM pro_store_purchases WHERE platform = p_platform AND store_key = p_key FOR UPDATE;
  IF FOUND THEN
    IF owner <> p_user THEN RETURN 'other_account'; END IF;
    UPDATE pro_store_purchases SET expires_at = p_expires, revoked = coalesce(p_revoked, false), verified_at = now(), product_id = p_product
    WHERE platform = p_platform AND store_key = p_key;
    RETURN 'ok';
  END IF;
  BEGIN
    INSERT INTO pro_store_purchases (platform, store_key, user_id, product_id, expires_at, revoked) VALUES (p_platform, p_key, p_user, p_product, p_expires, coalesce(p_revoked, false));
  EXCEPTION WHEN unique_violation THEN
    -- Someone claimed it between the check and the insert. That is only 'other_account' if it really is someone
    -- else (issue 63): two simultaneous first-time claims by the SAME account raced, and one of them landed here.
    SELECT user_id INTO owner FROM pro_store_purchases WHERE platform = p_platform AND store_key = p_key;
    IF NOT FOUND OR owner <> p_user THEN RETURN 'other_account'; END IF;
    UPDATE pro_store_purchases SET expires_at = p_expires, revoked = coalesce(p_revoked, false), verified_at = now(), product_id = p_product
    WHERE platform = p_platform AND store_key = p_key;
    RETURN 'ok';
  END;
  RETURN 'ok';
END $$;
REVOKE ALL ON FUNCTION pro_store_claim(text, text, uuid, text, timestamptz, boolean) FROM PUBLIC, anon, authenticated;

-- Redeem a code: { ok, until } or { ok: false, error }. Ten wrong guesses an hour is the limit.
CREATE OR REPLACE FUNCTION redeem_pro_code(p_code text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := auth.uid();
  c pro_codes%ROWTYPE;
  h timestamptz := date_trunc('hour', now());
  tries integer;
  new_until timestamptz;
BEGIN
  IF me IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Sign in first.'); END IF;
  -- a code is tied to one real account (an email and a password), never to a guest, so it cannot be passed around
  IF pro_is_guest() THEN RETURN jsonb_build_object('ok', false, 'error', 'Create a free account first (Friends → Account), so the code is tied to you.'); END IF;
  INSERT INTO pro_attempts (user_id, hour, n) VALUES (me, h, 0) ON CONFLICT DO NOTHING;
  SELECT n INTO tries FROM pro_attempts WHERE user_id = me AND hour = h;
  IF tries >= 10 THEN RETURN jsonb_build_object('ok', false, 'error', 'Too many tries. Please wait an hour.'); END IF;
  SELECT * INTO c FROM pro_codes WHERE code = upper(trim(coalesce(p_code, ''))) FOR UPDATE;
  IF NOT FOUND OR (c.expires_at IS NOT NULL AND c.expires_at < now()) OR c.used >= c.max_uses THEN
    UPDATE pro_attempts SET n = n + 1 WHERE user_id = me AND hour = h;
    RETURN jsonb_build_object('ok', false, 'error', 'That code is not valid.');
  END IF;
  IF EXISTS (SELECT 1 FROM pro_redemptions WHERE code = c.code AND user_id = me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You already used that code.');
  END IF;
  INSERT INTO pro_redemptions (code, user_id) VALUES (c.code, me);
  UPDATE pro_codes SET used = used + 1 WHERE code = c.code;
  new_until := pro_grant(me, c.days, 'pro', 'code', false);
  RETURN jsonb_build_object('ok', true, 'until', new_until, 'days', c.days);
END $$;

-- Set Pro to last until an exact moment (a web subscription: the end of the period just paid). Service role only.
-- The grant lands on its own source's row (issue 55), so it never overwrites another source's grant, and the summary
-- is extended from it under the rules it has always had. Within its row, a web (Stripe) grant only ever grows,
-- while a store grant is set exactly as the store reports it (issue 53): Google or Apple shortening a
-- subscription's expiry, or ending it early, must take effect; the summary is then rebuilt from every grant held.
CREATE OR REPLACE FUNCTION pro_grant_until(p_user uuid, p_until timestamptz, p_plan text DEFAULT 'pro', p_source text DEFAULT 'stripe', p_trial boolean DEFAULT false) RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_source text := coalesce(p_source, 'stripe'); v_plan text := coalesce(p_plan, 'pro'); new_until timestamptz;
BEGIN
  IF p_until IS NULL OR p_until > now() + interval '3651 days' THEN RAISE EXCEPTION 'until is out of range'; END IF;
  IF v_source = 'store' THEN
    INSERT INTO pro_grants AS g (user_id, source, plan, until, trial, updated_at, started_at)
    VALUES (p_user, v_source, v_plan, p_until, coalesce(p_trial, false), now(), now())
    ON CONFLICT (user_id, source) DO UPDATE SET
      until = excluded.until, plan = excluded.plan, trial = excluded.trial, updated_at = now(),
      started_at = CASE WHEN g.until <= now() OR (g.trial AND NOT excluded.trial) THEN now() ELSE g.started_at END;
    RETURN pro_recompute_entitlement(p_user);
  END IF;
  INSERT INTO pro_grants AS g (user_id, source, plan, until, trial, updated_at, started_at)
  VALUES (p_user, v_source, v_plan, p_until, coalesce(p_trial, false), now(), now())
  ON CONFLICT (user_id, source) DO UPDATE SET
    until = greatest(g.until, excluded.until),
    plan = CASE WHEN excluded.until >= g.until THEN excluded.plan ELSE g.plan END,
    trial = excluded.trial AND excluded.until >= g.until,
    updated_at = now(),
    started_at = CASE WHEN g.until <= now() OR (g.trial AND NOT excluded.trial) THEN now() ELSE g.started_at END;
  INSERT INTO pro_entitlements AS e (user_id, plan, source, until, trial, updated_at, started_at)
  VALUES (p_user, v_plan, v_source, p_until, coalesce(p_trial, false), now(), now())
  ON CONFLICT (user_id) DO UPDATE SET
    until = greatest(e.until, excluded.until),
    plan = CASE WHEN excluded.until >= e.until THEN excluded.plan ELSE e.plan END,
    source = CASE WHEN excluded.until >= e.until THEN excluded.source ELSE e.source END,
    trial = excluded.trial AND excluded.until >= e.until,
    updated_at = now(),
    started_at = CASE WHEN e.until <= now() OR (e.trial AND NOT excluded.trial) THEN now() ELSE e.started_at END
  RETURNING until INTO new_until;
  RETURN new_until;
END $$;

-- The one-time Full Library unlock (every card, no tools). Service role only.
CREATE OR REPLACE FUNCTION pro_grant_library(p_user uuid, p_source text DEFAULT 'stripe') RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO pro_library (user_id, source) VALUES (p_user, coalesce(p_source, 'stripe')) ON CONFLICT (user_id) DO NOTHING;
$$;

-- Take a refunded Full Library unlock back. Service role only.
CREATE OR REPLACE FUNCTION pro_revoke_library(p_user uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM pro_library WHERE user_id = p_user;
$$;

-- Remember that a Stripe customer is this player, and which Stripe user a renewal belongs to. Service role only.
CREATE OR REPLACE FUNCTION pro_link_customer(p_customer text, p_user uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO pro_stripe_customers (customer_id, user_id) VALUES (p_customer, p_user) ON CONFLICT (customer_id) DO NOTHING;
$$;
CREATE OR REPLACE FUNCTION pro_customer_user(p_customer text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT user_id FROM pro_stripe_customers WHERE customer_id = p_customer;
$$;
CREATE OR REPLACE FUNCTION pro_user_customer(p_user uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT customer_id FROM pro_stripe_customers WHERE user_id = p_user ORDER BY created_at DESC LIMIT 1;
$$;

-- True the first time an event id is seen, false for a repeat (Stripe sends some events more than once). Service role only.
CREATE OR REPLACE FUNCTION pro_event_once(p_event text, p_kind text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO pro_stripe_events (event_id, kind) VALUES (p_event, p_kind);
  RETURN true;
EXCEPTION WHEN unique_violation THEN
  RETURN false;
END $$;

REVOKE ALL ON FUNCTION pro_grant_until(uuid, timestamptz, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pro_grant_library(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pro_revoke_library(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pro_link_customer(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pro_customer_user(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pro_user_customer(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pro_event_once(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION get_my_pro() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pro_grant(uuid, integer, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pro_revoke(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pro_revoke_plan(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pro_grant_item(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pro_revoke_item(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pro_has_item(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pro_forget_user(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pro_forget_user(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION redeem_pro_code(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_my_pro() TO authenticated;
REVOKE ALL ON FUNCTION start_my_trial() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION start_my_trial() TO authenticated;
GRANT EXECUTE ON FUNCTION redeem_pro_code(text) TO authenticated;

-- Make a code (owner only: run it in the Supabase SQL editor). It returns the code to hand to one person:
--   SELECT pro_make_code(p_days => 90, p_note => 'reviewer: Jane at Example');
-- Each code works once, for one account with a login, then it is spent. Give p_max_uses > 1 only for a deliberate group
-- code (a class), and p_expires_days to make it lapse. Pass p_code to choose the words yourself.
CREATE OR REPLACE FUNCTION pro_make_code(p_days integer, p_note text DEFAULT NULL, p_max_uses integer DEFAULT 1, p_expires_days integer DEFAULT NULL, p_code text DEFAULT NULL) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c text; h text;
BEGIN
  IF p_code IS NOT NULL THEN
    c := upper(trim(p_code));
  ELSE
    h := upper(md5(random()::text || clock_timestamp()::text || txid_current()::text));
    c := 'DX-' || substr(h, 1, 4) || '-' || substr(h, 5, 4) || '-' || substr(h, 9, 4);
  END IF;
  INSERT INTO pro_codes (code, days, max_uses, expires_at, note)
  VALUES (c, p_days, coalesce(p_max_uses, 1), CASE WHEN p_expires_days IS NULL THEN NULL ELSE now() + make_interval(days => p_expires_days) END, p_note);
  RETURN c;
END $$;

-- Owner views: who has Pro, and how codes are doing
CREATE OR REPLACE VIEW pro_v_active AS
SELECT plan, source, trial, count(*) AS users, min(until) AS first_ends, max(until) AS last_ends
FROM pro_entitlements WHERE until > now() GROUP BY 1, 2, 3 ORDER BY users DESC;

CREATE OR REPLACE VIEW pro_v_codes AS
SELECT code, days, max_uses, used, expires_at, note, created_at FROM pro_codes ORDER BY created_at DESC;

-- who used which code, and when
CREATE OR REPLACE VIEW pro_v_redemptions AS
SELECT r.code, c.note, c.days, r.user_id, r.redeemed_at FROM pro_redemptions r JOIN pro_codes c USING (code) ORDER BY r.redeemed_at DESC;

-- which premium items sell, and whether any were bought twice
CREATE OR REPLACE VIEW pro_v_items AS
SELECT item_id, source, count(*) AS owners, min(created_at) AS first_sold, max(created_at) AS last_sold
FROM pro_items GROUP BY 1, 2 ORDER BY owners DESC;

-- phone-store purchases checked with Google Play / the App Store
CREATE OR REPLACE VIEW pro_v_store AS
SELECT platform, product_id, count(*) AS purchases, count(*) FILTER (WHERE revoked) AS refunded, max(verified_at) AS last_checked
FROM pro_store_purchases GROUP BY 1, 2 ORDER BY purchases DESC;

-- webhook events handled in the last week (a quiet list on a day with sales means the webhook is not arriving)
CREATE OR REPLACE VIEW pro_v_recent_events AS
SELECT kind, count(*) AS handled, max(handled_at) AS last_seen
FROM pro_stripe_events WHERE handled_at > now() - interval '7 days' GROUP BY 1 ORDER BY last_seen DESC;

REVOKE ALL ON pro_v_active, pro_v_codes, pro_v_redemptions, pro_v_items, pro_v_store, pro_v_recent_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pro_make_code(integer, text, integer, integer, text) FROM PUBLIC, anon, authenticated;
