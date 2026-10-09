// Структурированный лог в одну строку JSON: легко читать глазами и искать по полям.
// Секреты и DATABASE_URL сюда не передаются.

type Level = "debug" | "info" | "warn" | "error";

function write(level: Level, message: string, context?: Record<string, unknown>) {
  const entry = { time: new Date().toISOString(), level, message, ...context };
  const line = JSON.stringify(entry, (_key, value) => (typeof value === "bigint" ? value.toString() : value));
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => {
    if (process.env.LOG_LEVEL === "debug") write("debug", message, context);
  },
  info: (message: string, context?: Record<string, unknown>) => write("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) => write("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) => write("error", message, context),
};
