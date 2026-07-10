import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

/**
 * Symmetric encryption for at-rest secrets (BYOK provider API keys).
 *
 * Format: `v1:<iv b64>:<authTag b64>:<ciphertext b64>` using AES-256-GCM.
 * The version prefix lets us rotate the scheme later without ambiguity.
 */

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';
const IV_BYTES = 12; // GCM standard nonce length.

/**
 * Derive a stable 32-byte key from ENCRYPTION_KEY. We hash so that operators can
 * supply a human-friendly passphrase of any length. In production you should set
 * a long, random ENCRYPTION_KEY and keep it stable (rotating it invalidates all
 * stored secrets).
 */
function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ENCRYPTION_KEY is required in production to store BYOK secrets.');
    }
    console.warn(
      '[crypto] ENCRYPTION_KEY not set — using an insecure dev default. Do NOT use in production.',
    );
    return createHash('sha256').update('slack-docmap-insecure-dev-key').digest();
  }
  return createHash('sha256').update(secret).digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Malformed or unsupported encrypted secret.');
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

/** Safe decrypt that returns undefined instead of throwing (e.g. for optional keys). */
export function tryDecryptSecret(payload: string | null | undefined): string | undefined {
  if (!payload) return undefined;
  try {
    return decryptSecret(payload);
  } catch (err) {
    console.error('[crypto] failed to decrypt stored secret:', (err as Error).message);
    return undefined;
  }
}
