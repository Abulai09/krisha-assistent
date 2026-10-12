import { connection } from "next/server";
import { getDataHealth } from "@/server/services/dataHealthService";

/**
 * Для внешнего монитора (например, UptimeRobot): 200 — данные свежие, 503 — устарели или запуск завис.
 * Открыт без входа (см. PUBLIC_PATHS), поэтому отдаёт только статус — без имён источников и дат.
 */
export async function GET() {
  await connection();
  const health = await getDataHealth();
  return Response.json({ status: health.ok ? "ok" : "stale" }, { status: health.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
