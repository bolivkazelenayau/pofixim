# Архитектура V2

Обновлено: 2026-06-14

## 1. Назначение проекта

PoFixim - платформа для хранения, проверки, редактирования и адаптивной выдачи упражнений по русскому языку, в первую очередь под банк ЕГЭ 9-21.

Система состоит из:

- основного тренировочного интерфейса на главной странице;
- быстрых режимов для отдельных типов ЕГЭ;
- админки для управления банком заданий;
- ingest/seed pipeline для загрузки заданий из Markdown и live-источников;
- PostgreSQL-базы с доменной валидацией через Zod;
- набора perf-скриптов для p95-аудита.

Основной принцип: контент может меняться в базе и сразу попадать в пользовательские сценарии без пересборки приложения. Пересборка нужна для изменения кода, UI, маршрутов и серверной логики.

## 2. Технологический стек

- Next.js App Router, Server Components, Route Handlers и Server Actions.
- React 19.
- TanStack Query для клиентского кэша админки.
- PostgreSQL + Drizzle ORM.
- Zod для строгой доменной валидации упражнений.
- Zustand persist для состояния тренировки на клиенте.
- `postgres` для служебных Node-скриптов.
- Tailwind/CSS + локальные UI-компоненты.

Важное правило проекта: Next.js здесь версии 16, поэтому перед изменением Next API надо сверяться с `node_modules/next/dist/docs/`.

## 3. Данные и база

Ключевые таблицы:

- `exercises` - банк заданий.
- `exercise_attempts` - попытки пользователя.
- `learning_sessions` - состояние тренировочной сессии, рейтинг, стрик.
- `skill_progress` - задел под прогресс по навыкам.
- `questions` - старый/легаси банк простых вопросов.

Ключевые поля `exercises`:

- `seed_key` - уникальный внешний ключ задания.
- `type` - доменный тип упражнения.
- `category` - орфография, пунктуация или смешанный тип.
- `difficulty` - текущая сложность.
- `skill_tags` - теги навыков и ЕГЭ, например `ege.13`.
- `payload`, `answer` - JSONB-структуры упражнения.
- `explanation` - объяснение, которое должно обновляться из базы без пересборки.
- `quality_status` - `draft`, `review`, `approved`, `archived`.
- `is_active` - участвует ли задание в выдаче.
- `search_blob`, `search_blob_normalized` - ускоренный поиск в админке.

Индексы, важные для текущей производительности:

- `exercises_updated_at_idx`
- `exercises_type_idx`
- `exercises_quality_status_idx`
- `exercises_skill_tags_gin_idx`
- `exercises_type_quality_updated_id_idx`
- trigram/search indexes из admin search migration scripts

## 4. Доменные типы упражнений

Поддерживаемые типы задаются в:

- `src/features/exercises/types.ts`
- `src/features/exercises/schemas.ts`
- `src/features/exercises/checkers`
- `src/features/exercises/renderers`
- `src/components/admin-form`

Актуальные типы:

- `multiple_choice`
- `ege_multi_select`
- `fill_blank`
- `word_bank_cloze`
- `punctuation_insert`
- `ege20_complex_sentence_punctuation`
- `ege21_punctuation_analysis`
- `highlight_error`
- `match_pairs`
- `order_fragments`
- `text_correction`
- `dictation`
- `word_search`
- `punctuation_constructor`
- `orthography_repair`

Не каждый тип одинаково активно используется в пользовательском matchmaking. Список поддержанных для основной выдачи лежит в `SUPPORTED_EXERCISE_TYPES`.

## 5. Валидация и обработка плохих строк

Главная точка доменной валидации:

- `src/features/exercises/schemas.ts`

Маппинг строки БД в доменную модель:

- `dbExerciseToDomainExercise` в `src/app/actions/exercises.ts`

Если строка не проходит Zod, она не должна валить всю выдачу. Сейчас невалидные упражнения:

- логируются компактно как `Skipped invalid exercise row`;
- добавляются в in-memory `invalidExerciseIds`;
- исключаются из последующих подборов в рамках жизни процесса.

Это нужно, чтобы один шумный ряд в базе не ломал тренировку.

## 6. Главная страница и тренировка

Главная страница:

- `src/app/page.tsx`
- `src/components/ChatContainer.tsx`
- `src/store/chatStore.ts`

Состояние пользователя хранится в Zustand persist:

