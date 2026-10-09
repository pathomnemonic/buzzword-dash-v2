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
  IF me IS NULL THEN RETURN jsonb_build_object('active', false, 'library', false, 'trial_available', false, 'items', '[]'::jsonb); END IF;
  its := coalesce((SELECT jsonb_agg(item_id ORDER BY created_at) FROM pro_items WHERE user_id = me), '[]'::jsonb);
  lib := EXISTS (SELECT 1 FROM pro_library WHERE user_id = me);
  can_trial := NOT pro_is_guest() AND NOT EXISTS (SELECT 1 FROM pro_trials WHERE user_id = me);
  SELECT * INTO r FROM pro_entitlements WHERE user_id = me;
  IF NOT FOUND OR r.until <= now() THEN RETURN jsonb_build_object('active', false, 'library', lib, 'trial_available', can_trial, 'items', its); END IF;
  RETURN jsonb_build_object('active', true, 'until', r.until, 'plan', r.plan, 'source', r.source, 'trial', r.trial, 'since', r.started_at, 'library', lib, 'trial_available', false, 'items', its);
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
CREATE OR REPLACE FUNCTION pro_grant(p_user uuid, p_days integer, p_plan text DEFAULT 'pro', p_source text DEFAULT 'manual', p_trial boolean DEFAULT false) RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_until timestamptz;
BEGIN
  IF p_days IS NULL OR p_days < 1 OR p_days > 3650 THEN RAISE EXCEPTION 'days must be 1 to 3650'; END IF;
  INSERT INTO pro_entitlements AS e (user_id, plan, source, until, trial, updated_at, started_at)
  VALUES (p_user, coalesce(p_plan, 'pro'), coalesce(p_source, 'manual'), now() + make_interval(days => p_days), coalesce(p_trial, false), now(), now())
  ON CONFLICT (user_id) DO UPDATE SET
    until = greatest(e.until, now()) + make_interval(days => p_days),
    plan = excluded.plan, source = excluded.source, trial = excluded.trial AND e.until > now(), updated_at = now(),
    started_at = CASE WHEN e.until <= now() OR (e.trial AND NOT excluded.trial) THEN now() ELSE e.started_at END
  RETURNING until INTO new_until;
  RETURN new_until;
END $$;

-- End someone's Pro now. Service role / SQL editor only.
CREATE OR REPLACE FUNCTION pro_revoke(p_user uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE pro_entitlements SET until = now(), updated_at = now() WHERE user_id = p_user;
$$;

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
    UPDATE pro_items SET payment_ref = p_ref WHERE user_id = p_user AND item_id = p_item;
    RETURN 'already';
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
CREATE OR REPLACE FUNCTION pro_revoke_plan(p_user uuid, p_plan text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE pro_entitlements SET until = now(), updated_at = now() WHERE user_id = p_user AND plan = p_plan;
$$;

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

-- Set Pro to last until an exact moment (a web subscription: the end of the period just paid). Never shortens a longer
-- lifetime or code grant. Service role only.
CREATE OR REPLACE FUNCTION pro_grant_until(p_user uuid, p_until timestamptz, p_plan text DEFAULT 'pro', p_source text DEFAULT 'stripe', p_trial boolean DEFAULT false) RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_until timestamptz;
BEGIN
  IF p_until IS NULL OR p_until > now() + interval '3651 days' THEN RAISE EXCEPTION 'until is out of range'; END IF;
  INSERT INTO pro_entitlements AS e (user_id, plan, source, until, trial, updated_at, started_at)
  VALUES (p_user, coalesce(p_plan, 'pro'), coalesce(p_source, 'stripe'), p_until, coalesce(p_trial, false), now(), now())
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

REVOKE ALL ON pro_v_active, pro_v_codes, pro_v_redemptions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pro_make_code(integer, text, integer, integer, text) FROM PUBLIC, anon, authenticated;
