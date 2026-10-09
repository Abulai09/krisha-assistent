import { config } from "dotenv";

// Подменяем DATABASE_URL до первого импорта lib/db — тесты никогда не трогают рабочую базу.
config({ quiet: true });
if (!process.env.DATABASE_URL_TEST) throw new Error("DATABASE_URL_TEST не задан");
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.MANUAL_RUN_COOLDOWN_MINUTES = "5";
