import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const rootDir = process.cwd();
const require = installTypeScriptRequire(rootDir);
const { submitExerciseAnswer } = require('../src/app/actions/exercises/submit-service.ts');

test('production transaction service loads through the integration runtime', () => {
  assert.equal(typeof submitExerciseAnswer, 'function');
});

if (!testDatabaseUrl) {
  test('submit concurrency integration requires TEST_DATABASE_URL', {
    skip: 'Set TEST_DATABASE_URL to an isolated PostgreSQL database',
  }, () => {});
} else {
  await runIntegrationTests(testDatabaseUrl, require);
}

async function runIntegrationTests(databaseUrl, require) {
  const { default: postgres } = await import('postgres');
  const { drizzle } = require('drizzle-orm/postgres-js');
  const schema = require('../src/db/schema.ts');
  const drizzleClient = postgres(databaseUrl, { max: 12 });
  const testDb = drizzle(drizzleClient, { schema });

  // Inject the test database into the production query module before loading it.
  const dbModulePath = require.resolve('../src/db/index.ts');
  require.cache[dbModulePath] = {
    id: dbModulePath,
    filename: dbModulePath,
    loaded: true,
    exports: { db: testDb },
  };

  const queries = require('../src/app/actions/exercises/queries.ts');
  const { eq } = require('drizzle-orm');
  const sessionsToClean = new Set();

  const [migrationState] = await drizzleClient`
    SELECT COUNT(*)::int AS column_count
    FROM information_schema.columns
    WHERE table_name = 'exercise_attempts'
      AND column_name IN (
        'submission_id', 'request_fingerprint', 'check_result',
        'session_snapshot', 'next_exercise', 'no_more_exercises', 'matchmaking'
      )
  `;

  if (migrationState.column_count !== 7) {
    test('submit concurrency integration requires migration 0008', {
      skip: 'The P0 idempotency migration is not applied to TEST_DATABASE_URL',
    }, () => {});
    await drizzleClient.end({ timeout: 5 });
    return;
  }

  const [exerciseRow] = await drizzleClient`
    SELECT id
    FROM exercises
    WHERE is_active = true
      AND type = 'multiple_choice'
    ORDER BY id
    LIMIT 1
  `;
  if (!exerciseRow) {
    await drizzleClient.end({ timeout: 5 });
    throw new Error('At least one active multiple_choice exercise is required');
  }

  const exercise = await queries.getExerciseById(exerciseRow.id, testDb);
  if (!exercise || exercise.type !== 'multiple_choice') {
    await drizzleClient.end({ timeout: 5 });
    throw new Error('The selected integration exercise could not be loaded');
  }

  const answerA = { type: 'multiple_choice', selectedOptionIndex: 0 };
  const answerB = { type: 'multiple_choice', selectedOptionIndex: 1 };

  function dependenciesFor(expectedSubmissionId) {
    return {
      db: testDb,
      getExerciseById: queries.getExerciseById,
      getNextExerciseForSession: async (input) => {
        const attempts = await input.executor
          .select({ submissionId: schema.exerciseAttempts.submissionId })
          .from(schema.exerciseAttempts)
          .where(eq(schema.exerciseAttempts.sessionId, input.session.id));
        assert.ok(
          attempts.some((attempt) => attempt.submissionId === expectedSubmissionId),
          'matchmaking must see the current attempt inside the transaction',
        );
        return queries.getNextExerciseForSession(input);
      },
    };
  }

  async function submit({ sessionId, submissionId, submittedAnswer, returnNextExercise = true }) {
    sessionsToClean.add(sessionId);
    return submitExerciseAnswer({
      sessionId,
      submissionId,
      exerciseId: exercise.id,
      submittedAnswer,
      returnNextExercise,
      seenExerciseIds: [exercise.id],
    }, dependenciesFor(submissionId));
  }

  test('parallel different answers serialize aggregates and concurrent session creation', async () => {
    const sessionId = crypto.randomUUID();
    const results = await Promise.all([
      submit({ sessionId, submissionId: crypto.randomUUID(), submittedAnswer: answerA }),
      submit({ sessionId, submissionId: crypto.randomUUID(), submittedAnswer: answerB }),
    ]);

    assert.equal(results.filter((result) => result.success).length, 2);
    const [session] = await drizzleClient`
      SELECT completed_count, correct_count, total_score
      FROM learning_sessions
      WHERE id = ${sessionId}
    `;
    const [attempts] = await drizzleClient`
      SELECT COUNT(*)::int AS count
      FROM exercise_attempts
      WHERE session_id = ${sessionId}
    `;
    assert.equal(attempts.count, 2);
    assert.equal(session.completed_count, 2);
    assert.equal(session.total_score, results[0].result.scoreDelta + results[1].result.scoreDelta);
  });

  test('parallel retries of one submission id replay one deterministic result', async () => {
    const sessionId = crypto.randomUUID();
    const submissionId = crypto.randomUUID();
    const results = await Promise.all([
      submit({ sessionId, submissionId, submittedAnswer: answerA }),
      submit({ sessionId, submissionId, submittedAnswer: answerA }),
    ]);

    assert.equal(results.filter((result) => result.success).length, 2);
    assert.deepEqual(results[0], results[1]);
    const [counts] = await drizzleClient`
      SELECT COUNT(*)::int AS attempts,
             MAX(total_score)::int AS total_score,
             MAX(completed_count)::int AS completed_count
      FROM exercise_attempts
      JOIN learning_sessions ON learning_sessions.id = exercise_attempts.session_id
      WHERE exercise_attempts.session_id = ${sessionId}
        AND exercise_attempts.submission_id = ${submissionId}
    `;
    assert.deepEqual(counts, {
      attempts: 1,
      total_score: results[0].result.scoreDelta,
      completed_count: 1,
    });
  });

  test('same submission id with a different answer returns IDEMPOTENCY_CONFLICT', async () => {
    const sessionId = crypto.randomUUID();
    const submissionId = crypto.randomUUID();
    const first = await submit({
      sessionId,
      submissionId,
      submittedAnswer: answerA,
      returnNextExercise: false,
    });
    const conflict = await submit({
      sessionId,
      submissionId,
      submittedAnswer: answerB,
      returnNextExercise: false,
    });

    assert.equal(first.success, true);
    assert.equal(conflict.success, false);
    assert.equal(conflict.code, 'IDEMPOTENCY_CONFLICT');
    const [counts] = await drizzleClient`
      SELECT COUNT(*)::int AS attempts, MAX(completed_count)::int AS completed_count
      FROM exercise_attempts
      JOIN learning_sessions ON learning_sessions.id = exercise_attempts.session_id
      WHERE exercise_attempts.session_id = ${sessionId}
    `;
    assert.deepEqual(counts, { attempts: 1, completed_count: 1 });
  });

  test.after(async () => {
    for (const sessionId of sessionsToClean) {
      await drizzleClient`DELETE FROM exercise_attempts WHERE session_id = ${sessionId}`;
      await drizzleClient`DELETE FROM learning_sessions WHERE id = ${sessionId}`;
    }
    await drizzleClient.end({ timeout: 5 });
  });
}

function installTypeScriptRequire(rootDir) {
  const require = createRequire(import.meta.url);
  const typescript = require('typescript');
  const originalResolveFilename = Module._resolveFilename;
  const originalTsLoader = Module._extensions['.ts'];

  Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
    if (request.startsWith('@/')) {
      return originalResolveFilename.call(
        this,
        path.join(rootDir, 'src', request.slice(2)),
        parent,
        isMain,
        options,
      );
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
  };
  Module._extensions['.ts'] = function loadTypeScript(module, filename) {
    const source = fs.readFileSync(filename, 'utf8');
    const transpiled = typescript.transpileModule(source, {
      compilerOptions: {
        esModuleInterop: true,
        jsx: typescript.JsxEmit.ReactJSX,
        module: typescript.ModuleKind.CommonJS,
        moduleResolution: typescript.ModuleResolutionKind.NodeJs,
        target: typescript.ScriptTarget.ES2022,
      },
      fileName: filename,
    });
    module._compile(transpiled.outputText, filename);
  };

  process.once('exit', () => {
    Module._resolveFilename = originalResolveFilename;
    if (originalTsLoader) Module._extensions['.ts'] = originalTsLoader;
    else delete Module._extensions['.ts'];
  });

  return require;
}
