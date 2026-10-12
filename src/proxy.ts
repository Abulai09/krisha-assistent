import { NextResponse, type NextRequest } from "next/server";
import { getSessionSecret, getSitePassword } from "@/config/env";
import { errorMessage } from "@/lib/utils/async";
import { logger } from "@/lib/utils/logger";
import { AccessCache, canEnter } from "@/server/auth/siteGate";
import { USER_COOKIE_NAME } from "@/server/auth/user";
import { findUserById } from "@/server/services/userService";

// Закрывает весь сайт от тех, кого администратор не одобрил. Срабатывает до рендера страницы,
// поэтому данные не попадают в ответ. «Управление» дополнительно проверяет роль ADMIN само (requireAdmin).

const accessCache = new AccessCache(async (userId) => {
  const user = await findUserById(userId);
  return user ? { approved: user.status === "APPROVED", sessionVersion: user.sessionVersion } : null;
});

export async function proxy(request: NextRequest) {
  const sessionSecret = getSessionSecret();
  if (!getSitePassword() || !sessionSecret) return NextResponse.next(); // SITE_PASSWORD не задан — сайт открыт всем

  try {
    const allowed = await canEnter({
      pathname: request.nextUrl.pathname,
      userCookie: request.cookies.get(USER_COOKIE_NAME)?.value,
      sessionSecret,
      now: new Date(),
      loadAccess: (userId) => accessCache.get(userId),
    });
    if (allowed) return NextResponse.next();
  } catch (error) {
    logger.error("Не удалось проверить доступ пользователя", { error: errorMessage(error) });
    return new NextResponse("Сервис временно недоступен. Обновите страницу через минуту.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const response = NextResponse.redirect(new URL("/login", request.url));
  // Недействительную или заблокированную сессию убираем, чтобы форма входа не путала пользователя.
  response.cookies.delete(USER_COOKIE_NAME);
  return response;
}

export const config = {
  // Статика Next.js и иконка — без проверки, иначе страница входа осталась бы без стилей.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
