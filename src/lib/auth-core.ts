export type AppRole = 'admin' | 'reporter' | 'viewer';
export interface SessionUser { id: string; username: string; name: string; role: AppRole }

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function authEnabled(): boolean {
  return true;
}

function sessionSecret(secret: string): string {
  return secret || 'chongqing-ruisi-construction-session-v1';
}

function encodePayload(value: string): string {
  const bytes = encoder.encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function decodePayload(value: string): string {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(base64);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

export async function createSessionToken(user: SessionUser, secret: string): Promise<string> {
  const expires = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const payload = encodePayload(JSON.stringify({ ...user, expires }));
  const key = await crypto.subtle.importKey('raw', encoder.encode(sessionSecret(secret)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return `${payload}.${toHex(signature)}`;
}

export async function verifySessionToken(token: string | undefined, secret: string): Promise<SessionUser | null> {
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const key = await crypto.subtle.importKey('raw', encoder.encode(sessionSecret(secret)), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const bytes = new Uint8Array(signature.match(/.{1,2}/g)?.map((hex) => Number.parseInt(hex, 16)) || []);
  const valid = await crypto.subtle.verify('HMAC', key, bytes, encoder.encode(payload));
  if (!valid) return null;
  try {
    const value = JSON.parse(decodePayload(payload)) as Partial<SessionUser> & { expires?: number };
    if (!value.id || !value.username || !value.name || !value.role || !['admin', 'reporter', 'viewer'].includes(value.role) || !value.expires || value.expires < Date.now()) return null;
    return { id: value.id, username: value.username, name: value.name, role: value.role };
  } catch {
    return null;
  }
}
