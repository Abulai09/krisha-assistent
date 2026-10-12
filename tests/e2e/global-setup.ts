import { execSync } from "node:child_process";
import { config } from "dotenv";

/** Готовит тестовую БД: миграции, очистка и свежие синтетические данные. */
export default function globalSetup() {
  config({ quiet: true });
  const testUrl = process.env.DATABASE_URL_TEST;
  if (!testUrl) throw new Error("DATABASE_URL_TEST не задан — см. .env.example");
  const env = { ...process.env, DATABASE_URL: testUrl };
  execSync("npx prisma migrate deploy", { stdio: "pipe", env });
  execSync("npx tsx tests/e2e/reset-db.ts", { stdio: "inherit", env });
  execSync("npx tsx tests/e2e/seed-admin.ts", { stdio: "inherit", env });
  execSync("npx tsx src/worker/cli.ts collect synthetic", { stdio: "pipe", env });
}
