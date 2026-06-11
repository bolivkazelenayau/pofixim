# PoFixim

Платформа для тренировки русского языка и управления банком упражнений ЕГЭ. Проект объединяет пользовательскую тренировку, быстрые режимы, админку, импорт заданий, доменную валидацию и p95-аудит производительности.

## Стек

- Next.js 16 App Router
- React 19
- PostgreSQL + Drizzle ORM
- Zod
- TanStack Query
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
- `getBlitzPoolAction`
- `getEge13QuickPoolAction`
- `getEge15QuickPoolAction`

Состояние пользователя хранится в Zustand persist. Submit ответа пишет попытку и обновляет learning session в одной транзакции. При `returnNextExercise` сервер сразу возвращает следующее упражнение.

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

ЕГЭ 13/15 сохраняют live refresh explanation: если объяснение изменилось в админке, карточка может подтянуть свежие данные из БД без пересборки приложения.

## Админка

Админка использует SSR prefetch + TanStack Query hydration.

Работает:

- list/detail cache;
- infinite list;
- фильтры по type/status/exam type;
- поиск;
- сортировки;
- optimistic edit/delete/batch updates;
- draft recovery;
- preview;
- manual refresh;
- URL selection через `?exercise=ID`.

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
npx.cmd tsc --noEmit
npm.cmd run lint
npm.cmd run build
node --check local-proxy.js
```

## Подробная архитектура

См. `ARCHITECTURE_V2.MD`.

