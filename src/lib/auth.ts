/**
 * Authentification — mots de passe et sessions.
 *
 * Choix assumés (à défaut de dépendance externe) :
 *
 *  - **scrypt** depuis `node:crypto` : KDF recommandé par la NASA/RFC 7914,
 *    mémorisation-dur, sans dépendance native (bcrypt/argon2 cassent le
 *    build Windows et le CI sans compilation).
 *  - **Comparaison constante** (`timingSafeEqual`) : pas de fuite par timing.
 *  - **Session opaque hachée SHA-256 en base** : le jeton en clair n'existe
 *    que dans le cookie HTTP-only. Une fuite de base de données ne donne
 *    aucun jeton utilisable.
 *
 * Fonctions pures sur les chaînes : testables sans base ni framework.
 */
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/* ── Paramètres ───────────────────────────────────────────────────── */

const SCRYPT_N = 16384; // coût mémoire/CPU (2^14)
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;
// mémorisation requise : 128 * N * r ≈ 16 Mo → marge au-delà
const MAXMEM = 64 * 1024 * 1024;

/** Durée de vie d'une session, en secondes (7 jours). */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export const PASSWORD_MIN_LENGTH = 10;

/* ── Mots de passe ────────────────────────────────────────────────── */

/** `scrypt$N$r$p$saltHex$hashHex` */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize('NFKC'), salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: MAXMEM,
  });
  return ['scrypt', SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString('hex'), hash.toString('hex')].join(
    '$',
  );
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, nStr, rStr, pStr, saltHex, hashHex] = parts;
  const N = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');

  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  if (salt.length === 0 || expected.length === 0) return false;

  let candidate: Buffer;
  try {
    candidate = await scrypt(password.normalize('NFKC'), salt, expected.length, {
      N,
      r,
      p,
      maxmem: MAXMEM,
    });
  } catch {
    return false; // paramètres corrompus : échec propre, pas d'exception remontée
  }

  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export type PasswordIssue = 'too_short' | 'common' | null;

/**
 * Mots de passe courants — tous ≥ `PASSWORD_MIN_LENGTH`, sinon la
 * vérification de longueur les masquerait et cette liste serait morte.
 * Volontairement courte et explicite : une liste noire exhaustive est
 * une fausse sécurité, la longueur et l'entropie font le vrai travail.
 */
const COMMON = new Set([
  'password123',
  'qwerty12345',
  '1234567890',
  'letmein123',
  'iloveyou12',
  'welcome123',
  'admin12345',
  'monmotdepasse',
]);

export function checkPassword(password: string): PasswordIssue {
  if (password.length < PASSWORD_MIN_LENGTH) return 'too_short';
  if (COMMON.has(password.toLowerCase())) return 'common';
  return null;
}

/* ── Sessions ─────────────────────────────────────────────────────── */

export type SessionToken = {
  /** À mettre dans le cookie — jamais stocké en base */
  token: string;
  /** Ce qui est réellement persisté */
  tokenHash: string;
  expiresAt: Date;
};

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function createSessionToken(ttlSeconds = SESSION_TTL_SECONDS): SessionToken {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + ttlSeconds * 1000),
  };
}

/** Normalisation d'email : trim + minuscules (l'unicité en base en dépend). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(normalizeEmail(email));
}
