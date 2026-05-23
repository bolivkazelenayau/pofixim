# RFC V3: FIPI-Aligned Exercise Engine

## 1. Context

Current MVP already has:

- unified `exercises` table;
- server-side answer checkers;
- adaptive selection by difficulty and streak;
- interactive cards for `multiple_choice`, `fill_blank`, `punctuation_insert`.

At the same time, current exercises are still often "attention tests", not training of transfer and algorithmic reasoning required by FIPI guidance (`STUDY_COMPLIANCE.MD`).

## 2. Goals

1. Make validation and feedback aligned with FIPI methodology.
2. Preserve modularity and type safety while adding exercise complexity.
3. Improve UX from binary "correct/incorrect" to guided learning steps.
4. Keep rollout incremental and safe for current MVP.

## 3. Non-goals

- Full AI generation of tasks in V3.
- Full rewrite of chat shell/UI.
- Migration to a separate backend service.

## 4. Product Requirements

Each exercise in production bank MUST explicitly answer:

1. Which EGE line/topic it trains.
2. Which typical mistake it prevents.
3. Which analytical step the learner must perform.
4. How this step is visualized or explained.

If any answer is missing, exercise is not published.

## 5. Data Model Changes

Add metadata to `exercises` (jsonb/text fields):

- `source_alignment` (e.g. `ege-2025.task14`)
- `typical_mistake` (short textual error model)
- `mistake_model` (structured json)
- `algorithm_steps` (json array)
- `transfer_group` (string; links sibling tasks for transfer)
- `quality_status` (`draft | review | approved | archived`)

### Example `algorithm_steps`

```json
[
  { "id": "pos", "title": "Определи часть речи", "required": true },
  { "id": "context", "title": "Проверь значение в контексте", "required": true },
  { "id": "decision", "title": "Выбери написание/знак", "required": true }
]
```

## 6. Type Contracts (Zod + TS)

### 6.1 Exercise Quality Envelope

Introduce `exerciseQualitySchema` and compose into each exercise type:

- `sourceAlignment: string`
- `typicalMistake: string`
- `algorithmSteps: AlgorithmStep[]`
- `mistakeModel: MistakeModel`
- `transferGroup?: string`

### 6.2 Checker Result Contract

Extend `CheckResult`:

- `mistakeCode: string | null`
- `failedStepIds: string[]`
- `stepFeedback: Array<{ stepId: string; ok: boolean; message: string }>`
- `nextRecommendation: { mode: 'retry' | 'transfer' | 'challenge'; reason: string }`

This keeps one normalized shape across all renderers and all checkers.

## 7. Validation Strategy (FIPI-Aligned)

Validation has 3 layers:

1. **Format validation** (Zod): payload/answer consistency.
2. **Rule validation** (checker): correctness against target rule.
3. **Method validation** (pedagogical): detect mistake class + failed step.

### Example: task14 style (слитно/раздельно/дефис)

Checker should not return only "wrong answer".  
It should classify:

- confusion of homonymous constructions;
- part-of-speech misidentification;
- context-semantics mismatch.

And then return step-level feedback for the algorithm.

## 8. UX/DX Changes

## 8.1 Learner UX

Add optional "step mode" for selected exercise families:

1. identify grammatical unit;
2. choose rule path;
3. place/enter final answer.

After submit:

- show exact error location;
- show failed algorithm step;
- show compact transfer example ("same rule, new context").

## 8.2 Content Author DX (Admin)

Admin create/edit form must require:

- `sourceAlignment`;
- `skillTags`;
- `typicalMistake`;
- `algorithmSteps`;
- explanation template with at least one algorithm step.

Add pre-publish validator and preview card with checker simulation.

## 9. Matchmaking Changes

Use not only rating/streak/type cycle, but also `skill_tag + mistake_code` history.

Rules:

- 2 consecutive mistakes in one `skillTag` => downgrade to `difficulty 1` + guided hint.
- 3 correct in same `skillTag` => transfer task in new context.
- challenge (`difficulty 2`) only after stable correctness, not random escalation.

## 10. API/Action Contracts

Update submit action response:

```ts
{
  success: boolean;
  result: CheckResult;
  session: { ... };
  pedagogy: {
    failedStepIds: string[];
    mistakeCode: string | null;
    recommendation: "retry" | "transfer" | "challenge";
  };
}
```

## 11. Migration Plan

### Phase 1 (safe foundation)

- Add metadata columns nullable.
- Add schemas for quality envelope (soft validation in admin).
- Keep runtime backward compatibility with existing exercises.

### Phase 2 (strict creation pipeline)

- Enforce quality fields for new/edited exercises.
- Add checker result extensions.
- Start collecting `mistakeCode` telemetry.

### Phase 3 (guided UX)

- Step mode for `fill_blank` + `punctuation_insert`.
- Step feedback UI + transfer recommendation.

### Phase 4 (FIPI priority coverage)

First focus:

- task14 (слитно/раздельно/дефис)
- task12 (глаголы/причастия)
- task18 (вводные/обращения)
- task21 (пунктуационный анализ)

## 12. Risks and Mitigations

- **Risk:** content team overhead grows.  
  **Mitigation:** templates + defaults + preview validator.

- **Risk:** checker complexity increases quickly.  
  **Mitigation:** shared checker interface + per-topic modules.

- **Risk:** UX becomes heavy.  
  **Mitigation:** guided mode only for error-prone topics; compact cards.

## 13. Definition of Done (V3)

V3 is complete when:

1. New exercises cannot be published without quality envelope.
2. Checker returns step-level pedagogical feedback.
3. Matchmaking reacts to skill-level mistakes, not just global correctness.
4. At least 4 FIPI-priority lines are covered with transfer flow.
5. Existing MVP flow remains functional for legacy content.

## 14. Immediate Next Tasks (Implementation Backlog)

1. Add DB columns and Drizzle migration for quality envelope.
2. Extend Zod schemas and `Exercise` types.
3. Extend `CheckResult` contract + action responses.
4. Add `mistakeCode` persistence in attempts.
5. Implement guided mode UI for `punctuation_insert`.
6. Add admin-side required fields + pre-publish validator.

