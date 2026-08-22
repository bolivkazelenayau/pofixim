BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "exercise_attempts"
  ADD COLUMN IF NOT EXISTS "submission_id" uuid;

ALTER TABLE "exercise_attempts"
  ADD COLUMN IF NOT EXISTS "request_fingerprint" text;

ALTER TABLE "exercise_attempts"
  ADD COLUMN IF NOT EXISTS "check_result" jsonb;

ALTER TABLE "exercise_attempts"
  ADD COLUMN IF NOT EXISTS "session_snapshot" jsonb;

ALTER TABLE "exercise_attempts"
  ADD COLUMN IF NOT EXISTS "next_exercise" jsonb;

ALTER TABLE "exercise_attempts"
  ADD COLUMN IF NOT EXISTS "no_more_exercises" boolean NOT NULL DEFAULT false;

ALTER TABLE "exercise_attempts"
  ADD COLUMN IF NOT EXISTS "matchmaking" jsonb;

UPDATE "exercise_attempts"
SET
  "submission_id" = COALESCE("submission_id", gen_random_uuid()),
  "request_fingerprint" = COALESCE("request_fingerprint", 'legacy:' || "id"::text),
  "check_result" = COALESCE(
    "check_result",
    jsonb_build_object(
      'isCorrect', "is_correct",
      'scoreDelta', "score_delta",
      'normalizedAnswer', "submitted_answer",
      'mistakes', '[]'::jsonb,
      'mistakeCode', "mistake_code",
      'failedStepIds', COALESCE(to_jsonb("failed_step_ids"), '[]'::jsonb),
      'stepFeedback', '[]'::jsonb,
      'nextRecommendation', jsonb_build_object(
        'mode', CASE WHEN "is_correct" THEN 'challenge' ELSE 'retry' END,
        'reason', 'Legacy attempt migrated before retry snapshots were available'
      ),
      'feedback', jsonb_build_object(
        'short', CASE WHEN "is_correct" THEN 'Correct' ELSE 'Try again' END,
        'explanation', ''
      )
    )
  ),
  "session_snapshot" = COALESCE(
    "session_snapshot",
    jsonb_build_object(
      'currentRating', 900,
      'currentStreak', 0,
      'bestStreak', 0,
      'totalScore', 0
    )
  );

ALTER TABLE "exercise_attempts"
  ALTER COLUMN "submission_id" SET NOT NULL;

ALTER TABLE "exercise_attempts"
  ALTER COLUMN "request_fingerprint" SET NOT NULL;

ALTER TABLE "exercise_attempts"
  ALTER COLUMN "check_result" SET NOT NULL;

ALTER TABLE "exercise_attempts"
  ALTER COLUMN "session_snapshot" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "exercise_attempts_session_submission_unique"
  ON "exercise_attempts" ("session_id", "submission_id");

COMMIT;
