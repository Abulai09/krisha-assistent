import { config } from "dotenv";

// Подменяем DATABASE_URL до первого импорта lib/db — тесты никогда не трогают рабочую базу.
config({ quiet: true });
if (!process.env.DATABASE_URL_TEST) throw new Error("DATABASE_URL_TEST не задан");
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.MANUAL_RUN_COOLDOWN_MINUTES = "5";
// Расписание — значения по умолчанию, а не из .env разработчика (там может быть krisha-web).
process.env.SCHEDULED_SOURCES = "synthetic";
process.env.WORKER_INTERVAL_MINUTES = "60";
// Источник krisha-web в тестах не ходит в сеть (страницы подменяются), включаем его независимо от .env.
process.env.KRISHA_WEB_ENABLED = "true";
