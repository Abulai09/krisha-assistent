import { connection } from "next/server";
import { logoutUserAction } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { currentUser } from "@/server/auth/user";

/** Имя вошедшего пользователя и выход. Пусто, если вход по паролю выключен или это администратор по токену. */
export async function UserMenu() {
  await connection();
  const user = await currentUser();
  if (!user) return null;
  return (
    <form action={logoutUserAction} className="ml-auto flex items-center gap-2 text-sm sm:ml-0">
      <span className="max-w-40 truncate text-muted-foreground" title={user.name}>
        {user.name}
      </span>
      <Button type="submit" variant="ghost" size="sm">
        Выйти
      </Button>
    </form>
  );
}
