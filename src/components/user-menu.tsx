import Link from "next/link";
import { connection } from "next/server";
import { logoutUserAction } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { currentUser } from "@/server/auth/user";

/** Имя вошедшего пользователя, ссылка на «Управление» для администратора и выход. */
export async function UserMenu() {
  await connection();
  const user = await currentUser();
  if (!user) return null;
  return (
    <form action={logoutUserAction} className="ml-auto flex items-center gap-2 text-sm sm:ml-0">
      {user.role === "ADMIN" && (
        <Link href="/admin" className="rounded-md px-2 py-1.5 font-medium whitespace-nowrap hover:bg-muted">
          Управление
        </Link>
      )}
      <span className="max-w-40 truncate text-muted-foreground" title={user.name}>
        {user.name}
      </span>
      <Button type="submit" variant="ghost" size="sm">
        Выйти
      </Button>
    </form>
  );
}
