import { headers } from "next/headers";

/** Адрес клиента. На Vercel X-Forwarded-For выставляет сама платформа; локально — «local». */
export async function clientAddress(): Promise<string> {
  const headerList = await headers();
  return headerList.get("x-forwarded-for")?.split(",")[0]?.trim() || headerList.get("x-real-ip") || "local";
}
