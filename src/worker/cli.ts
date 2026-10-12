import path from "node:path";
import { db } from "@/lib/db";
import { errorMessage } from "@/lib/utils/async";
import { ADMIN_PASSWORD_MIN_LENGTH } from "@/server/auth/password";
import { runCollection, runRevaluation } from "@/server/services/collectionService";
import { recordAudit } from "@/server/services/auditService";
import { loginSchema, nameSchema, upsertAdmin } from "@/server/services/userService";
import { FileImportSource } from "@/server/sources/fileImportSource";
import { getSchedulableSource } from "@/server/sources/registry";
import { askPassword } from "./askPassword";
import { backupDatabase } from "./backup";
import { formatPruneSummary, pruneStaleData } from "@/server/services/retentionService";
import { processQueuedRun, runDuePruning, runDueScheduledCollections, syncSourceStatuses } from "./tasks";

// Разовые команды для ручного запуска и планировщиков ОС (cron, Планировщик заданий Windows).

const USAGE = `Использование:
  npm run collect -- <источник>     обновить источник (synthetic | krisha-api | krisha-web)
  npm run import -- <файл.csv|json> импортировать объявления из файла
  npm run revalue                   пересчитать оценки без загрузки данных
  npm run worker:once               один цикл worker'а (очередь + плановые обновления)
  npm run admin:create -- <логин> "<Имя>"  создать администратора или сменить ему пароль
  npm run backup                    резервная копия схемы БД в backups/ (нужен Docker)
  npm run prune                     удалить устаревшие данные сейчас (обычно worker делает это раз в сутки)`;

async function main() {
  const [command, argument, extra] = process.argv.slice(2);
  switch (command) {
    case "collect": {
      const source = argument ? getSchedulableSource(argument) : null;
      if (!source) return fail(`Укажите источник.\n${USAGE}`);
      return report(await runCollection({ source, trigger: "CLI" }));
    }
    case "import": {
      if (!argument) return fail(`Укажите путь к файлу.\n${USAGE}`);
      return report(await runCollection({ source: new FileImportSource(path.resolve(argument)), trigger: "CLI" }));
    }
    case "revalue": {
      const count = await runRevaluation();
      if (count === null) return fail("Сейчас выполняется другое обновление — повторите позже.");
      console.log(`Пересчитано оценок: ${count}`);
      return;
    }
    case "once": {
      await syncSourceStatuses();
      const queued = await processQueuedRun();
      if (queued) report(queued);
      for (const summary of await runDueScheduledCollections()) report(summary);
      await runDuePruning();
      return;
    }
    case "prune": {
      const summary = await pruneStaleData();
      if (!summary) return fail("Сейчас выполняется обновление — повторите позже.");
      console.log(`Удалено: ${formatPruneSummary(summary)}`);
      return;
    }
    case "backup":
      console.log(`Копия сохранена: ${await backupDatabase()}`);
      return;
    case "admin-create":
      return createAdmin(argument, extra);
    default:
      return fail(USAGE);
  }
}

/** Пароль спрашивается скрыто и дважды; в базу попадает только его хеш. */
async function createAdmin(loginArg: string | undefined, nameArg: string | undefined) {
  const login = loginSchema.safeParse(loginArg ?? "");
  const name = nameSchema.safeParse(nameArg ?? "");
  if (!login.success || !name.success) {
    return fail(`${(login.error ?? name.error)?.issues[0].message}
${USAGE}`);
  }
  const password = await askPassword(`Пароль администратора (от ${ADMIN_PASSWORD_MIN_LENGTH} символов): `);
  if (password.length < ADMIN_PASSWORD_MIN_LENGTH) return fail(`Пароль короче ${ADMIN_PASSWORD_MIN_LENGTH} символов.`);
  if ((await askPassword("Повторите пароль: ")) !== password) return fail("Пароли не совпадают.");
  const result = await upsertAdmin({ login: login.data, name: name.data, password });
  await recordAudit({ id: null, login: "cli" }, "ADMIN_PASSWORD_SET", `User:${login.data}`);
  console.log(result === "created" ? `Администратор «${login.data}» создан.` : `Пароль администратора «${login.data}» обновлён, его прежние сессии завершены.`);
}

function report(summary: Awaited<ReturnType<typeof runCollection>>) {
  if (summary.status === "LOCKED") return fail("Сейчас выполняется другое обновление — повторите позже.");
  console.log(
    [
      `Статус: ${summary.status}`,
      `Получено: ${summary.fetched}, новых: ${summary.created}, изменено: ${summary.updated}, без изменений: ${summary.unchanged}`,
      `Отклонено при проверке: ${summary.invalid}, убрано из активных: ${summary.deactivated}, оценено: ${summary.valued}`,
      summary.error ? `Ошибка: ${summary.error}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  if (summary.status === "FAILED") process.exitCode = 1;
}

function fail(message: string) {
  console.error(message);
  process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(`Ошибка: ${errorMessage(error)}`);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
