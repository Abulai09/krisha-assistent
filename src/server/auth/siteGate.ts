import { verifyUserSessionValue } from "./session";

// Решение «пускать ли на страницу» — чистая функция, её проверяют unit-тесты. Вызывает её src/proxy.ts.
// Proxy отвечает только за «вошёл ли одобренный пользователь с действующей сессией»; права администратора
// проверяют сами страницы и Server Actions «Управления» (requireAdmin).

/** Страницы, открытые без входа. /api/health — для внешнего монитора, отдаёт только «ok / устарело». */
const PUBLIC_PATHS = new Set(["/login", "/register", "/api/health"]);

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname.replace(/\/+$/, "") || "/");
}

/** Что proxy нужно знать об аккаунте: одобрен ли и какая сейчас версия сессий. */
export type AccessState = { approved: boolean; sessionVersion: number } | null;

export type GateInput = {
  pathname: string;
  userCookie: string | undefined;
  sessionSecret: string;
  now: Date;
  loadAccess: (userId: string) => Promise<AccessState>;
};

export async function canEnter(input: GateInput): Promise<boolean> {
  if (isPublicPath(input.pathname)) return true;
  const claims = verifyUserSessionValue(input.userCookie, input.sessionSecret, input.now);
  if (!claims) return false;
  const access = await input.loadAccess(claims.userId);
  return access !== null && access.approved && access.sessionVersion === claims.sessionVersion;
}

/**
 * Кэш состояния аккаунта на время ttlMs: proxy вызывается на каждый запрос, включая предзагрузку ссылок,
 * а база (Supabase) далеко. Блокировка и выход на других устройствах действуют не позже чем через ttlMs;
 * «Управление» проверяет базу без кэша.
 */
export class AccessCache {
  private readonly entries = new Map<string, { value: AccessState; expiresAt: number }>();

  constructor(
    private readonly load: (userId: string) => Promise<AccessState>,
    private readonly ttlMs = 30_000,
  ) {}

  async get(userId: string, now = Date.now()): Promise<AccessState> {
    const cached = this.entries.get(userId);
    if (cached && cached.expiresAt > now) return cached.value;
    const value = await this.load(userId);
    if (this.entries.size > 10_000) this.entries.clear();
    this.entries.set(userId, { value, expiresAt: now + this.ttlMs });
    return value;
  }
}
