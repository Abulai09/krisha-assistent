import { db } from "@/lib/db";

export const WORKER_ID = "main";
/** Если сигнала нет дольше этого времени, worker считается остановленным. */
export const HEARTBEAT_STALE_MS = 3 * 60_000;

export async function beat(startedAt: Date, currentTask: string | null) {
  const now = new Date();
  await db.workerHeartbeat.upsert({
    where: { id: WORKER_ID },
    create: { id: WORKER_ID, pid: process.pid, startedAt, lastBeatAt: now, currentTask },
    update: { pid: process.pid, startedAt, lastBeatAt: now, currentTask },
  });
}

export type WorkerState = { state: "RUNNING" | "STOPPED" | "NEVER_STARTED"; lastBeatAt: Date | null; currentTask: string | null };

export async function getWorkerState(now = new Date()): Promise<WorkerState> {
  const heartbeat = await db.workerHeartbeat.findUnique({ where: { id: WORKER_ID } });
  if (!heartbeat) return { state: "NEVER_STARTED", lastBeatAt: null, currentTask: null };
  const alive = now.getTime() - heartbeat.lastBeatAt.getTime() < HEARTBEAT_STALE_MS;
  return { state: alive ? "RUNNING" : "STOPPED", lastBeatAt: heartbeat.lastBeatAt, currentTask: alive ? heartbeat.currentTask : null };
}
