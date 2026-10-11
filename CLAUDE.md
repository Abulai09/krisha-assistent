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
  (`synthetic`, `krisha-api` — заглушка `NOT_CONNECTED`; файловый импорт создаётся на каждый файл).
  `src/server/services/` — сценарии. Методика оценки — `docs/valuation.md`, источники — `docs/data-sources.md`.
  Главный конвейер — `collectionService.runCollection()`: advisory lock → fetch с retry/timeout → валидация →
  идемпотентный upsert по `(sourceId, externalId)` + история цен → деактивация → дубликаты → пересчёт оценок → `CollectionRun`.
- `src/app/` — только отображение; админка ставит `CollectionRun(status=QUEUED)`, выполняет worker.
- `src/config/env.ts` — единственное место чтения `process.env`.

## Правила проекта

- **Не реализовывать сбор данных с Krisha.kz** (соглашение запрещает, см. docs/adr/0001). Новый источник —
  только новая реализация `ListingSource` для разрешённого API/фида.
- Синтетические и реальные данные никогда не смешиваются (`DataSource.isSynthetic`, `dataRealmService`).
- Не выдумывать характеристики (неизвестное — `null`), не показывать фиктивную точность (`formatKztApprox`),
  при нехватке аналогов — `INSUFFICIENT_DATA`, а не догадка.
- Оценки строятся по ценам **предложения**, не сделок: «потенциальная разница» — не прибыль (торг, расходы, ремонт,
  налоги, юр. риски не учтены). Тексты UI не должны обещать выгоду.
- Денежные расчёты — только через `src/domain/money.ts`, без float.
- Next.js 16 с `cacheComponents`: API отличаются от привычных — читать `node_modules/next/dist/docs/` (см. AGENTS.md).
  Каждое чтение БД/`searchParams`/`params`/`usePathname` — внутри `<Suspense>`; серверные компоненты с данными
  начинаются с `await connection()`. В конфиге `serverActions` лежит в `experimental`.
- Prisma 7: клиент генерируется в `src/generated/prisma` (импорт `@/generated/prisma/client`), подключение через
  `@prisma/adapter-pg`, URL — в `prisma.config.ts`.
- Каждый Server Action админки начинается с `requireAdmin()` (внутри `guarded()` в `src/app/admin/actions.ts`).
- UI-тексты на русском, валюта ₸; адаптивные сетки — с `grid-cols-1`/`min-w-0`, иначе длинный текст даёт
  горизонтальную прокрутку на телефоне.
