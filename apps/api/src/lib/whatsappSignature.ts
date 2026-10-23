import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyMetaSignature(rawBody: Buffer, header: string | undefined, appSecret: string): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const providedHex = header.slice(7);
  if (!/^[0-9a-f]{64}$/i.test(providedHex)) return false;
  const provided = Buffer.from(providedHex, 'hex');
  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
