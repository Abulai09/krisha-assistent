import { db } from "@/lib/db";
import { upsertAdmin } from "@/server/services/userService";
import { E2E_ADMIN_LOGIN, E2E_ADMIN_PASSWORD } from "./constants";

// Тестовый администратор для E2E (только тестовая база — проверяет reset-db.ts, который запускается раньше).
upsertAdmin({ login: E2E_ADMIN_LOGIN, name: "E2E Администратор", password: E2E_ADMIN_PASSWORD }).finally(() => db.$disconnect());
