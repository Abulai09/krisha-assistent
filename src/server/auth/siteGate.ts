import { verifyUserSessionValue } from "./session";

// Решение «пускать ли на страницу» — чистая функция, её проверяют unit-тесты. Вызывает её src/proxy.ts.
// Proxy отвечает только за «вошёл ли одобренный пользователь»; права администратора проверяют сами
// страницы и Server Actions «Управления» (requireAdmin).

/** Страницы, открытые без входа. */
const PUBLIC_PATHS = new Set(["/login", "/register"]);

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname.replace(/\/+$/, "") || "/");
}

export type GateInput = {
  pathname: string;
  userCookie: string | undefined;
  sessionSecret: string;
  now: Date;
  isApproved: (userId: string) => Promise<boolean>;
};

export async function canEnter(input: GateInput): Promise<boolean> {
  if (isPublicPath(input.pathname)) return true;
  const userId = verifyUserSessionValue(input.userCookie, input.sessionSecret, input.now);
  return userId !== null && (await input.isApproved(userId));
}

/**
 * Кэш статуса пользователя на время ttlMs: proxy вызывается на каждый запрос, включая предзагрузку ссылок,
 * а база (Supabase) далеко. Блокировка начинает действовать не позже чем через ttlMs.
 */
export class ApprovalCache {
  private readonly entries = new Map<string, { approved: boolean; expiresAt: number }>();

  constructor(
    private readonly load: (userId: string) => Promise<boolean>,
    private readonly ttlMs = 30_000,
  ) {}

  async isApproved(userId: string, now = Date.now()): Promise<boolean> {
    const cached = this.entries.get(userId);
    if (cached && cached.expiresAt > now) return cached.approved;
    const approved = await this.load(userId);
    if (this.entries.size > 10_000) this.entries.clear();
    this.entries.set(userId, { approved, expiresAt: now + this.ttlMs });
    return approved;
  }
}