- сообщения;
- `sessionId`;
- виденные упражнения;
- cooldown-список;
- отвеченные упражнения;
- score/streak;
- флаг первого запроса.

Серверные действия:

- `getNextExerciseAction`
- `submitExerciseAnswerAction`
- `getExerciseBySeedKeyAction`
- `getQuickCardsBySeedAction`
- `getBlitzPoolAction`
- `getEge13QuickPoolAction`
- `getEge15QuickPoolAction`
- `refreshEge13QuickCardAction`
- `refreshEge15QuickCardAction`
- `getExerciseVersionsByIdsAction`
- `getExercisesByIdsAction`

`submitExerciseAnswerAction` теперь делает атомарную запись:

1. валидирует submitted answer;
2. получает/создаёт learning session;
3. достаёт упражнение;
4. проверяет ответ;
5. считает score/rating delta;
6. в одной транзакции пишет `exercise_attempts` и обновляет `learning_sessions`;
7. при `returnNextExercise: true` сразу возвращает следующее упражнение.

Это уменьшает лишний round-trip после ответа.

### 6.1 Seed/qseed control plane

Главная поддерживает управляемый запуск заданий через chat input. Это не часть matchmaking, а отдельный reproducibility-layer для проверки конкретных строк банка и quick-карточек.

Поддержанные команды:

- `/seed <seed_key>` - открыть конкретное обычное упражнение через `getExerciseBySeedKeyAction`.
- Голый `seed_key` из буфера - работает как `/seed <seed_key>`, но в input не показывается автоподставленная команда.
- `/qseed blitz <seed_key> row=1 word=1` - открыть конкретную блиц-карточку.
- `/qseed ege13 <seed_key> row=1` - открыть конкретный ряд ЕГЭ 13.
- `/qseed ege15 <seed_key> pos=1` - открыть конкретную позицию ЕГЭ 15.

Нормализация команд в `ChatContainer` специально терпима к пользовательским промахам:

- `/seed/seed live-ege15-48135`;
- `/qseed/qseed ege13 ege13-bank-59877 row=1`;
- `/seed /qseed blitz ege9-bank-46177 row=1 word=1`;
- лишние повторные `/seed` или `/qseed` в начале.

Paste UX устроен отдельно от submit parsing: при вставке seed/qseed input может показывать более чистую строку, но обработчик submit всё равно восстанавливает смысл команды. Если пользователь уже ввёл `/seed ` или `/qseed `, вставка не стирает префикс, а подставляет полезную часть.

Если обычный seed уже есть среди отрендеренных сообщений, новый bubble не создаётся. Вместо этого существующая карточка скроллится в центр и получает короткий motion-highlight только по контейнеру упражнения. Это защищает чат от дублей и делает повторный вызов сидов понятным.

Все seed/qseed labels копируются через `copyTextToClipboard`, который использует Clipboard API в secure context и fallback через временный textarea для Tailscale/LAN HTTP-сценариев.

### 6.1.1 Demo mode

`/demo` и `/demo on` включают демонстрационный режим главной страницы, `/demo off` выключает его. Это клиентское persistent-состояние `isDemoMode` в Zustand store, поэтому режим переживает refresh страницы.

Назначение demo mode - показать интерфейс без случайных destructive/technical действий:

- slash palette скрывает `/seed` и `/qseed`, чтобы в витринном сценарии не светить технический control plane;
- некоторые команды получают более мягкие пользовательские названия, но остаются теми же command ids внутри кода;
- submit ответов из `ExerciseRenderer` блокируется guard-ом в `ChatContainer`;
- `/start`/reset не выполняется, пока demo mode активен;
- запуск команд из палитры в demo mode очищает input и не вызывает fetch/open side effects.

Исключение сделано для текстового submit `/demo off`: он обрабатывается до общего demo guard, чтобы пользователь мог выйти из режима без devtools и без очистки localStorage.

Demo mode не является серверным флагом, не меняет matchmaking, не пишет попытки и не влияет на БД. Это UX-прослойка вокруг chat input, slash palette и обработчиков submit.

Quick seed открывает быстрые карточки без стартового flow:

- blitz не запускает timer picker и не показывает промежуточный start screen;
- ЕГЭ 13/15 quick сразу открывают конкретный ряд или позицию;
- закрытие модалки до начала игры не создаёт результат “режим завершён”.

