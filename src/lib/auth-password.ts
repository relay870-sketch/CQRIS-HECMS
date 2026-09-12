import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

export function validatePassword(password: string): string | null {
  if (password.length < 6) return '密码至少需要 6 位';
  if (password.length > 72) return '密码不能超过 72 位';
  return null;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [algorithm, salt, expectedHex] = stored.split(':');
  if (algorithm !== 'scrypt' || !salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
