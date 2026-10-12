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
