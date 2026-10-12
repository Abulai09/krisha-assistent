import { notFound, redirect } from "next/navigation";
import { currentUser, type CurrentUser } from "@/server/auth/user";

/**
 * Первая строка каждой страницы «Управления» — до любого чтения данных. Проверка именно в странице, а не в
 * layout: Next.js рендерит layout и страницу параллельно, и проверка в layout не остановила бы запросы страницы.
 * Не вошёл — на вход; обычный пользователь — «не найдено», чтобы не раскрывать, что раздел существует.
 */
export async function requireAdminPage(): Promise<CurrentUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") notFound();
  return user;
}
