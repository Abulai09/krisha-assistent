# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Almaty Deal Finder — поиск недооценённых квартир в Алматы: оценка рыночной стоимости по аналогам, скидка,
Deal Score, объяснение. Исходное ТЗ — `PTOMPT.md`; обзор и статус функций — `README.md`.

## Команды

```bash
npm run db:up                 # PostgreSQL 17 в Docker, localhost:5434 (5432/5433 заняты другими проектами)
npm run dev                   # сайт, порт 3100 (3000/3001 заняты)
npm run db:migrate            # применить миграции (первый запуск); Node.js 22+
npm run seed                  # синтетические данные (= collect -- synthetic); на пустой БД сайт пуст без этого
npm run worker                # фоновый процесс; worker:once / collect -- <source> / import -- <file> / revalue
npm run check                 # typecheck + lint + unit — перед завершением задачи
npm run typecheck             # next typegen && tsc — typegen нужен для PageProps<"/route">
npm run lint
npm test                      # unit (vitest project "unit")
npm run test:integration      # реальная БД deal_finder_test, файлы последовательно
npm run test:e2e              # Playwright: next build + start на 3101 с тестовой БД, channel "chrome"
npx vitest run tests/unit/valuation.test.ts -t "выбросы"   # один тест
npx playwright test -g "фильтр"                             # один E2E
npx playwright test --project=mobile                        # проекты: desktop | mobile (только *mobile.spec.ts)
```

После изменения `prisma/schema.prisma`: `npm run db:migrate:dev -- --name <name>`, затем `npx prisma generate`
(Prisma 7 не генерирует клиент при migrate). После изменения алгоритма оценки: `npm run revalue`.

`.env` (шаблон `.env.example`): без `ADMIN_TOKEN` (≥16 симв.) и `SESSION_SECRET` (≥32) админка отключена (сайт работает);
integration и E2E берут `DATABASE_URL_TEST` (БД создаёт `docker/init-test-db.sql`, миграции катит globalSetup).

## Архитектура (подробно — docs/architecture.md)

- `src/domain/` — чистая бизнес-логика без БД/HTTP: `money.ts` (деньги в `bigint` тенге, площадь в сотых м²),
  `listing/` (zod-схема входа, нормализация, отпечатки дубликатов), `valuation/` (аналоги, статистика,
  уверенность, объяснения, коды предупреждений), `deals/dealScore.ts`. Здесь живут все бизнес-правила и unit-тесты.
- `src/server/sources/` — источники за интерфейсом `ListingSource`, регистрируются в `registry.ts`
  (`synthetic`, `krisha-api` — заглушка `NOT_CONNECTED`, `krisha-web` — страницы выдачи; файловый импорт — на каждый файл).
  `src/server/services/` — сценарии. Методика оценки — `docs/valuation.md`, источники — `docs/data-sources.md`.
  Главный конвейер — `collectionService.runCollection()`: advisory lock → fetch с retry/timeout → валидация →
  идемпотентный upsert по `(sourceId, externalId)` + история цен → деактивация → дубликаты → пересчёт оценок → `CollectionRun`.
- `src/app/` — только отображение; админка ставит `CollectionRun(status=QUEUED)`, выполняет worker
  (`src/worker/index.ts` — цикл, `cli.ts` — разовые команды, `tasks.ts` — очередь и плановые обновления).
- Решения по архитектуре — `docs/adr/`.
- `src/config/env.ts` — единственное место чтения `process.env`.

## Правила проекта

- Сбор с Krisha.kz — только через `krisha-web` в рамках docs/adr/0002: без обхода капчи/блокировок, без
  фото/контактов/описаний, с паузами. Вёрстка закреплена в `tests/unit/fixtures/krisha-search-page.html`.
- Синтетические и реальные данные никогда не смешиваются (`DataSource.isSynthetic`, `dataRealmService`).
- Не выдумывать характеристики (неизвестное — `null`), не показывать фиктивную точность (`formatKztApprox`),
  при нехватке аналогов — `INSUFFICIENT_DATA`, а не догадка.
- Оценки строятся по ценам **предложения**, не сделок: «потенциальная разница» — не прибыль (торг, расходы, ремонт,
  налоги, юр. риски не учтены). Тексты UI не должны обещать выгоду.
- Денежные расчёты — только через `src/domain/money.ts`, без float.
- Next.js 16 с `cacheComponents`: API отличаются от привычных — читать `node_modules/next/dist/docs/` (см. AGENTS.md).
  Каждое чтение БД/`searchParams`/`params`/`usePathname` — внутри `<Suspense>`; серверные компоненты с данными
  начинаются с `await connection()`. В конфиге `serverActions` лежит в `experimental`.
- Схема БД берётся из `?schema=` в `DATABASE_URL` (`databaseSchema()` в `src/lib/db.ts`); сырой SQL пишется без
  имени схемы — его находит `search_path`. Supabase: worker/миграции — Session pooler (advisory lock сессионный),
  сайт на Vercel — Transaction pooler (`DATABASE_POOL_MODE`, `urlForPoolMode()` в `src/lib/pgConfig.ts`).
- Prisma 7: клиент генерируется в `src/generated/prisma` (импорт `@/generated/prisma/client`), подключение через
  `@prisma/adapter-pg`, URL — в `prisma.config.ts`.
- Каждый Server Action админки начинается с `requireAdmin()` (внутри `guarded()` в `src/app/admin/actions.ts`).
- Доступ к сайту: `src/proxy.ts` пускает только одобренных пользователей (`User.status`, общий `SITE_PASSWORD`) и
  администратора; открыты `/login`, `/register`, `/admin` (`siteGate.ts`). Без `SITE_PASSWORD` сайт открыт — так
  работают тесты. Новая публичная страница — добавить в `PUBLIC_PATHS`.
- UI-тексты на русском, валюта ₸; адаптивные сетки — с `grid-cols-1`/`min-w-0`, иначе длинный текст даёт
  горизонтальную прокрутку на телефоне.