Для blitz qseed селектор использует визуальный порядок слов внутри ряда. `row` и `word` считаются как 1-based индексы. Сборщик карточки допускает небольшой fuzzy mismatch вокруг пропуска, чтобы маска продолжала находить донорское слово во время ручного редактирования строки в админке.

### 6.2 Live refresh отрендеренных упражнений

Задания, уже показанные в чате, могут обновляться из БД без нового matchmaking-запроса. `ChatContainer` хранит id отрендеренных exercises, периодически и на focus/visibility проверяет только их `updatedAt` через `getExerciseVersionsByIdsAction`, а при изменении подтягивает свежие записи через `getExercisesByIdsAction`.

Важные границы:

- poll interval сейчас `5000 ms`;
- проверяются только уже показанные упражнения;
- новые задания не подбираются;
- score, seen/cooldown и matchmaking state не трогаются;
- feedback пересчитывается по сохранённому пользовательскому ответу, если упражнение обновилось.

Это компромисс для локальной схемы `3000 + 3002/3003`: изменения из админки становятся видны в чате без WebSocket/SSE-инфраструктуры.

Quick modes также слушают локальный `subscribeToExerciseUpdates` event и пересобирают текущую карточку, если изменилось упражнение, из которого она построена. Это особенно важно для blitz/ЕГЭ 13/ЕГЭ 15, потому что в UI отображается не вся запись, а производная карточка из payload/explanation.

## 7. Matchmaking

Файлы:

- `src/features/exercises/matchmaking.ts`
- `src/app/actions/exercises.ts`

Текущий flow:

1. Берётся session state.
2. Загружаются последние попытки.
3. Загружаются semantic fingerprints последних упражнений.
4. Формируется список blocked ids: клиентские `seenExerciseIds` + последние попытки + невалидные строки.
5. Из БД берётся широкий случайный пул:
   - обычный режим: до `180` упражнений;
   - `forceType`: до `80` упражнений.
6. Пул фильтруется по Zod и semantic fingerprint.
7. `selectBestExerciseCandidate` выбирает итоговое упражнение.

Скоринг учитывает:

- target difficulty от рейтинга/стрика;
- round-robin по типам через `nextExerciseType`;
- recent type penalty, чтобы типы не залипали;
- recently seen penalty;
- weak skill bonus;
- deterministic tie-break noise.

Важная деталь: предварительного среза по difficulty больше нет. Difficulty влияет на score, но не выкидывает типы до матчмейкера. Это сохраняет разнообразие.

## 8. Быстрые режимы

Быстрые режимы:

- blitz по ЕГЭ 9;
- quick ЕГЭ 13;
- quick ЕГЭ 15.

Файлы:

- `src/hooks/useBlitzGame.ts`
- `src/hooks/useEge13QuickGame.ts`
- `src/hooks/useEge15QuickGame.ts`
- `src/components/BlitzGame.tsx`
- `src/components/Ege13QuickGame.tsx`
- `src/components/Ege15QuickGame.tsx`
- `src/features/exercises/ege9Blitz.ts`
- `src/features/exercises/ege13Quick.ts`
- `src/features/exercises/ege15Quick.ts`

Пулы quick modes берутся случайно из активных упражнений нужного типа/тега:

- `ege.9` + `ege_multi_select`
- `ege.13` + `ege_multi_select`
- `ege.15` + `fill_blank`

Для ЕГЭ 13/15 сохранено важное поведение: карточки могут refresh-иться из БД уже после рендера. Это нужно, чтобы изменения `explanation` в админке подтягивались без пересборки приложения и без полного сброса UI.

Quick modes также поддерживают inspect/qseed mode:

- стартовый offer/timer flow пропускается;
- модалка открывается сразу на выбранной карточке;
- закрытие backdrop не превращает inspect-карточку в результат игры;
- seed и qseed можно скопировать из подписи карточки;
- для блица qseed mode не запускает соревновательный таймер.

Селекторы qseed:

- blitz: `row=<n> word=<n>`;
- ЕГЭ 13: `row=<n>`;
- ЕГЭ 15: `pos=<n>` или fallback `card=<id>`.

Карточки quick modes refresh-ятся из БД по текущим seed/selectors, чтобы изменения слов, рядов, вариантов и explanation в админке были видны уже открытым модалкам.

Backdrop-поведение согласовано между blitz/ege13/ege15: если это реальная running-сессия, закрытие может пройти через finish/result flow; если это offer/inspect/qseed, модалка просто закрывается.

