# PoFixim

Платформа для тренировки русского языка и управления банком упражнений ЕГЭ. Проект объединяет пользовательскую тренировку, быстрые режимы, админку, импорт заданий, доменную валидацию и p95-аудит производительности.

## Стек

- Next.js 16 App Router
- React 19
- PostgreSQL + Drizzle ORM
- Zod
- TanStack Query
- TanStack Form
- TanStack Pacer
- TanStack Table
- TanStack Virtual
- TanStack Hotkeys
- Zustand
- Tailwind/CSS

## Основные части

- `/` - тренировочный интерфейс.
- `/admin` - админка упражнений.
- `/admin/login` - вход в админку.
- `/api/admin/exercises` - list API для админки.
- `/api/admin/exercises/[id]` - detail API для админки.
- `/api/bench/main` - admin-protected endpoint для p95 главной/quick modes.

## Главная

Главная работает через Server Actions:

- `getNextExerciseAction`
- `submitExerciseAnswerAction`
- `getExerciseBySeedKeyAction`
- `getQuickCardsBySeedAction`
- `getBlitzPoolAction`
- `getEge13QuickPoolAction`
- `getEge15QuickPoolAction`

Состояние пользователя хранится в Zustand persist. Submit ответа пишет попытку и обновляет learning session в одной транзакции. При `returnNextExercise` сервер сразу возвращает следующее упражнение.

Для ручной проверки и воспроизводимого UX поддержаны seed-команды:

- `/seed <seed_key>` или вставка голого `seed_key` - открыть конкретное обычное упражнение.
- `/qseed blitz <seed_key> row=1 word=1` - открыть конкретную карточку блица без стартового таймер-флоу.
- `/qseed ege13 <seed_key> row=1` - открыть конкретную карточку ЕГЭ 13.
- `/qseed ege15 <seed_key> pos=1` - открыть конкретную карточку ЕГЭ 15.

Если seed уже отрендерен в чате, повторный вызов не создаёт дубль сообщения, а подсвечивает существующую карточку.

Для демонстрации интерфейса есть demo mode:

- `/demo` или `/demo on` включает режим витрины;
- `/demo off` выключает его;
- в demo mode скрываются `/seed` и `/qseed`, часть команд получает более пользовательские названия;
- ответы, reset и запуск команд из палитры не меняют прогресс и не дёргают выдачу новых заданий.

## Matchmaking

Подбор упражнения берёт широкий случайный пул из активных заданий, фильтрует повторы и semantic duplicates, затем выбирает кандидата через scorer.

Scorer учитывает:

- сложность по рейтингу/стрику;
- round-robin по типам;
- штраф за недавно встречавшийся тип;
- штраф за повтор;
- bonus слабых навыков;
- небольшой deterministic tie-break noise.

## Быстрые режимы

Поддержаны:

- blitz по ЕГЭ 9;
- quick ЕГЭ 13;
- quick ЕГЭ 15.

Быстрые режимы можно открывать случайно из палитры команд или воспроизводимо через `/qseed`. Для qseed-режима стартовый timer/start flow пропускается: карточка открывается сразу, что удобно для проверки конкретного слова, ряда или позиции.

ЕГЭ 13/15, blitz и уже отрендеренные задания в чате сохраняют live refresh: если формулировка, payload, answer или explanation изменились в админке, UI может подтянуть свежую версию из БД без пересборки приложения и без получения нового упражнения. Для quick-карточек refresh пересобирает текущую карточку из актуального упражнения.

Blitz-парсер допускает небольшой fuzzy mismatch вокруг пропуска, чтобы qseed оставался воспроизводимым даже если в админке временно редактируют маску слова.

Quick-алгоритмы имеют диагностический контракт: карточка хранит `resolution`, а админский Quality inspector показывает источник решения, fallback/fuzzy-состояния и qseed для воспроизведения. Normal pool остаётся консервативным и не берёт подозрительные fuzzy/fallback карточки; qseed/inspect сохраняет к ним доступ для ручной проверки.

## Админка

Админка использует SSR prefetch + TanStack Query hydration.

Работает:

- list/detail cache;
- infinite list;
- фильтры по type/status/exam type;
- поиск;
- сортировки;
- headless row/selection model через TanStack Table;
- виртуализированный список с sticky group header через TanStack Virtual;
- editor form lifecycle через TanStack Form;
- debounce поиска, draft autosave и preview через TanStack Pacer;
- admin shortcuts через локальный adapter над TanStack Hotkeys;
- optimistic edit/delete/batch updates;
- exercise revision history for create/update/delete/batch changes;
- baseline revision backfill for existing exercises via `db:backfill:exercise-revisions`;
- optimistic concurrency guard по `updatedAt`: устаревшая форма не перезаписывает свежую запись в БД, а остаётся локальным draft-ом;
- DB autosave синхронизирует новый `updatedAt` обратно в форму, чтобы следующий ручной save не ловил ложный stale conflict;
- draft recovery;
- preview;
- manual refresh;
- URL selection через `?exercise=ID`.

