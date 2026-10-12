import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

// Личный пароль администратора: в базе — только хеш scrypt с солью. scrypt намеренно медленный и требует
// памяти, поэтому перебор утёкшей базы обходится дорого. Формат: scrypt$N$r$p$соль$хеш (base64url).

const PARAMS = { N: 16_384, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
export const ADMIN_PASSWORD_MIN_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 256;

function derive(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, KEY_LENGTH, options, (error, key) => (error ? reject(error) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < ADMIN_PASSWORD_MIN_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    throw new Error(`Пароль администратора — от ${ADMIN_PASSWORD_MIN_LENGTH} до ${MAX_PASSWORD_LENGTH} символов.`);
  }
  const salt = randomBytes(16);
  const key = await derive(password, salt, PARAMS);
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored || password.length === 0 || password.length > MAX_PASSWORD_LENGTH) return false;
  const [algorithm, n, r, p, saltRaw, keyRaw] = stored.split("$");
  if (algorithm !== "scrypt" || !saltRaw || !keyRaw) return false;
  const expected = Buffer.from(keyRaw, "base64url");
  const actual = await derive(password, Buffer.from(saltRaw, "base64url"), { N: Number(n), r: Number(r), p: Number(p) });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