## 9. Админка

Маршруты:

- `/admin`
- `/admin/login`
- `/admin/markdown-preview`
- `/api/admin/exercises`
- `/api/admin/exercises/[id]`

Главные файлы:

- `src/app/admin/page.tsx`
- `src/components/admin-form/AdminFormClient.tsx`
- `src/hooks/useExerciseList.ts`
- `src/hooks/useExerciseLoader.ts`
- `src/hooks/useExerciseSubmit.ts`
- `src/hooks/useBatchActions.ts`
- `src/app/actions/admin.ts`
- `src/app/actions/admin-exercise-*`

Админка умеет:

- создавать упражнения;
- редактировать упражнения;
- удалять упражнения;
- делать batch status/isActive updates;
- искать по id, seed_key, prompt, explanation, payload/answer blobs;
- фильтровать по type, quality status, exam type;
- сортировать по id, updatedAt, type, status;
- открывать упражнение из URL `?exercise=ID`;
- сохранять локальный draft при ошибке;
- восстанавливать draft;
- показывать preview и quality inspector.

Admin UX-слой сейчас содержит несколько специальных страховок:

- сортировка `updatedAt` показывает свежие изменения в единой группе по дате изменения, чтобы старые exam/type-группы не прятали последние правки;
- список упражнений не должен мигать между состояниями “загрузить ещё / skeleton / результат” при обычном поиске;
- floating save/toast используют compositor-friendly появление без scroll-linked translate;
- recovery modal появляется, когда локальная черновая версия отличается от БД, и блокирует фон полноценным overlay;
- `fill_blank` редактирует текст до/после пропуска многострочными полями;
- feedback preview использует тот же `FeedbackSectionsCard`, что и обычный чат, если checker вернул structured feedback.

## 10. TanStack Query в админке

Файлы:

- `src/components/query-provider.tsx`
- `src/components/admin-form/queryKeys.ts`
- `src/components/admin-form/queryCache.ts`
- `src/hooks/useExerciseList.ts`
- `src/hooks/useExerciseLoader.ts`
- `src/hooks/useExerciseSubmit.ts`
- `src/hooks/useBatchActions.ts`

Глобальные query defaults:

- `staleTime: 15_000`
- `retry: 1`
- `refetchOnMount: false`
- `refetchOnReconnect: false`
- `refetchOnWindowFocus: false`

Почему так:

- админка не должна дёргать сеть на каждый focus/refocus;
- SSR даёт свежий первый экран;
- ручной refresh и mutation invalidation остаются под контролем пользователя;
- optimistic updates дают быстрый UX.

SSR/hydration flow `/admin`:

1. `AdminPage` проверяет admin session.
2. Читает sort prefs из cookies.
3. Prefetch-ит первый list page через QueryClient.
4. Параллельно грузит selected exercise, если есть `?exercise=ID`.
5. Отдаёт dehydrated query state клиенту.
6. Клиент продолжает работу через `useInfiniteQuery`.

Мутации:

- edit оптимистично патчит list/detail cache;
- delete оптимистично убирает item и уменьшает totals;
- batch actions патчат списки и потом refresh-ят totals;
- create делает refresh списка.

## 11. Авторизация админки

Файл:

- `src/lib/admin-auth.ts`

Механика:

- пароль берётся из `ADMIN_PASSWORD`;
- session cookie называется `admin_session`;
- cookie `httpOnly`;
- payload подписан HMAC через `ADMIN_SESSION_SECRET`;
- TTL 8 часов;
- `secure` включается в production.

Важно: Server Actions и API routes не полагаются только на страницу. Каждая admin action вызывает `assertAdminAuthorized`. Это соответствует рекомендациям Next.js: авторизация должна быть внутри server action/data access path.

Login rate limit:

- in-memory;
- 5 попыток на 10 минут;
- подходит для локального/однопроцессного сценария;
- для публичного multi-instance production нужен внешний rate limiter.

## 12. Theme Hydration

Файлы:

- `src/app/layout.tsx`
- `src/components/theme-provider.tsx`
- `src/components/ThemeToggle.tsx`
- `src/app/globals.css`

Чтобы не было вспышки светлой темы при refresh в тёмной теме:

