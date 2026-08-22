if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const { default: postgres } = await import('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1 });

try {
  const drift = await sql`
    WITH RECURSIVE ordered_attempts AS (
      SELECT
        session_id,
        id,
        is_correct,
        score_delta,
        rating_delta,
        ROW_NUMBER() OVER (
          PARTITION BY session_id
          ORDER BY created_at, id
        )::int AS sequence_number
      FROM exercise_attempts
    ),
    attempt_aggregates AS (
      SELECT
        session_id,
        COUNT(*)::int AS completed_count,
        COUNT(*) FILTER (WHERE is_correct)::int AS correct_count,
        COALESCE(SUM(score_delta), 0)::int AS total_score
      FROM exercise_attempts
      GROUP BY session_id
    ),
    streak_markers AS (
      SELECT
        session_id,
        sequence_number,
        is_correct,
        SUM(CASE WHEN is_correct THEN 0 ELSE 1 END) OVER (
          PARTITION BY session_id
          ORDER BY sequence_number
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        )::int AS wrong_group
      FROM ordered_attempts
    ),
    streak_group_counts AS (
      SELECT
        session_id,
        wrong_group,
        COUNT(*) FILTER (WHERE is_correct)::int AS correct_count
      FROM streak_markers
      GROUP BY session_id, wrong_group
    ),
    last_attempts AS (
      SELECT DISTINCT ON (session_id)
        session_id,
        sequence_number,
        is_correct,
        wrong_group
      FROM streak_markers
      ORDER BY session_id, sequence_number DESC
    ),
    streak_aggregates AS (
      SELECT
        last_attempts.session_id,
        CASE
          WHEN last_attempts.is_correct THEN last_group.correct_count
          ELSE 0
        END::int AS current_streak,
        MAX(groups.correct_count)::int AS best_streak
      FROM last_attempts
      JOIN streak_group_counts AS last_group
        ON last_group.session_id = last_attempts.session_id
       AND last_group.wrong_group = last_attempts.wrong_group
      JOIN streak_group_counts AS groups
        ON groups.session_id = last_attempts.session_id
      GROUP BY
        last_attempts.session_id,
        last_attempts.is_correct,
        last_group.correct_count
    ),
    rating_fold AS (
      SELECT
        session_id,
        sequence_number,
        GREATEST(800, 900 + rating_delta)::int AS current_rating
      FROM ordered_attempts
      WHERE sequence_number = 1

      UNION ALL

      SELECT
        next_attempt.session_id,
        next_attempt.sequence_number,
        GREATEST(800, previous.current_rating + next_attempt.rating_delta)::int
      FROM rating_fold AS previous
      JOIN ordered_attempts AS next_attempt
        ON next_attempt.session_id = previous.session_id
       AND next_attempt.sequence_number = previous.sequence_number + 1
    ),
    rating_aggregates AS (
      SELECT DISTINCT ON (session_id)
        session_id,
        current_rating
      FROM rating_fold
      ORDER BY session_id, sequence_number DESC
    )
    SELECT
      sessions.id,
      sessions.completed_count AS stored_completed_count,
      COALESCE(aggregates.completed_count, 0)::int AS attempts_completed_count,
      sessions.correct_count AS stored_correct_count,
      COALESCE(aggregates.correct_count, 0)::int AS attempts_correct_count,
      sessions.total_score AS stored_total_score,
      COALESCE(aggregates.total_score, 0)::int AS attempts_total_score,
      sessions.current_rating AS stored_current_rating,
      COALESCE(ratings.current_rating, 900)::int AS attempts_current_rating,
      sessions.current_streak AS stored_current_streak,
      COALESCE(streaks.current_streak, 0)::int AS attempts_current_streak,
      sessions.best_streak AS stored_best_streak,
      COALESCE(streaks.best_streak, 0)::int AS attempts_best_streak
    FROM learning_sessions AS sessions
    LEFT JOIN attempt_aggregates AS aggregates ON aggregates.session_id = sessions.id
    LEFT JOIN rating_aggregates AS ratings ON ratings.session_id = sessions.id
    LEFT JOIN streak_aggregates AS streaks ON streaks.session_id = sessions.id
    WHERE sessions.completed_count <> COALESCE(aggregates.completed_count, 0)
      OR sessions.correct_count <> COALESCE(aggregates.correct_count, 0)
      OR sessions.total_score <> COALESCE(aggregates.total_score, 0)
      OR sessions.current_rating <> COALESCE(ratings.current_rating, 900)
      OR sessions.current_streak <> COALESCE(streaks.current_streak, 0)
      OR sessions.best_streak <> COALESCE(streaks.best_streak, 0)
    ORDER BY sessions.id;
  `;

  console.log(JSON.stringify({ driftCount: drift.length, drift }, null, 2));
  if (drift.length > 0) process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
