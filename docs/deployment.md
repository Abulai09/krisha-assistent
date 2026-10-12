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

См. `.env.example`. В production обязательно задайте уникальный `SESSION_SECRET` (≥ 32 символов) и `SITE_PASSWORD`
(≥ 8), а администратора создайте командой `npm run admin:create -- <логин> "<Имя>"` (с `DATABASE_URL` рабочей базы).
Смена `SESSION_SECRET` завершает все сессии.
Сайт должен работать по HTTPS — cookie сессии в production помечается `Secure`.

## Проверка работы

- Обзор → «Состояние данных»: время последнего обновления, статус источников и worker'а
  (worker считается остановленным, если не подавал сигнал дольше 3 минут).
- «Управление» → журнал запусков: счётчики, ошибки, отклонённые записи.
- Логи worker'а — JSON-строки в stdout/stderr.

## Резервные копии

`npm run backup` снимает копию схемы приложения из базы `DATABASE_URL` (локальной или Supabase) в `backups/`
(формат pg_dump `-Fc`, хранятся 14 последних). Нужен запущенный Docker Desktop: pg_dump берётся из образа
`postgres:17-alpine`, версия должна быть не старше сервера (у Supabase — PostgreSQL 17). В копии есть хеши паролей —
папка `backups/` не попадает в git, храните её как секрет.

Ежедневно в 03:00 через Планировщик заданий Windows (лог — `logs/backup.log`):

```powershell
schtasks /Create /TN "DealFinder Backup" /SC DAILY /ST 03:00 /F `
  /TR "C:\Windows\System32\conhost.exe --headless cmd.exe /c \"C:\путь\к\krisha-assistent\scripts\backup.cmd\""
```

Восстановление (`--clean` удалит существующие таблицы схемы перед загрузкой):

```bash
docker run --rm -i -e PGPASSWORD postgres:17-alpine pg_restore --clean --if-exists --no-owner \
  -h <хост> -U <пользователь> -d <база> < backups/deal_finder-<дата>.dump
```

## Автоочистка устаревших данных

Worker раз в сутки удаляет то, что сайту больше не нужно (сроки — `src/domain/retention.ts`):

| Что | Через сколько дней |
| --- | --- |
| Снятое с продажи объявление (вместе с оценкой, аналогами и историей цен) | 90 после снятия |
| Завершённый запуск обновления | 90 |
| Журнал действий администратора | 365 |
| Неодобренная заявка на регистрацию | 30 |
| Неудачные попытки входа, сигналы остановленного worker'а | 1 |

Активные объявления, одобренные пользователи, администраторы и идущие запуски не удаляются никогда. Чистка идёт
под той же блокировкой, что и обновление, — если идёт сбор, она переносится на следующий цикл. Итог каждой чистки —
запись «Автоочистка устаревших данных» в «Управлении» → журнал. Вручную: `npm run prune`. Удалённое возвращается
только из резервной копии.

## Оповещение, если данные перестали обновляться

`/api/health` открыт без входа и отвечает `200 {"status":"ok"}` или `503 {"status":"stale"}` — если источник из
`SCHEDULED_SOURCES` не обновлялся дольше трёх интервалов worker'а или запуск идёт дольше часа (worker упал).
Подключите бесплатный монитор (например, UptimeRobot, тип HTTP(s), интервал 30–60 мин) к
`https://<сайт>/api/health` — он пришлёт письмо при ответе 503. То же предупреждение видно в «Управлении».

## Ограничения текущей версии

- Ограничение попыток входа — по адресу (10 неудач за 15 минут, таблица `LoginFailure`). Распределённый подбор
  с многих адресов оно не остановит; пароль администратора защищён длиной (≥ 12) и медленным scrypt.
- Выход, смена пароля или статуса завершают все сессии аккаунта (`User.sessionVersion`); на страницах сайта —
  в течение 30 секунд (кэш proxy), в «Управлении» — сразу.
- Полная Content-Security-Policy со `script-src` не настроена (нужны nonce для скриптов Next.js);
  выставлены `frame-ancestors`, `form-action`, `object-src`, `base-uri` и остальные защитные заголовки.
