import { spawn } from "node:child_process";
import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { getEnv } from "@/config/env";
import { databaseSchema } from "@/lib/db";

// Резервная копия схемы приложения через pg_dump из Docker-образа postgres:17 (версия pg_dump должна быть
// не старше сервера: у Supabase PostgreSQL 17). Нужен запущенный Docker Desktop.
// Пароль передаётся через переменную окружения контейнера, а не в командной строке.

const IMAGE = "postgres:17-alpine";
const KEEP = 14;
const BACKUP_DIR = path.resolve("backups");
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export async function backupDatabase(now = new Date()): Promise<string> {
  const url = new URL(getEnv().DATABASE_URL);
  const schema = databaseSchema(url.toString());
  const rootCert = url.searchParams.get("sslrootcert");
  const file = `${schema}-${now.toISOString().slice(0, 16).replace(/[:T]/g, "-")}.dump`;
  await mkdir(BACKUP_DIR, { recursive: true });

  const args = ["run", "--rm", "-e", "PGPASSWORD", "-v", `${BACKUP_DIR}:/backup`];
  if (rootCert) {
    args.push("-v", `${path.resolve("certs")}:/certs:ro`, "-e", "PGSSLMODE=verify-full", "-e", `PGSSLROOTCERT=/certs/${path.basename(rootCert)}`);
  }
  // Изнутри контейнера localhost — это сам контейнер, а не компьютер с базой.
  const host = LOCAL_HOSTS.has(url.hostname) ? "host.docker.internal" : url.hostname;
  args.push(IMAGE, "pg_dump", "-h", host, "-p", url.port || "5432", "-U", decodeURIComponent(url.username));
  args.push("-d", url.pathname.slice(1), "-n", schema, "--no-owner", "--no-privileges", "-Fc", "-f", `/backup/${file}`);

  await run("docker", args, { ...process.env, PGPASSWORD: decodeURIComponent(url.password) });
  await removeOldBackups(schema);
  return path.join(BACKUP_DIR, file);
}

/** Оставляем KEEP последних копий: имена с датой сортируются по времени. */
async function removeOldBackups(schema: string) {
  const files = (await readdir(BACKUP_DIR)).filter((name) => name.startsWith(`${schema}-`) && name.endsWith(".dump")).sort();
  for (const name of files.slice(0, -KEEP)) await rm(path.join(BACKUP_DIR, name));
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ["ignore", "inherit", "inherit"] });
    child.on("error", (error) => reject(new Error(`Не удалось запустить ${command}: ${error.message}. Запущен ли Docker Desktop?`)));
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`pg_dump завершился с кодом ${code}`))));
  });
}
