# Архитектура V2 (обновлено: 2026-05-22)

## 1) Цель

Платформа должна:
- хранить и валидировать задания ЕГЭ 9–21;
- адаптивно выдавать задания без смысловых дублей;
- поддерживать ingest из `local` и `live`;
- иметь прозрачный DX: CLI-команды, отчеты, quality gate, дедуп.

Стек:
- Next.js (app/actions + UI),
- PostgreSQL + Drizzle,
- Zod (валидация домена),
- Zustand (клиентское состояние).

---

## 2) Доменные типы заданий

Ключевые типы:
- `multiple_choice`
- `ege_multi_select`
- `fill_blank`
- `punctuation_insert`
- `ege20_complex_sentence_punctuation`
- `ege21_punctuation_analysis`

Источники схем:
- `src/features/exercises/types.ts`
- `src/features/exercises/schemas.ts`

---

## 3) БД и целостность

Ключевые таблицы:
- `exercises`
- `exercise_attempts`
- `learning_sessions`
- `skill_progress`

Целостность и дедуп:
1. `seed_key` уникален в `exercises`, импорт идет через `ON CONFLICT (seed_key) DO UPDATE`.
2. В сидах есть in-batch дедуп по fingerprint (чтобы не дублить идентичные записи в одном прогоне).
3. В выдаче заданий есть anti-repeat:
   - фильтр недавно виденных `exerciseId`,
   - фильтр по semantic fingerprint (`exerciseFingerprint`).
4. В админке усилен контроль:
   - создание без `seedKey` запрещено,
   - при создании и обновлении есть проверка конфликта по `seedKey`.

---

## 4) Проверка ответов

Центральный вход:
- `src/features/exercises/checkers/index.ts`

На выходе единый `CheckResult`:
- корректность,
- нормализованный ответ,
- список ошибок,
- feedback,
- score/rating delta.

---

## 5) Выдача заданий (matchmaking)

Файлы:
- `src/features/exercises/matchmaking.ts`
- `src/app/actions/exercises.ts`

Принципы:
- учитывать сложность, тип, историю попыток;
- исключать недавно виденные `exerciseId`;
- дополнительно исключать семантические дубли по fingerprint.

---

## 6) Админка и DX

Файлы:
- `src/components/AdminForm.tsx`
- `src/app/actions/admin.ts`

Есть:
- создание/редактирование задач;
- preview;
- поддержка `ege_multi_select`;
- управление quality status и `isActive`;
- защита от дублей по `seedKey` при create/update.

---

## 7) Ingest/Harvest pipeline

### 7.1 Local source pipeline (из `test_sources/*.md`)

Скрипты:
- `scripts/seed-ege9-11-from-md.mjs`
- `scripts/seed-ege12-19-from-md.mjs`
- `scripts/seed-ege20-from-md.mjs`
- `scripts/seed-ege21-from-md.mjs`
- `scripts/apply-ege-multi-select-enum.mjs`
- `scripts/apply-ege20-enum.mjs`

Единый запуск:
- `npm run harvest:ege -- --types 15 --source local`
- `npm run harvest:ege -- --types 9-21 --source local`
- `npm run harvest:ege -- --types 20,21 --source local`

---

### 7.2 Live source pipeline (новый 2-этапный)

#### Этап A: Harvest + Parse + Validation

1) Harvest raw HTML:
- `npm run harvest:ege -- --types 15 --source live --count 1`

Что делает `scripts/harvest-ege-live.mjs`:
- открывает `https://rus-ege.sdamgia.ru/`,
- находит конструктор,
- заполняет `probN` (приоритет exact mapping: `--types N -> probN`, fallback `probN+1`),
- submit формы (с fallback-click логикой),
- ловит `test?id=...` через URL/сеть,
- переходит в print URL,
- сохраняет HTML + `manifest.json` в:
  - `test_sources/raw_live/<timestamp>/`.

2) Parse + validate:
- `npm run harvest:ege:parse-live`
- или вручную:
  - `node scripts/parse-ege-live-html.mjs --rawDir "<abs_path_to_raw_live_run>"`

Результат:
- `test_sources/parsed_live/<timestamp>/report.json`
- `test_sources/parsed_live/<timestamp>/variants.json`
- `test_sources/parsed_live/<timestamp>/validated.jsonl`
- `test_sources/parsed_live/<timestamp>/invalid.jsonl`

По умолчанию strict-mode включен: если есть невалидные варианты, процесс падает с ошибкой.

#### Этап B: Validated JSON -> Exercises (seed/import)

- `npm run db:seed:ege-live`
- или вручную:
  - `node scripts/seed-ege-live-validated.mjs --parsedDir "<abs_path_to_parsed_live_run>"`

Что делает:
- читает `validated.jsonl`,
- маппит в доменную структуру `exercises`,
- валидирует,
- дедупит внутри батча по fingerprint,
- upsert в БД по `seed_key`.

---

## 8) CLI команды (актуальные)

Из `package.json`:
- `npm run harvest:ege`
- `npm run harvest:ege:parse-live`
- `npm run db:seed:ege-live`
- `npm run db:seed:ege9-11`
- `npm run db:seed:ege12-19`
- `npm run db:seed:ege20`
- `npm run db:seed:ege21`
- `npm run db:seed:ege9-21`

Параметры `harvest:ege`:
- `--types` (`15`, `9,10,11`, `9-21`)
- `--source` (`local` | `live`)
- `--count` (для live — число вариантов)
- `--profile` (зарезервировано)

Отладочные ENV для live:
- `HARVEST_HEADLESS=false`
- `HARVEST_BROWSER_CHANNEL=chrome`
- `HARVEST_FILL_VALUE=2` (или `100`)
- `HARVEST_DEBUG_FILL_ONLY=true`
- `HARVEST_DEBUG_CLICK_COMPOSE_ONLY=true`

---

## 9) Проверки после прогона

Быстрый чек:
1. Открыть `manifest.json` в `raw_live/<timestamp>`.
2. Убедиться, что есть `variant-*.html`.
3. Открыть `report.json` в `parsed_live/<timestamp>`:
   - `variantsInvalid = 0` для strict-прохода.
4. Проверить, что `validated.jsonl` не пуст.
5. После `db:seed:ege-live` проверить количество upserted в логе.

---

## 10) Рекомендуемый рабочий флоу

### Local
1. Подготовить `test_sources/*.md`.
2. `npm run harvest:ege -- --types 9-21 --source local`
3. Проверка в админке (preview + выборка).

### Live
1. `npm run harvest:ege -- --types 15 --source live --count 1`
2. `npm run harvest:ege:parse-live`
3. `npm run db:seed:ege-live`
4. Проверка выдачи в UI/боте на предмет:
   - корректного типа,
   - отсутствия дублей,
   - валидной проверки ответа.

---

## 11) Что уже закрыто

- Стабильный submit конструктора live (не только click по тексту).
- Fallback на сетевой детект `test?id=...`, если `waitForURL` промахивается.
- Корректный mapping `--types N -> probN` (с fallback на `probN+1`).
- Отдельные 2 пайплайна:
  - Harvest+Parse+Validate,
  - Validated Import/Seed.
- Усилен дедуп:
  - в БД (`seed_key` + upsert),
  - в батче (fingerprint),
  - в админке (конфликт `seedKey`),
  - в выдаче (anti-repeat + semantic fingerprint).

