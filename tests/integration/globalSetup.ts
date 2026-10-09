import { execSync } from "node:child_process";
import { config } from "dotenv";

/** Перед интеграционными тестами применяет миграции к отдельной тестовой БД. */
export default function setup() {
  config({ quiet: true });
  const testUrl = process.env.DATABASE_URL_TEST;
  if (!testUrl) throw new Error("DATABASE_URL_TEST не задан — см. .env.example");
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: testUrl } });
}
