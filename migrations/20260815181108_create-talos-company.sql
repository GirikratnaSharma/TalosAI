CREATE TABLE public.talos_intakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_url TEXT NOT NULL CHECK (target_url ~ '^https://'),
  repository_url TEXT NOT NULL CHECK (repository_url ~ '^https://'),
  critical_journey TEXT NOT NULL CHECK (char_length(critical_journey) BETWEEN 10 AND 1000),
  delivery_address TEXT NOT NULL CHECK (char_length(delivery_address) BETWEEN 3 AND 320),
  authorization_confirmed BOOLEAN NOT NULL DEFAULT false CHECK (authorization_confirmed),
  status TEXT NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED', 'ACCEPTED', 'REJECTED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.talos_orders (
  id UUID PRIMARY KEY,
  intake_id UUID UNIQUE REFERENCES public.talos_intakes(id) ON DELETE RESTRICT,
  public_reference TEXT NOT NULL UNIQUE,
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  mode TEXT NOT NULL CHECK (mode IN ('LIVE', 'TEST', 'DEMO')),
  state TEXT NOT NULL CHECK (
    state IN (
      'DRAFT',
      'DIAGNOSING',
      'PATCHING',
      'REPLAY_VERIFYING',
      'HUMAN_VERIFYING',
      'AWAITING_PAYMENT',
      'DELIVERING',
      'DELIVERED',
      'CLOSED_NO_CHARGE'
    )
  ),
  deadline_at TIMESTAMPTZ NOT NULL,
  critical_journey TEXT NOT NULL,
  original_url TEXT NOT NULL CHECK (original_url ~ '^https://'),
  repository_url TEXT NOT NULL CHECK (repository_url ~ '^https://'),
  base_sha TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'usd' CHECK (currency = 'usd'),
  max_repair_attempts SMALLINT NOT NULL DEFAULT 2 CHECK (max_repair_attempts = 2),
  repair_attempt SMALLINT NOT NULL DEFAULT 0 CHECK (repair_attempt BETWEEN 0 AND 2),
  minimum_participants SMALLINT NOT NULL CHECK (minimum_participants > 0),
  minimum_completion_rate NUMERIC(6,5) NOT NULL CHECK (minimum_completion_rate BETWEEN 0 AND 1),
  minimum_absolute_lift NUMERIC(6,5) NOT NULL CHECK (minimum_absolute_lift > 0 AND minimum_absolute_lift <= 1),
  candidate_sha TEXT,
  candidate_preview_url TEXT,
  replay_project_id TEXT,
  baseline_study_id TEXT,
  holdout_study_id TEXT,
  certificate_id TEXT UNIQUE,
  payment_intent_id TEXT UNIQUE,
  payment_livemode BOOLEAN,
  delivery_receipt_id TEXT UNIQUE,
  close_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (candidate_sha IS NULL OR candidate_preview_url IS NOT NULL),
  CHECK (state <> 'DELIVERED' OR delivery_receipt_id IS NOT NULL),
  CHECK (state <> 'CLOSED_NO_CHARGE' OR payment_intent_id IS NULL),
  CHECK (state NOT IN ('AWAITING_PAYMENT', 'DELIVERING', 'DELIVERED') OR certificate_id IS NOT NULL),
  CHECK (state NOT IN ('DELIVERING', 'DELIVERED') OR payment_intent_id IS NOT NULL)
);

CREATE TABLE public.talos_order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.talos_orders(id) ON DELETE RESTRICT,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  event_type TEXT NOT NULL,
  provider TEXT,
  provider_event_id TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('LIVE', 'TEST', 'DEMO')),
  occurred_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  UNIQUE (order_id, sequence)
);

CREATE UNIQUE INDEX talos_order_events_provider_event_unique
  ON public.talos_order_events(provider, provider_event_id)
  WHERE provider IS NOT NULL AND provider_event_id IS NOT NULL;

CREATE INDEX talos_order_events_order_time_idx
  ON public.talos_order_events(order_id, occurred_at);

CREATE TABLE public.talos_command_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.talos_orders(id) ON DELETE RESTRICT,
  command_type TEXT NOT NULL,
  semantic_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETE', 'RETRY')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  provider_receipt TEXT,
  last_error_code TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, command_type, semantic_key)
);

CREATE INDEX talos_command_outbox_claim_idx
  ON public.talos_command_outbox(status, available_at, created_at)
  WHERE status IN ('PENDING', 'RETRY');

CREATE TABLE public.talos_provider_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('stripe', 'replay', 'terac', 'superserve')),
  provider_event_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  UNIQUE (provider, provider_event_id)
);

CREATE TABLE public.talos_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.talos_orders(id) ON DELETE RESTRICT,
  evidence_type TEXT NOT NULL CHECK (
    evidence_type IN ('REPLAY_BASELINE', 'REPLAY_VERIFICATION', 'TERAC_BASELINE', 'TERAC_HOLDOUT', 'SANDBOX_BUILD', 'PAYMENT', 'DELIVERY')
  ),
  provider TEXT NOT NULL,
  provider_reference TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('LIVE', 'TEST', 'DEMO')),
  target_url TEXT,
  build_sha TEXT,
  observed_at TIMESTAMPTZ NOT NULL,
  receipt JSONB NOT NULL,
  receipt_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, evidence_type, provider_reference)
);

CREATE INDEX talos_evidence_order_idx
  ON public.talos_evidence(order_id, observed_at);

CREATE OR REPLACE FUNCTION public.talos_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER talos_orders_set_updated_at
BEFORE UPDATE ON public.talos_orders
FOR EACH ROW EXECUTE FUNCTION public.talos_set_updated_at();

CREATE OR REPLACE FUNCTION public.talos_reject_history_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Talos evidence and event history is append-only';
END;
$$;

CREATE TRIGGER talos_order_events_append_only
BEFORE UPDATE OR DELETE ON public.talos_order_events
FOR EACH ROW EXECUTE FUNCTION public.talos_reject_history_mutation();

CREATE TRIGGER talos_evidence_append_only
BEFORE UPDATE OR DELETE ON public.talos_evidence
FOR EACH ROW EXECUTE FUNCTION public.talos_reject_history_mutation();

ALTER TABLE public.talos_intakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talos_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talos_order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talos_command_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talos_provider_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talos_evidence ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.talos_intakes FROM anon, authenticated;
REVOKE ALL ON public.talos_orders FROM anon, authenticated;
REVOKE ALL ON public.talos_order_events FROM anon, authenticated;
REVOKE ALL ON public.talos_command_outbox FROM anon, authenticated;
REVOKE ALL ON public.talos_provider_inbox FROM anon, authenticated;
REVOKE ALL ON public.talos_evidence FROM anon, authenticated;

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT INSERT (id, target_url, repository_url, critical_journey, delivery_address, authorization_confirmed)
  ON public.talos_intakes TO anon, authenticated;

CREATE POLICY talos_intake_insert
ON public.talos_intakes
FOR INSERT TO anon, authenticated
WITH CHECK (
  authorization_confirmed
  AND status = 'RECEIVED'
  AND target_url ~ '^https://'
  AND repository_url ~ '^https://'
);
