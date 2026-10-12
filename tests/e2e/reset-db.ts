import { db } from "@/lib/db";

async function main() {
  // Защита от ошибки конфигурации: очищать можно только тестовую базу.
  if (!process.env.DATABASE_URL?.includes("_test")) {
    throw new Error("reset-db: DATABASE_URL не похож на тестовую базу — очистка отменена");
  }
  await db.$executeRawUnsafe(
    'TRUNCATE "ValuationComparable", "Valuation", "ListingPriceHistory", "Listing", "CollectionRun", "DataSource", "WorkerHeartbeat", "User", "AuditLog", "LoginFailure" CASCADE',
  );
}

main().finally(() => db.$disconnect());
