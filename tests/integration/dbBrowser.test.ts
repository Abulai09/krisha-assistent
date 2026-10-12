import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { runCollection } from "@/server/services/collectionService";
import { deleteRow, listTables, readTable } from "@/server/services/dbBrowserService";
import { upsertAdmin } from "@/server/services/userService";
import { FakeSource, marketListings, resetDatabase } from "./helpers";

beforeEach(async () => {
  await resetDatabase();
});

describe("просмотр базы в «Управлении»", () => {
  it("показывает все таблицы с числом строк и не отдаёт хеш пароля", async () => {
    await upsertAdmin({ login: "boss", name: "Владелец", password: "admin-personal-pass" });
    const tables = await listTables();
    expect(tables.map((table) => table.name)).toContain("Listing");
    expect(tables.find((table) => table.name === "User")?.rows).toBe(1);

    const users = await readTable("User", 1);
    expect(users.rows[0]).toMatchObject({ login: "boss", role: "ADMIN" });
    expect(users.rows[0]).not.toHaveProperty("passwordHash");
  });

  it("листает страницы и удаляет объявление вместе с его оценкой", async () => {
    const source = new FakeSource();
    source.records = marketListings(60);
    await runCollection({ source, trigger: "CLI" });

    const first = await readTable("Listing", 1);
    expect(first).toMatchObject({ total: 60, page: 1, pages: 2 });
    expect(first.rows).toHaveLength(50);
    expect((await readTable("Listing", 99)).page).toBe(2);

    const id = String(first.rows[0].id);
    await deleteRow("Listing", id);
    expect(await db.listing.count()).toBe(59);
    expect(await db.valuation.count({ where: { listingId: id } })).toBe(0);
  });

  it("источник с объявлениями не удаляется, а только-для-просмотра таблицы не удаляются вовсе", async () => {
    const source = new FakeSource();
    source.records = marketListings(3);
    await runCollection({ source, trigger: "CLI" });
    const [dataSource] = (await readTable("DataSource", 1)).rows;

    await expect(deleteRow("DataSource", String(dataSource.id))).rejects.toThrow("ссылаются другие данные");
    await expect(deleteRow("User", "any")).rejects.toThrow("не удаляются");
  });
});