- `layout.tsx` запускает `beforeInteractive` script;
- script читает `localStorage.theme`;
- сразу ставит/снимает класс `dark`;
- выставляет `documentElement.style.colorScheme`;
- `ThemeProvider` при hydration читает текущий класс документа.

## 12.1 UI rendering details

Сообщения чата рендерятся через `MessageBubble`. Обычные bubble используют SVG-shape: прямоугольник с радиусами и хвостом является одним `path`, поэтому `fill`, `stroke` и `drop-shadow` применяются к единому силуэту. Это убирает эффект приклеенного CSS-треугольника.

Tail handoff отделён от семантического `isLastInGroup`: у предыдущего сообщения хвост может быть временно удержан, а у нового временно подавлен, чтобы в группе был только один визуальный хвост во время входной анимации.

Старые CSS-хвосты через `::before`/`::after` отключены. Размер SVG берётся через `ResizeObserver`, но входная анимация message bubble держится на compositor-friendly свойствах `opacity` и `transform`, чтобы path не пересчитывался от layout-анимации.

Leaderboard из `/stats` рендерится как trusted HTML только для ожидаемого формата stats-сообщения. Остальной markdown продолжает проходить через `renderEditorMarkdown`, чтобы обычные сообщения не превращались в произвольный raw HTML.

Feedback sections (`Правильный ответ` / `Объяснение`) рендерятся через общий `FeedbackSectionsCard`. Его используют и `MessageBubble`, и admin preview. Карточка включается, когда checker возвращает `feedback.correctAnswer` + `feedback.detailedExplanation`, либо когда admin preview может распарсить объяснение в структурированные секции. Это сохраняет единый визуальный язык разборов без насильственной унификации специализированных feedback-рендеров.

Dictation feedback остаётся специализированным HTML-рендером. Он строит diff по токенам, группирует соседние замены в цельные фрагменты, не отделяет пропущенную пунктуацию квадратными скобками и выводит `explanation` отдельным смысловым блоком внутри `dictation-feedback`.

## 13. SSR, CSR и кэш

Что SSR решает в проекте:

- первый `/admin` экран приходит с серверными данными из БД;
- контент из БД обновляется без пересборки приложения;
- protected routes могут проверять cookie на сервере;
- серверные actions держат DB logic вне клиента.

Что SSR не решает:

- изменение кода всё равно требует rebuild/restart;
- клиентское состояние Zustand живёт в браузере;
- React Query cache живёт на клиенте и управляется отдельно.

Главная страница `/` сейчас статическая оболочка, но данные упражнений приходят через Server Actions. Админка `/admin` dynamic, потому что использует cookies/searchParams и серверные данные.

## 14. Local Proxy и Tailscale

Файл:

- `local-proxy.js`

NPM scripts:

- `npm run proxy:dev` - listen `3001`, target `3000`.
- `npm run proxy:prod` - listen `3003`, target `3002`.

По умолчанию proxy слушает `0.0.0.0`, потому что нужен доступ с другого компьютера через Tailscale. Чтобы это не было полностью открытым локальным сервером, добавлен allowlist:

- `127.0.0.1/32`
- `::1`
- `100.64.0.0/10` - Tailscale IPv4 range.

Можно сузить доступ до конкретного Tailscale IP:

```powershell
$env:PROXY_ALLOWED_REMOTE_CIDRS="127.0.0.1/32,100.x.y.z/32"
npm.cmd run proxy:prod
```

Для Server Actions в `next.config.ts` добавлены allowed origins для localhost и Tailscale-портов, включая `100.75.225.52:3003`.

Для локального HTTP-доступа с телефона к production-start важно выставить:

```powershell
$env:ADMIN_COOKIE_SECURE="false"
```

Иначе в `NODE_ENV=production` cookie по умолчанию ставится как `Secure`, а браузер на `http://192.168...` может не отправлять её в API/Server Actions. Это выглядит как внезапный logout при открытии задания.

LAN origins можно расширить без изменения кода:

```powershell
$env:NEXT_EXTRA_ALLOWED_ORIGINS="192.168.1.44:3002,192.168.1.44:3003"
```

Если proxy должен принимать не только Tailscale, но и обычную локальную сеть:

```powershell
$env:PROXY_ALLOWED_REMOTE_CIDRS="127.0.0.1/32,100.64.0.0/10,192.168.0.0/16"
```

## 15. Ingest и seed pipeline

Основные источники:

