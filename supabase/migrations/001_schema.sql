-- =============================================================================
-- Lexicon – Database Schema
-- Migration: 001_schema.sql
--
-- Design principles:
--   • vault_config and auth_attempts are ONLY accessible by the service role.
--     No RLS policies are created for them — the absence of policies means
--     authenticated users cannot read or write these tables at all.
--   • All vocabulary tables use: USING (auth.uid() = user_id) so each user
--     can only see and modify their own rows.
--   • The vault_config CHECK (id = 1) constraint enforces a single vault row.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- vault_config
-- Stores the canonical vault identity and the PBKDF2 salt.
-- Only the service role (Edge Functions) can access this table.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vault_config (
  id        BIGINT      PRIMARY KEY CHECK (id = 1),  -- exactly one row ever
  user_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  salt      TEXT        NOT NULL,                     -- hex-encoded 32-byte random salt
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.vault_config ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies — only service role can access.

-- ---------------------------------------------------------------------------
-- auth_attempts
-- Tracks unlock attempts for server-side rate limiting.
-- Only the service role (Edge Functions) can access this table.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.auth_attempts (
  id           BIGSERIAL   PRIMARY KEY,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  success      BOOLEAN     NOT NULL
);

ALTER TABLE public.auth_attempts ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies — only service role can access.

-- Index for efficient rate-limit window queries
CREATE INDEX IF NOT EXISTS auth_attempts_attempted_at_idx
  ON public.auth_attempts (attempted_at DESC);

-- ---------------------------------------------------------------------------
-- vocabulary_words
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vocabulary_words (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  word                  TEXT        NOT NULL,
  normalized_word       TEXT        NOT NULL,
  pronunciation         TEXT,
  phonetic_transcription TEXT,
  audio_url             TEXT,
  part_of_speech        TEXT,
  definitions           JSONB       NOT NULL DEFAULT '[]'::JSONB,
  simple_definition     TEXT,
  malayalam_translation TEXT,
  synonyms              TEXT[]      NOT NULL DEFAULT '{}',
  antonyms              TEXT[]      NOT NULL DEFAULT '{}',
  collocations          TEXT[]      NOT NULL DEFAULT '{}',
  expressions           TEXT[]      NOT NULL DEFAULT '{}',
  examples              JSONB       NOT NULL DEFAULT '[]'::JSONB,
  real_life_usage       TEXT,
  usage_notes           TEXT,
  common_mistakes       TEXT,
  image_url             TEXT,
  image_caption         TEXT,
  personal_notes        TEXT        NOT NULL DEFAULT '',
  is_favourite          BOOLEAN     NOT NULL DEFAULT FALSE,
  is_difficult          BOOLEAN     NOT NULL DEFAULT FALSE,
  learning_status       TEXT        NOT NULL DEFAULT 'new'
                          CHECK (learning_status IN ('new', 'learning', 'reviewing', 'mastered')),
  last_accessed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, normalized_word)
);

ALTER TABLE public.vocabulary_words ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all" ON public.vocabulary_words
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS vocabulary_words_user_id_idx
  ON public.vocabulary_words (user_id);
CREATE INDEX IF NOT EXISTS vocabulary_words_normalized_word_idx
  ON public.vocabulary_words (user_id, normalized_word);
CREATE INDEX IF NOT EXISTS vocabulary_words_updated_at_idx
  ON public.vocabulary_words (user_id, updated_at DESC);

-- ---------------------------------------------------------------------------
-- review_progress
-- One row per vocabulary word — tracks FSRS scheduling state.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.review_progress (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vocabulary_word_id  UUID        NOT NULL REFERENCES public.vocabulary_words(id) ON DELETE CASCADE,
  review_count        INTEGER     NOT NULL DEFAULT 0,
  difficulty          DOUBLE PRECISION NOT NULL DEFAULT 0,
  stability           DOUBLE PRECISION NOT NULL DEFAULT 0,
  last_reviewed_at    TIMESTAMPTZ,
  next_review_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  learning_status     TEXT        NOT NULL DEFAULT 'new'
                        CHECK (learning_status IN ('new', 'learning', 'reviewing', 'mastered')),
  fsrs_card           JSONB       NOT NULL DEFAULT '{}'::JSONB,
  consecutive_correct INTEGER     NOT NULL DEFAULT 0,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vocabulary_word_id)
);

ALTER TABLE public.review_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all" ON public.review_progress
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS review_progress_user_id_idx
  ON public.review_progress (user_id);
CREATE INDEX IF NOT EXISTS review_progress_next_review_at_idx
  ON public.review_progress (user_id, next_review_at);
CREATE INDEX IF NOT EXISTS review_progress_vocabulary_word_id_idx
  ON public.review_progress (vocabulary_word_id);

-- ---------------------------------------------------------------------------
-- review_history
-- Append-only log of every review event.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.review_history (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vocabulary_word_id UUID        NOT NULL REFERENCES public.vocabulary_words(id) ON DELETE CASCADE,
  question_type      TEXT        NOT NULL
                       CHECK (question_type IN ('multiple_choice', 'type_meaning', 'fill_blank')),
  user_answer        TEXT        NOT NULL DEFAULT '',
  is_correct         BOOLEAN     NOT NULL,
  rating             TEXT        CHECK (rating IN ('again', 'hard', 'good', 'easy')),
  reviewed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.review_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all" ON public.review_history
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS review_history_user_id_idx
  ON public.review_history (user_id);
CREATE INDEX IF NOT EXISTS review_history_vocabulary_word_id_idx
  ON public.review_history (vocabulary_word_id);
CREATE INDEX IF NOT EXISTS review_history_reviewed_at_idx
  ON public.review_history (user_id, reviewed_at DESC);

-- ---------------------------------------------------------------------------
-- collections
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.collections (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  description TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all" ON public.collections
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS collections_user_id_idx
  ON public.collections (user_id);

-- ---------------------------------------------------------------------------
-- collection_words
-- Many-to-many join: collections ↔ vocabulary_words
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.collection_words (
  collection_id       UUID NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  vocabulary_word_id  UUID NOT NULL REFERENCES public.vocabulary_words(id) ON DELETE CASCADE,
  PRIMARY KEY (collection_id, vocabulary_word_id)
);

ALTER TABLE public.collection_words ENABLE ROW LEVEL SECURITY;

-- Policy: user can access collection_words whose collection they own
CREATE POLICY "owner_all" ON public.collection_words
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.collections
      WHERE collections.id = collection_id
        AND collections.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.collections
      WHERE collections.id = collection_id
        AND collections.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- user_settings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id              UUID    PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme                TEXT    NOT NULL DEFAULT 'system'
                                 CHECK (theme IN ('light', 'dark', 'system')),
  daily_goal           INTEGER NOT NULL DEFAULT 5 CHECK (daily_goal > 0),
  preferred_language   TEXT    NOT NULL DEFAULT 'en-GB',
  pronunciation_accent TEXT    NOT NULL DEFAULT 'british',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all" ON public.user_settings
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =============================================================================
-- Helper: auto-prune old auth_attempts (keeps last 24 hours only)
-- Called by the rate limiter via rpc('prune_auth_attempts').
-- Uses SECURITY DEFINER so it can delete from auth_attempts without a policy.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.prune_auth_attempts()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.auth_attempts
  WHERE attempted_at < NOW() - INTERVAL '24 hours';
$$;