Важные UX-детали админки:

- список остаётся сгруппированным по `ЕГЭ · тип`, даже если строки отсортированы по `updatedAt`;
- sticky-заголовок активной группы в виртуализированном списке рисуется отдельным overlay;
- Virtual list не использует `content-visibility` внутри измеряемых rows, чтобы refresh не давал временный скачок расстояний;
- preview использует общий рендер feedback sections (`Правильный ответ` / `Объяснение`) там, где checker возвращает structured feedback;
- Quality inspector показывает quick diagnostics и structured feedback diagnostics, а компактный markdown рендерится через общий `CompactMarkdown`;
- dictation preview и chat feedback используют отдельный diff-render: группы замен показываются цельно, пропущенная пунктуация не превращается в квадратные скобки, а explanation выводится отдельным смысловым блоком;
- fill_blank поля вокруг пропуска редактируются как многострочный текст, а не как узкие однострочные поля;
- draft recovery показывает локальную страхующую копию, когда браузерная версия отличается от БД, и даёт явно выбрать версию из БД или восстановить локальные изменения;
- локальный draft пишется в `localStorage` с коротким debounce, чтобы markdown editor не лагал от синхронной записи на каждый микрошаг; критичные ошибки save/stale всё равно пишут draft сразу;
- `adminDebug=true` включает общие admin-логи, а шумные draft-логи включаются отдельно через `adminDraftDebug=true`.

TanStack Store пока сознательно не используется: persistent client/session/chat state уже покрыт Zustand, а замена store-слоя без конкретной продуктовой проблемы не нужна.

Контракт обновлений: `updatedAt` считается версией упражнения. Главная и quick-модалки точечно обновляют уже отрендеренные карточки по версии, а админка отправляет известную версию при save, чтобы не затирать изменения из другой вкладки.

Регрессионные quick-тесты запускаются командой:

```powershell
npm.cmd run test:quick
```

Они покрывают сборку blitz-карточек вокруг fuzzy-пропусков и базовую сборку quick-карточек ЕГЭ 13/15.

Авторизация:

- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`
- signed `httpOnly` cookie `admin_session`
- `assertAdminAuthorized` внутри admin actions/API paths

## Локальный запуск

```powershell
npm.cmd run dev
```

Production-style локально:

```powershell
npm.cmd run build
$env:PORT="3002"
npm.cmd run start
```

## Proxy

Для доступа через Tailscale:

```powershell
npm.cmd run proxy:dev
npm.cmd run proxy:prod
```

Профили:

- `proxy:dev`: listen `3001`, target `3000`
- `proxy:prod`: listen `3003`, target `3002`

По умолчанию proxy принимает только localhost и Tailscale IPv4 range `100.64.0.0/10`.

Сузить до одного Tailscale IP:

```powershell
$env:PROXY_ALLOWED_REMOTE_CIDRS="127.0.0.1/32,100.x.y.z/32"
npm.cmd run proxy:prod
```

Для локального HTTP-доступа с телефона/другого компьютера к `next start` нужно отключить Secure-cookie, иначе браузер на `http://192.168...` может не отправлять admin session:

```powershell
$env:ADMIN_COOKIE_SECURE="false"
$env:PORT="3002"
npm.cmd run start
```

Если доступ идёт через proxy из обычной LAN, а не через Tailscale, добавьте CIDR локальной сети:

```powershell
$env:PROXY_ALLOWED_REMOTE_CIDRS="127.0.0.1/32,100.64.0.0/10,192.168.0.0/16"
npm.cmd run proxy:prod
```

Если LAN IP хоста поменялся, добавьте origin без изменения кода:

```powershell
$env:NEXT_EXTRA_ALLOWED_ORIGINS="192.168.1.44:3002,192.168.1.44:3003"
```

## P95

Admin:

```powershell
$env:ADMIN_HTTP_BENCH_BASE_URL="http://localhost:3002"
$env:ADMIN_HTTP_BENCH_RUNS="200"
$env:ADMIN_HTTP_BENCH_WARMUP="10"
npm.cmd run admin:p95:http
```

Admin matrix:

```powershell
$env:ADMIN_HTTP_BENCH_EXAM_TYPES="17,20"
npm.cmd run admin:p95:http:matrix
```

Main/quick modes:

```powershell
$env:MAIN_HTTP_BENCH_BASE_URL="http://localhost:3002"
$env:MAIN_HTTP_BENCH_RUNS="200"
$env:MAIN_HTTP_BENCH_WARMUP="10"
npm.cmd run main:p95:http
```

## Ingest

Локальный Markdown:

```powershell
npm.cmd run harvest:ege -- --types 9-21 --source local
```

Live source:

```powershell
npm.cmd run harvest:ege -- --types 15 --source live --count 1
npm.cmd run harvest:ege:parse-live
npm.cmd run db:seed:ege-live
```

## Проверки

```powershell
rtk npx tsc --noEmit
rtk npm run lint
rtk npm run build
node --check local-proxy.js
```

## Подробная архитектура

См. `ARCHITECTURE_V2.MD`.
