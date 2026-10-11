# Развёртывание и работа 24/7

Система состоит из трёх частей: **PostgreSQL**, **сайт** (`npm run build && npm start`) и **worker**
(`npm run worker`). Worker — обычный долгоживущий Node.js-процесс. Он **не может** работать внутри
serverless-функций или Server Actions: они завершаются после ответа.

## Вариант 1 (рекомендуется, бесплатно): свой постоянно включённый компьютер

Подходит домашний ПК, мини-ПК или старый ноутбук.

```bash
npm ci
npm run db:up && npm run db:migrate
npm run build
```

Держите запущенными два процесса. Проще всего — через [pm2](https://pm2.keymetrics.io/) (бесплатный, open source),
он перезапускает процессы при сбое и после перезагрузки:

```bash
npm i -g pm2
pm2 start npm --name deal-web -- start
pm2 start npm --name deal-worker -- run worker
pm2 save
pm2 startup            # Linux/macOS: автозапуск после перезагрузки (на Windows — pm2-installer или Планировщик)
pm2 logs deal-worker   # логи
```

PostgreSQL в Docker уже настроен на `restart: unless-stopped`.

### Без постоянного процесса: расписание ОС

Вместо `npm run worker` можно запускать один цикл по расписанию — `npm run worker:once`
(обрабатывает очередь ручных запусков и плановые обновления, у которых подошло время).

- **Linux/macOS, cron** (каждые 15 минут): `*/15 * * * * cd /path/to/app && npm run worker:once >> worker.log 2>&1`
- **Windows, Планировщик заданий**: готовый скрипт `scripts/worker-once.cmd` (лог — `logs/worker.log`).
  Задача без окна консоли, пока пользователь в системе (PowerShell, права администратора не нужны):

  ```powershell
  $dir = "C:\path\to\app"
  Register-ScheduledTask -TaskName "DealFinder Worker" `
    -Action (New-ScheduledTaskAction -Execute "conhost.exe" -Argument "--headless cmd.exe /c `"$dir\scripts\worker-once.cmd`"" -WorkingDirectory $dir) `
    -Trigger (New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 15)) `
    -Settings (New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -StartWhenAvailable)
  ```

  Скрипт вызывает `C:\Program Files\nodejs\npm.cmd` — поправьте путь, если Node.js установлен в другое место.

Ручные запуски из админки в этом режиме выполняются при ближайшем срабатывании расписания.

## Вариант 2: бесплатный хостинг — с оговорками

Бесплатные тарифы обычно **не гарантируют 24/7**: процессы «засыпают» при отсутствии трафика,
фоновые воркеры часто платные, у бесплатных баз есть лимиты и сроки хранения. Перед выбором проверьте
актуальные условия провайдера. Рабочие сочетания:

- **Сайт** — любой хостинг Next.js с Node.js-рантаймом (Cache Components требуют Node.js, не Edge).
- **База** — бесплатный тариф управляемого PostgreSQL. Учитывайте лимит объёма: история цен растёт со временем.
- **Worker** — там, где разрешены постоянные процессы, или cron-задача на `npm run worker:once`. Если бесплатный
  тариф не даёт ни того ни другого, запускайте worker на своём компьютере (вариант 1) с `DATABASE_URL`
  облачной базы.

## Обязательные переменные окружения

См. `.env.example`. В production обязательно задайте уникальные `ADMIN_TOKEN` (≥ 16 символов) и
`SESSION_SECRET` (≥ 32 символов). Смена `SESSION_SECRET` завершает все сессии администратора.
Сайт должен работать по HTTPS — cookie сессии в production помечается `Secure`.

## Проверка работы

- Обзор → «Состояние данных»: время последнего обновления, статус источников и worker'а
  (worker считается остановленным, если не подавал сигнал дольше 3 минут).
- «Управление» → журнал запусков: счётчики, ошибки, отклонённые записи.
- Логи worker'а — JSON-строки в stdout/stderr.

## Резервные копии

```bash
docker compose exec -T db pg_dump -U dealfinder deal_finder > backup-$(date +%F).sql
```

## Ограничения текущей версии

- Ограничение попыток входа хранится в памяти процесса — при нескольких экземплярах сайта нужен общий стор.
- Сессии администратора без хранения в БД: отозвать одну сессию нельзя, только все сразу (смена `SESSION_SECRET`).
- Полная Content-Security-Policy со `script-src` не настроена (нужны nonce для скриптов Next.js);
  выставлены `frame-ancestors`, `form-action`, `object-src`, `base-uri` и остальные защитные заголовки.
