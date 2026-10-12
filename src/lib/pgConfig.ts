import { readFileSync } from "node:fs";
import path from "node:path";
import type { ClientConfig } from "pg";

/**
 * Настройки подключения pg из DATABASE_URL.
 *
 * `sslrootcert=certs/…` в адресе pg читает сам, относительно текущей папки процесса — на Vercel файла там нет
 * (в серверную функцию попадают только файлы, которые видит сборщик). Поэтому сертификат читаем здесь:
 * путь — от корня проекта (process.cwd(); на Vercel файл добавлен через outputFileTracingIncludes в next.config.ts),
 * проверка сервера остаётся полной. Те же параметры без изменений понимает `prisma migrate`.
 */
export function pgConnectionConfig(url: string, readFile: (file: string) => string = readUtf8): ClientConfig {
  const parsed = new URL(url);
  const rootCert = parsed.searchParams.get("sslrootcert");
  if (!rootCert) return { connectionString: url };

  // Параметры из строки подключения pg ставит выше объекта ssl — убираем их, чтобы действовал наш ssl.
  parsed.searchParams.delete("sslrootcert");
  parsed.searchParams.delete("sslmode");
  return {
    connectionString: parsed.toString(),
    ssl: { ca: readFile(path.resolve(process.cwd(), rootCert)), rejectUnauthorized: true },
  };
}

function readUtf8(file: string): string {
  return readFileSync(file, "utf8");
}

export type PoolMode = "session" | "transaction";

const SUPABASE_POOLER_HOST = /\.pooler\.supabase\.com$/;
const SUPABASE_PORTS: Record<PoolMode, string> = { session: "5432", transaction: "6543" };

/**
 * Адрес Supabase pooler под нужный режим (у Supabase они различаются только портом).
 * session (5432) — держит соединение за клиентом: нужен worker'у (advisory lock), но всего 15 клиентов на проект.
 * transaction (6543) — соединение только на время запроса: для бессерверных функций Vercel.
 * Другие хосты (локальный PostgreSQL) не трогаем.
 */
export function urlForPoolMode(url: string, mode: PoolMode): string {
  const parsed = new URL(url);
  if (!SUPABASE_POOLER_HOST.test(parsed.hostname)) return url;
  parsed.port = SUPABASE_PORTS[mode];
  return parsed.toString();
}
