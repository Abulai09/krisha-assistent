import { config } from "dotenv";
import { defineConfig, devices } from "@playwright/test";
import { E2E_ADMIN_TOKEN, E2E_SESSION_SECRET } from "./tests/e2e/constants";

// E2E-тесты поднимают production-сборку на отдельном порту с ТЕСТОВОЙ базой (DATABASE_URL_TEST).
// Рабочая база и dev-сервер (порт 3100) не затрагиваются.
config({ quiet: true });

const PORT = 3101;
const testDatabaseUrl = process.env.DATABASE_URL_TEST ?? "";


export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: "chrome",
    trace: "retain-on-failure",
    locale: "ru-RU",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: "chrome" }, testIgnore: /mobile\.spec/ },
    { name: "mobile", use: { ...devices["Pixel 7"], channel: "chrome" }, testMatch: /mobile\.spec/ },
  ],
  webServer: {
    command: `npx next build && npx next start --port ${PORT}`,
    url: `http://localhost:${PORT}/methodology`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: testDatabaseUrl,
      ADMIN_TOKEN: E2E_ADMIN_TOKEN,
      SESSION_SECRET: E2E_SESSION_SECRET,
      MANUAL_RUN_COOLDOWN_MINUTES: "5",
    },
  },
});
