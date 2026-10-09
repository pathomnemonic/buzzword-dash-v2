-- ================================================================
-- Dx Dash — first-party analytics (tables, ingest, privacy functions)
--
-- Run after schema.sql and policies.sql. Safe to run twice.
-- The views for reading the data are in analytics_views.sql.
--
-- Who can do what:
--   * the app (anon or signed in) can only call three functions: ingest_analytics (send a batch of events),
--     delete_analytics (erase an install's data) and count_consent (the anonymous yes/no tally);
--   * nobody but the project owner (the SQL editor, or the service role key) can read any of the tables or views.
--
-- What is stored: a random install id made on the device (not tied to a name, e-mail or account), session ids,
-- the events in js/analytics/catalog.js with their listed properties, bucketed device details, and campaign tags.
-- Never names, e-mail addresses, card text, free text, advertising ids or IP addresses.
-- ================================================================

-- ==================== INSTALLS ====================

CREATE TABLE IF NOT EXISTS analytics_installs (
  install_id        uuid PRIMARY KEY,
  first_seen        timestamptz NOT NULL DEFAULT now(),
  last_seen         timestamptz NOT NULL DEFAULT now(),
  platform          text,                         -- web, android, ios
  first_version     text,
  last_version      text,
  first_channel     text,                         -- direct, search, social, paid, email, share, referral, campaign, store
  first_source      text,
  first_medium      text,
  first_campaign    text,
  first_content     text,
  first_term        text,
  first_referrer    text,                         -- the sending site's host name only
  first_landing     text,
  has_click_id      boolean NOT NULL DEFAULT false,
  ref_code          text,                         -- this install's share code (a one-way hash of its id)
  referred_by_code  text,                         -- the share code of the install whose link brought this one
  consent_version   integer,
  events_total      bigint NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS analytics_installs_first_seen ON analytics_installs (first_seen);
CREATE INDEX IF NOT EXISTS analytics_installs_channel ON analytics_installs (first_channel, first_source);
CREATE UNIQUE INDEX IF NOT EXISTS analytics_installs_ref_code ON analytics_installs (ref_code) WHERE ref_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS analytics_installs_referred_by ON analytics_installs (referred_by_code) WHERE referred_by_code IS NOT NULL;

-- ==================== SESSIONS ====================

CREATE TABLE IF NOT EXISTS analytics_sessions (
  session_id     uuid PRIMARY KEY,
  install_id     uuid NOT NULL,
  started_at     timestamptz NOT NULL,
  platform       text,
  version        text,
  build          text,
  os             text,
  os_major       integer,
  browser        text,
  browser_major  integer,
  form           text,                            -- phone, tablet, desktop
  screen_w       integer,
  screen_h       integer,
  dpr            real,
  portrait       boolean,
  touch          boolean,
  standalone     boolean,
  language       text,
  tz_offset      real,
  memory_gb      integer,
  cores          integer,
  connection     text,
  save_data      boolean,
  tier           text,
  dark           boolean,
  reduced_motion boolean,
  webgl2         boolean,
  last_channel   text,
  last_source    text,
  last_medium    text,
  last_campaign  text,
  last_referrer  text
);
CREATE INDEX IF NOT EXISTS analytics_sessions_install ON analytics_sessions (install_id, started_at);
CREATE INDEX IF NOT EXISTS analytics_sessions_started ON analytics_sessions (started_at);

-- ==================== EVENTS ====================

CREATE TABLE IF NOT EXISTS analytics_events (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id     uuid NOT NULL,
  install_id   uuid NOT NULL,
  session_id   uuid,
  name         text NOT NULL,
  ts           timestamptz NOT NULL,              -- when it happened, corrected for the device's clock
  received_at  timestamptz NOT NULL DEFAULT now(),
  seq          integer,
  sample_rate  real NOT NULL DEFAULT 1,           -- below 1 when the event is only sent for a share of the time (weight by 1/sample_rate)
  props        jsonb NOT NULL DEFAULT '{}'::jsonb,
  experiments  jsonb,
  CONSTRAINT analytics_events_name_ok CHECK (name ~ '^[a-z0-9_]{2,48}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS analytics_events_event_id ON analytics_events (event_id);
CREATE INDEX IF NOT EXISTS analytics_events_name_ts ON analytics_events (name, ts);
CREATE INDEX IF NOT EXISTS analytics_events_install_ts ON analytics_events (install_id, ts);
CREATE INDEX IF NOT EXISTS analytics_events_session ON analytics_events (session_id);
CREATE INDEX IF NOT EXISTS analytics_events_received ON analytics_events (received_at);

-- ==================== RATE LIMITS AND TALLIES ====================

CREATE TABLE IF NOT EXISTS analytics_limits (
  install_id uuid NOT NULL,
  hour       timestamptz NOT NULL,
  n          integer NOT NULL DEFAULT 0,
  PRIMARY KEY (install_id, hour)
);

CREATE TABLE IF NOT EXISTS analytics_consent_counts (
  day      date NOT NULL,
  outcome  text NOT NULL CHECK (outcome IN ('shown', 'granted', 'denied')),
  source   text NOT NULL DEFAULT '',
  platform text NOT NULL DEFAULT '',
  version  text NOT NULL DEFAULT '',
  n        integer NOT NULL DEFAULT 0,
  PRIMARY KEY (day, outcome, source, platform, version)
);

-- ==================== LOCK THE TABLES ====================

ALTER TABLE analytics_installs ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_consent_counts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON analytics_installs, analytics_sessions, analytics_events, analytics_limits, analytics_consent_counts FROM PUBLIC, anon, authenticated;

-- ==================== HELPERS ====================

CREATE OR REPLACE FUNCTION analytics_txt(p jsonb, k text, maxlen integer DEFAULT 60) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN jsonb_typeof(p -> k) = 'string' THEN left(p ->> k, maxlen) END
$$;

CREATE OR REPLACE FUNCTION analytics_num(p jsonb, k text) RETURNS numeric
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN jsonb_typeof(p -> k) = 'number' THEN (p ->> k)::numeric END
$$;

CREATE OR REPLACE FUNCTION analytics_bool(p jsonb, k text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN jsonb_typeof(p -> k) = 'boolean' THEN (p ->> k)::boolean END
$$;

-- ==================== SEND A BATCH ====================
-- p_batch: { sent_at, install: {id, first, ref_code, platform, version, consent_v},
--            sessions: { <session id>: { ctx, last, started } }, events: [ {id, n, t, q, s, p, r, x} ] }
-- Returns { accepted, duplicates, rejected, now }.

CREATE OR REPLACE FUNCTION ingest_analytics(p_batch jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_install  uuid;
  v_inst     jsonb;
  v_first    jsonb;
  v_count    integer;
  v_sent_ms  numeric;
  v_skew     interval;
  v_hour     timestamptz := date_trunc('hour', now());
  v_used     integer;
  ev         jsonb;
  v_name     text;
  v_event_id uuid;
  v_session  uuid;
  v_ts       timestamptz;
  v_props    jsonb;
  v_rate     real;
  v_accepted integer := 0;
  v_rejected integer := 0;
  v_rows     integer;
  sk         text;
  sv         jsonb;
  ctx        jsonb;
  lt         jsonb;
  v_ref      text;
BEGIN
  IF p_batch IS NULL OR jsonb_typeof(p_batch) <> 'object' THEN RAISE EXCEPTION 'bad batch'; END IF;
  v_inst := p_batch -> 'install';
  IF v_inst IS NULL OR jsonb_typeof(v_inst) <> 'object' OR coalesce(v_inst ->> 'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'bad install';
  END IF;
  v_install := (v_inst ->> 'id')::uuid;
  IF jsonb_typeof(p_batch -> 'events') <> 'array' THEN RAISE EXCEPTION 'bad events'; END IF;
  v_count := jsonb_array_length(p_batch -> 'events');
  IF v_count > 100 THEN RAISE EXCEPTION 'batch too large'; END IF;
  IF jsonb_typeof(p_batch -> 'sent_at') <> 'number' THEN RAISE EXCEPTION 'bad sent_at'; END IF;
  v_sent_ms := (p_batch ->> 'sent_at')::numeric;
  -- the device's clock may be wrong: every event time is moved by how far off it was when the batch was sent
  v_skew := now() - to_timestamp(v_sent_ms / 1000.0);
  IF v_skew > interval '30 days' OR v_skew < interval '-30 days' THEN v_skew := interval '0'; END IF;

  -- a limit per install per hour, so a script cannot fill the table
  INSERT INTO analytics_limits (install_id, hour, n) VALUES (v_install, v_hour, v_count)
  ON CONFLICT (install_id, hour) DO UPDATE SET n = analytics_limits.n + EXCLUDED.n
  RETURNING n INTO v_used;
  IF v_used > 4000 THEN
    RETURN jsonb_build_object('accepted', 0, 'duplicates', 0, 'rejected', v_count, 'limited', true, 'now', (extract(epoch FROM now()) * 1000)::bigint);
  END IF;

  -- the install row
  v_first := CASE WHEN jsonb_typeof(v_inst -> 'first') = 'object' THEN v_inst -> 'first' ELSE '{}'::jsonb END;
  v_ref := CASE WHEN analytics_txt(v_first, 'share_ref', 16) ~ '^[a-z0-9]{4,16}$' THEN analytics_txt(v_first, 'share_ref', 16) END;
  INSERT INTO analytics_installs (install_id, platform, first_version, last_version, first_channel, first_source, first_medium, first_campaign, first_content,
                                  first_term, first_referrer, first_landing, has_click_id, ref_code, referred_by_code, consent_version)
  VALUES (v_install, left(coalesce(v_inst ->> 'platform', 'web'), 12), left(v_inst ->> 'version', 20), left(v_inst ->> 'version', 20),
          analytics_txt(v_first, 'channel', 20), analytics_txt(v_first, 'utm_source', 40), analytics_txt(v_first, 'utm_medium', 40),
          analytics_txt(v_first, 'utm_campaign', 60), analytics_txt(v_first, 'utm_content', 60), analytics_txt(v_first, 'utm_term', 60),
          analytics_txt(v_first, 'referrer_host', 60), analytics_txt(v_first, 'landing', 40), coalesce(analytics_bool(v_first, 'has_click_id'), false),
          CASE WHEN analytics_txt(v_inst, 'ref_code', 16) ~ '^[0-9a-f]{6,16}$' THEN analytics_txt(v_inst, 'ref_code', 16) END,
          v_ref, (analytics_num(v_inst, 'consent_v'))::integer)
  ON CONFLICT (install_id) DO UPDATE SET last_seen = now(), last_version = coalesce(left(EXCLUDED.last_version, 20), analytics_installs.last_version);

  -- the sessions this batch refers to (their device details)
  IF jsonb_typeof(p_batch -> 'sessions') = 'object' THEN
    FOR sk, sv IN SELECT key, value FROM jsonb_each(p_batch -> 'sessions') LIMIT 50 LOOP
      CONTINUE WHEN sk !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR jsonb_typeof(sv) <> 'object';
      ctx := CASE WHEN jsonb_typeof(sv -> 'ctx') = 'object' THEN sv -> 'ctx' ELSE '{}'::jsonb END;
      lt := CASE WHEN jsonb_typeof(sv -> 'last') = 'object' THEN sv -> 'last' ELSE '{}'::jsonb END;
      INSERT INTO analytics_sessions (session_id, install_id, started_at, platform, version, build, os, os_major, browser, browser_major, form, screen_w, screen_h, dpr,
                                      portrait, touch, standalone, language, tz_offset, memory_gb, cores, connection, save_data, tier, dark, reduced_motion, webgl2,
                                      last_channel, last_source, last_medium, last_campaign, last_referrer)
      VALUES (sk::uuid, v_install,
              coalesce(to_timestamp(analytics_num(sv, 'started') / 1000.0) + v_skew, now()),
              left(analytics_txt(ctx, 'platform', 12), 12), analytics_txt(ctx, 'version', 20), analytics_txt(ctx, 'build', 20), analytics_txt(ctx, 'os', 20),
              analytics_num(ctx, 'os_major')::integer, analytics_txt(ctx, 'browser', 20), analytics_num(ctx, 'browser_major')::integer, analytics_txt(ctx, 'form', 12),
              analytics_num(ctx, 'screen_w')::integer, analytics_num(ctx, 'screen_h')::integer, analytics_num(ctx, 'dpr')::real, analytics_bool(ctx, 'portrait'),
              analytics_bool(ctx, 'touch'), analytics_bool(ctx, 'standalone'), analytics_txt(ctx, 'language', 12), analytics_num(ctx, 'tz_offset')::real,
              analytics_num(ctx, 'memory_gb')::integer, analytics_num(ctx, 'cores')::integer, analytics_txt(ctx, 'connection', 12), analytics_bool(ctx, 'save_data'),
              CASE WHEN analytics_txt(ctx, 'tier', 8) IN ('low', 'medium', 'high') THEN analytics_txt(ctx, 'tier', 8) END,
              analytics_bool(ctx, 'dark'), analytics_bool(ctx, 'reduced_motion'), analytics_bool(ctx, 'webgl2'),
              analytics_txt(lt, 'channel', 20), analytics_txt(lt, 'utm_source', 40), analytics_txt(lt, 'utm_medium', 40), analytics_txt(lt, 'utm_campaign', 60),
              analytics_txt(lt, 'referrer_host', 60))
      ON CONFLICT (session_id) DO NOTHING;
    END LOOP;
  END IF;

  -- the events
  FOR ev IN SELECT value FROM jsonb_array_elements(p_batch -> 'events') LOOP
    v_name := ev ->> 'n';
    IF jsonb_typeof(ev) <> 'object' OR v_name IS NULL OR v_name !~ '^[a-z0-9_]{2,48}$'
       OR coalesce(ev ->> 'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR jsonb_typeof(ev -> 't') <> 'number' THEN
      v_rejected := v_rejected + 1;
      CONTINUE;
    END IF;
    v_props := CASE WHEN jsonb_typeof(ev -> 'p') = 'object' THEN ev -> 'p' ELSE '{}'::jsonb END;
    IF octet_length(v_props::text) > 6000 THEN v_rejected := v_rejected + 1; CONTINUE; END IF;
    v_event_id := (ev ->> 'id')::uuid;
    v_session := CASE WHEN coalesce(ev ->> 's', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (ev ->> 's')::uuid END;
    v_ts := to_timestamp((ev ->> 't')::numeric / 1000.0) + v_skew;
    IF v_ts > now() + interval '5 minutes' THEN v_ts := now(); END IF;
    IF v_ts < now() - interval '10 days' THEN v_rejected := v_rejected + 1; CONTINUE; END IF;
    v_rate := CASE WHEN jsonb_typeof(ev -> 'r') = 'number' AND (ev ->> 'r')::numeric > 0 AND (ev ->> 'r')::numeric <= 1 THEN (ev ->> 'r')::real ELSE 1 END;
    INSERT INTO analytics_events (event_id, install_id, session_id, name, ts, seq, sample_rate, props, experiments)
    VALUES (v_event_id, v_install, v_session, v_name, v_ts, (analytics_num(ev, 'q'))::integer, v_rate, v_props,
            CASE WHEN jsonb_typeof(ev -> 'x') = 'object' AND octet_length((ev -> 'x')::text) < 600 THEN ev -> 'x' END)
    ON CONFLICT (event_id) DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_accepted := v_accepted + v_rows;
  END LOOP;

  UPDATE analytics_installs SET events_total = events_total + v_accepted, last_seen = now() WHERE install_id = v_install;
  RETURN jsonb_build_object('accepted', v_accepted, 'duplicates', v_count - v_accepted - v_rejected, 'rejected', v_rejected,
                            'now', (extract(epoch FROM now()) * 1000)::bigint);
END;
$$;

-- ==================== ERASE AN INSTALL ====================
-- "Delete my analytics data" in Settings. The install id is a secret only that device knows.

CREATE OR REPLACE FUNCTION delete_analytics(p_install uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_install IS NULL THEN RETURN; END IF;
  DELETE FROM analytics_events WHERE install_id = p_install;
  DELETE FROM analytics_sessions WHERE install_id = p_install;
  DELETE FROM analytics_limits WHERE install_id = p_install;
  DELETE FROM analytics_installs WHERE install_id = p_install;
END;
$$;

-- ==================== THE ANONYMOUS YES / NO TALLY ====================
-- Counts how many times the question was shown and answered, with no id of any kind, so the rate of yes is known
-- even for people who said no.

CREATE OR REPLACE FUNCTION count_consent(p_outcome text, p_source text DEFAULT '', p_platform text DEFAULT '', p_version text DEFAULT '') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_outcome NOT IN ('shown', 'granted', 'denied') THEN RETURN; END IF;
  -- one global cap per hour so the tally cannot be inflated by a script
  IF (SELECT coalesce(sum(n), 0) FROM analytics_consent_counts WHERE day = current_date) > 200000 THEN RETURN; END IF;
  INSERT INTO analytics_consent_counts (day, outcome, source, platform, version, n)
  VALUES (current_date, p_outcome, left(coalesce(p_source, ''), 12), left(coalesce(p_platform, ''), 12), left(coalesce(p_version, ''), 20), 1)
  ON CONFLICT (day, outcome, source, platform, version) DO UPDATE SET n = analytics_consent_counts.n + 1;
END;
$$;

-- ==================== RETENTION OF RAW DATA ====================
-- Owner only. Run on a schedule (Supabase: Database -> Cron) e.g.  SELECT analytics_purge(400);
-- Removes raw events older than the given number of days, rate-limit rows older than two days, and installs
-- that have been silent for that long. Daily summaries should be copied elsewhere first if they are wanted for longer.

CREATE OR REPLACE FUNCTION analytics_purge(p_days integer DEFAULT 400) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e integer; l integer; s integer; i integer;
BEGIN
  p_days := greatest(30, coalesce(p_days, 400));
  DELETE FROM analytics_events WHERE ts < now() - make_interval(days => p_days);
  GET DIAGNOSTICS e = ROW_COUNT;
  DELETE FROM analytics_limits WHERE hour < now() - interval '2 days';
  GET DIAGNOSTICS l = ROW_COUNT;
  DELETE FROM analytics_sessions WHERE started_at < now() - make_interval(days => p_days);
  GET DIAGNOSTICS s = ROW_COUNT;
  DELETE FROM analytics_installs WHERE last_seen < now() - make_interval(days => p_days);
  GET DIAGNOSTICS i = ROW_COUNT;
  RETURN jsonb_build_object('events', e, 'limits', l, 'sessions', s, 'installs', i);
END;
$$;

-- ==================== PERMISSIONS ====================

REVOKE ALL ON FUNCTION ingest_analytics(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION delete_analytics(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION count_consent(text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION analytics_purge(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ingest_analytics(jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION delete_analytics(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION count_consent(text, text, text, text) TO anon, authenticated;

-- Internal helpers and the owner's clean-up job: never callable by the app roles (see the note in schema.sql)
REVOKE ALL ON FUNCTION analytics_txt(jsonb, text, integer), analytics_num(jsonb, text), analytics_bool(jsonb, text) FROM PUBLIC, anon, authenticated;
