import "server-only";

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

/**
 * Wraps Node's callback-style scrypt in a Promise so server actions can use async/await; the
 * typings for `util.promisify(scrypt)` do not accept the options object cleanly in this TS setup.
 */
function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (err, derivedKey) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(derivedKey);
    });
  });
}

/**
 * Why: matches Node's recommended ceiling for these N/r/p values so scrypt does not fail at
 * runtime when memory limits differ across hosts.
 */
const SCRYPT_OPTIONS = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
} as const;

const SALT_BYTES = 16;
const KEY_BYTES = 64;

/**
 * Produces a salted scrypt digest for persistence (`saltHex:hashHex`).
 * Why: per-user random salts defeat rainbow tables; scrypt adds memory-hard cost without new deps.
 */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await scryptAsync(plain, salt, KEY_BYTES, SCRYPT_OPTIONS);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

/**
 * Verifies plaintext against a value from `hashPassword`.
 * Why: `timingSafeEqual` compares derived keys in constant time relative to equal-length buffers.
 */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 2) {
    return false;
  }
  const [saltHex, expectedHex] = parts;
  if (!saltHex || !expectedHex || !/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]+$/i.test(expectedHex)) {
    return false;
  }
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(expectedHex, "hex");
  if (salt.length !== SALT_BYTES || expected.length !== KEY_BYTES) {
    return false;
  }
  let derived: Buffer;
  try {
    derived = await scryptAsync(plain, salt, KEY_BYTES, SCRYPT_OPTIONS);
  } catch {
    return false;
  }
  return timingSafeEqual(derived, expected);
}
