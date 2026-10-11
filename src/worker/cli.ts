import path from "node:path";
import { db } from "@/lib/db";
import { errorMessage } from "@/lib/utils/async";
import { runCollection, runRevaluation } from "@/server/services/collectionService";
import { FileImportSource } from "@/server/sources/fileImportSource";
import { getSchedulableSource } from "@/server/sources/registry";
import { processQueuedRun, runDueScheduledCollections, syncSourceStatuses } from "./tasks";

// Разовые команды для ручного запуска и планировщиков ОС (cron, Планировщик заданий Windows).

const USAGE = `Использование:
  npm run collect -- <источник>     обновить источник (synthetic | krisha-api | krisha-web)
  npm run import -- <файл.csv|json> импортировать объявления из файла
  npm run revalue                   пересчитать оценки без загрузки данных
  npm run worker:once               один цикл worker'а (очередь + плановые обновления)`;

async function main() {
  const [command, argument] = process.argv.slice(2);
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
      return;
    }
    default:
      return fail(USAGE);
  }
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
