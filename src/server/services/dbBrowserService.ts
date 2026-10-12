import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

// Просмотр базы в «Управлении». Таблицы — закрытый список: имя из URL лишь выбирает запись из этого
// списка, в SQL оно не попадает. Хеши паролей не выбираются никогда.

export const PAGE_SIZE = 50;

export type DbRow = Record<string, unknown>;

type TableDefinition = {
  label: string;
  description: string;
  count: () => Promise<number>;
  page: (skip: number, take: number) => Promise<DbRow[]>;
  /** Удаление строки по id; нет — таблица только для просмотра. */
  remove?: (id: string) => Promise<number>;
};

const TABLES = {
  User: {
    label: "Пользователи",
    description: "Аккаунты сайта. Хеш пароля администратора не показывается. Управление — на главной «Управления».",
    count: () => db.user.count(),
    page: (skip, take) => db.user.findMany({ orderBy: { createdAt: "desc" }, skip, take, omit: { passwordHash: true } }),
  },
  Listing: {
    label: "Объявления",
    description: "Квартиры из всех источников. Удаление стирает и историю цен, и оценку.",
    count: () => db.listing.count(),
    page: (skip, take) => db.listing.findMany({ orderBy: { lastSeenAt: "desc" }, skip, take }),
    remove: async (id) => (await db.listing.deleteMany({ where: { id } })).count,
  },
  Valuation: {
    label: "Оценки",
    description: "Текущая оценка каждого объявления. Пересчитываются при каждом обновлении.",
    count: () => db.valuation.count(),
    page: (skip, take) => db.valuation.findMany({ orderBy: { valuedAt: "desc" }, skip, take }),
    remove: async (id) => (await db.valuation.deleteMany({ where: { id } })).count,
  },
  ValuationComparable: {
    label: "Аналоги оценок",
    description: "Какие объявления использованы как аналоги в каждой оценке.",
    count: () => db.valuationComparable.count(),
    page: (skip, take) => db.valuationComparable.findMany({ orderBy: { valuationId: "asc" }, skip, take }),
  },
  ListingPriceHistory: {
    label: "История цен",
    description: "Каждое изменение цены объявления.",
    count: () => db.listingPriceHistory.count(),
    page: (skip, take) => db.listingPriceHistory.findMany({ orderBy: { observedAt: "desc" }, skip, take }),
    remove: async (id) => (await db.listingPriceHistory.deleteMany({ where: { id } })).count,
  },
  DataSource: {
    label: "Источники",
    description: "Источники данных. Источник с объявлениями удалить нельзя — сначала удалите его объявления.",
    count: () => db.dataSource.count(),
    page: (skip, take) => db.dataSource.findMany({ orderBy: { key: "asc" }, skip, take }),
    remove: async (id) => (await db.dataSource.deleteMany({ where: { id } })).count,
  },
  CollectionRun: {
    label: "Запуски обновлений",
    description: "Журнал всех обновлений и импортов.",
    count: () => db.collectionRun.count(),
    page: (skip, take) => db.collectionRun.findMany({ orderBy: { requestedAt: "desc" }, skip, take }),
    remove: async (id) => (await db.collectionRun.deleteMany({ where: { id } })).count,
  },
  WorkerHeartbeat: {
    label: "Пульс worker'а",
    description: "Последний сигнал «жив» от фонового процесса.",
    count: () => db.workerHeartbeat.count(),
    page: (skip, take) => db.workerHeartbeat.findMany({ skip, take }),
  },
} satisfies Record<string, TableDefinition>;

export type TableName = keyof typeof TABLES;

export function isTableName(name: string): name is TableName {
  return Object.hasOwn(TABLES, name);
}

export class DbBrowserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DbBrowserError";
  }
}

export async function listTables(): Promise<{ name: TableName; label: string; rows: number; deletable: boolean }[]> {
  return Promise.all(
    (Object.entries(TABLES) as [TableName, TableDefinition][]).map(async ([name, table]) => ({
      name,
      label: table.label,
      rows: await table.count(),
      deletable: Boolean(table.remove),
    })),
  );
}

export async function readTable(name: TableName, page: number) {
  const table: TableDefinition = TABLES[name];
  const total = await table.count();
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pages);
  const rows = await table.page((current - 1) * PAGE_SIZE, PAGE_SIZE);
  return { label: table.label, description: table.description, deletable: Boolean(table.remove), rows, total, page: current, pages };
}

export async function deleteRow(name: TableName, id: string): Promise<void> {
  const table: TableDefinition = TABLES[name];
  if (!table.remove) throw new DbBrowserError("Из этой таблицы строки не удаляются.");
  try {
    if ((await table.remove(id)) === 0) throw new DbBrowserError("Строка не найдена — возможно, её уже удалили.");
  } catch (error) {
    // Внешний ключ с Restrict: например, источник, у которого ещё есть объявления.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      throw new DbBrowserError("Нельзя удалить: на эту строку ссылаются другие данные. Сначала удалите их.");
    }
    throw error;
  }
}