- локальные Markdown-файлы в `test_sources`;
- live HTML с внешнего источника;
- валидированные JSONL;
- специализированные seed/normalize/fix скрипты.

Ключевые команды:

```powershell
npm.cmd run harvest:ege -- --types 9-21 --source local
npm.cmd run harvest:ege -- --types 15 --source live --count 1
npm.cmd run harvest:ege:parse-live
npm.cmd run db:seed:ege-live
npm.cmd run db:seed:ege9-21
```

Live pipeline:

1. Harvest raw HTML в `test_sources/raw_live/<timestamp>/`.
2. Parse + validate в `test_sources/parsed_live/<timestamp>/`.
3. Seed/import только validated rows.
4. Upsert по `seed_key`.
5. In-batch dedup по semantic fingerprint.

## 16. Perf и p95

Скрипты:

- `scripts/admin-http-p95.mjs`
- `scripts/admin-http-p95-matrix.mjs`
- `scripts/main-http-p95.mjs`
- `scripts/admin-perf-p95.mjs`

Команды:

```powershell
npm.cmd run admin:p95:http
npm.cmd run admin:p95:http:matrix
npm.cmd run main:p95:http
```

Admin HTTP p95:

- `/admin?exercise=ID`
- `/api/admin/exercises/ID`
- `/api/admin/exercises?...`

Admin matrix:

- list all;
- list by status;
- list by selected EGE tags;
- list/detail/page per exercise type.

Полезные env:

```powershell
$env:ADMIN_HTTP_BENCH_BASE_URL="http://localhost:3002"
$env:ADMIN_HTTP_BENCH_RUNS="200"
$env:ADMIN_HTTP_BENCH_WARMUP="10"
$env:ADMIN_HTTP_BENCH_EXAM_TYPES="17,20"
```

Main p95:

- `next`
- `next-seen`
- `blitz`
- `ege13`
- `ege15`

Полезные env:

```powershell
$env:MAIN_HTTP_BENCH_BASE_URL="http://localhost:3002"
$env:MAIN_HTTP_BENCH_RUNS="200"
$env:MAIN_HTTP_BENCH_WARMUP="10"
$env:MAIN_HTTP_BENCH_CASES="next,next-seen,blitz,ege13,ege15"
```

Последние ориентиры локального `next start`:

- admin list/detail API обычно в районе single-digit/low tens ms p95;
- admin page refresh обычно десятки ms p95, иногда с локальными max-хвостами;
- main `next` около `p95 ~74 ms`;
- quick modes после правок примерно `p95 ~30-47 ms`;
- все эти цифры для локального самописного приложения выглядят здоровыми.

## 17. Проверки перед завершением работ

Минимальный набор:

```powershell
rtk npx tsc --noEmit
rtk npm run lint
rtk npm run build
```

Для proxy:

```powershell
node --check local-proxy.js
```

Для кодировки UI-строк полезен Node-based scan по типичным mojibake-маркерам. После последнего прохода в `src` таких строк не осталось.

## 18. Текущие сильные стороны

- Админка защищена и не полагается только на UI route guard.
- Первый экран админки SSR-prefetched и hydrates into React Query.
- Клиентские refetch не шумят.
- Мутации имеют optimistic updates.
- Delete/edit batch sync теперь предсказуемее.
- Theme flash исправлен.
- Submit ответа атомарен на уровне БД.
- Обычные задания и quick modes сохраняют live refresh уже отрендеренного контента.
- Seed/qseed дают воспроизводимый ручной доступ к обычным и quick-заданиям.
- Clipboard fallback работает лучше в localhost/Tailscale/LAN сценариях.
- Bubble tail, tail handoff и repeated seed highlight отполированы как отдельные UX-состояния.
- Matchmaking вернул широкий пул без сужения по difficulty до скоринга.
- Tailscale proxy стал безопаснее через CIDR allowlist.
- Есть воспроизводимые p95-скрипты для админки и главной.

## 19. Известные ограничения

- `order by random()` нормально работает на текущем размере банка, но при сильном росте БД может стать дорогим. Тогда нужен sampling strategy без полного random sort.
- Login rate limit in-memory.
- Build зависит от доступа к Google Fonts через `next/font/google`, если fonts cache пустой.
- Некоторые старые docs/скрипты исторические и не отражают текущий best path.
- Production hardening ещё можно усилить: persistent rate limit, backup policy, structured logs, CI perf snapshots.
