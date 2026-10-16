import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const TOKEN_PATTERN = /^pv_[a-f0-9]{64}$/;

export function createMcpToken(): string {
  return `pv_${randomBytes(32).toString('hex')}`;
}

export function hashMcpToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function verifyMcpToken(token: string, storedHash: string): boolean {
  if (!TOKEN_PATTERN.test(token) || !/^[a-f0-9]{64}$/.test(storedHash)) return false;
  return timingSafeEqual(Buffer.from(hashMcpToken(token), 'hex'), Buffer.from(storedHash, 'hex'));
}
