import { NextResponse, type NextRequest } from "next/server";
import { getAdminSecrets, getSiteAccess } from "@/config/env";
import { errorMessage } from "@/lib/utils/async";
import { logger } from "@/lib/utils/logger";
import { ADMIN_COOKIE_NAME } from "@/server/auth/admin";
import { ApprovalCache, canEnter } from "@/server/auth/siteGate";
import { USER_COOKIE_NAME } from "@/server/auth/user";
import { findUserById } from "@/server/services/userService";

// Закрывает весь сайт от тех, кого администратор не одобрил. Срабатывает до рендера страницы,
// поэтому данные не попадают в ответ. Server Actions админки дополнительно проверяют права сами.

const approvals = new ApprovalCache(async (userId) => (await findUserById(userId))?.status === "APPROVED");

export async function proxy(request: NextRequest) {
  const access = getSiteAccess();
  if (!access) return NextResponse.next(); // SITE_PASSWORD не задан — сайт открыт всем

  try {
    const allowed = await canEnter({
      pathname: request.nextUrl.pathname,
      adminCookie: request.cookies.get(ADMIN_COOKIE_NAME)?.value,
      userCookie: request.cookies.get(USER_COOKIE_NAME)?.value,
      sessionSecret: access.sessionSecret,
      adminEnabled: getAdminSecrets() !== null,
      now: new Date(),
      isApproved: (userId) => approvals.isApproved(userId),
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
