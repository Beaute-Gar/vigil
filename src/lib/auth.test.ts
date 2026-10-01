import { describe, expect, it } from 'vitest';
import {
  PASSWORD_MIN_LENGTH,
  checkPassword,
  createSessionToken,
  hashPassword,
  hashToken,
  isValidEmail,
  normalizeEmail,
  verifyPassword,
} from '@/lib/auth';

describe('hashPassword / verifyPassword', () => {
  it('produit un hash au format attendu, jamais le mot de passe en clair', async () => {
    const stored = await hashPassword('mot-de-passe-correct-2026');
    expect(stored.startsWith('scrypt$')).toBe(true);
    expect(stored.split('$')).toHaveLength(6);
    expect(stored).not.toContain('mot-de-passe-correct-2026');
  });

  it('accepte le bon mot de passe', async () => {
    const stored = await hashPassword('une-phrase-de-passe-longue');
    await expect(verifyPassword('une-phrase-de-passe-longue', stored)).resolves.toBe(true);
  });

  it('refuse un mot de passe différent', async () => {
    const stored = await hashPassword('une-phrase-de-passe-longue');
    await expect(verifyPassword('une-phrase-de-passe-Longue', stored)).resolves.toBe(false);
    await expect(verifyPassword('', stored)).resolves.toBe(false);
  });

  it('salage : deux hash du même mot de passe diffèrent', async () => {
    const a = await hashPassword('le-meme-mot-de-passe');
    const b = await hashPassword('le-meme-mot-de-passe');
    expect(a).not.toBe(b);
    await expect(verifyPassword('le-meme-mot-de-passe', a)).resolves.toBe(true);
    await expect(verifyPassword('le-meme-mot-de-passe', b)).resolves.toBe(true);
  });

  it('échoue proprement sur un hash corrompu ou d\'un autre algorithme', async () => {
    await expect(verifyPassword('x', 'nimporte')).resolves.toBe(false);
    await expect(verifyPassword('x', 'md5$1$2$3$abcd$efgh')).resolves.toBe(false);
    await expect(verifyPassword('x', '')).resolves.toBe(false);
    await expect(verifyPassword('x', 'scrypt$$$$')).resolves.toBe(false);
  });

  it('normalise Unicode avant comparaison (NFKC)', async () => {
    // « é » composé vs décomposé : même mot de passe pour l'utilisateur
    const stored = await hashPassword('café-secret-2026');
    await expect(verifyPassword('café-secret-2026', stored)).resolves.toBe(true);
  });
});

describe('checkPassword', () => {
  it('exige une longueur minimale', () => {
    expect(checkPassword('court')).toBe('too_short');
    expect(checkPassword('a'.repeat(PASSWORD_MIN_LENGTH - 1))).toBe('too_short');
    expect(checkPassword('a'.repeat(PASSWORD_MIN_LENGTH))).toBeNull();
  });

  it('écarte les mots de passe courants, insensiblement à la casse', () => {
    expect(checkPassword('Password123')).toBe('common');
    expect(checkPassword('PASSWORD123')).toBe('common');
    expect(checkPassword('1234567890')).toBe('common');
    expect(checkPassword('un-phrase-qui-na-rien-de-commun')).toBeNull();
  });

  it('les entrées de la liste noire sont toutes atteignables (longueur minimale respectée)', () => {
    // Régression : des entrées < PASSWORD_MIN_LENGTH renverraient
    // toujours 'too_short' et ne protégeraient jamais.
    for (const pw of ['password123', 'qwerty12345', '1234567890', 'letmein123', 'admin12345']) {
      expect(pw.length).toBeGreaterThanOrEqual(PASSWORD_MIN_LENGTH);
      expect(checkPassword(pw)).toBe('common');
    }
  });
});

describe('sessions', () => {
  it('génère deux jetons distincts', () => {
    const a = createSessionToken();
    const b = createSessionToken();
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).not.toBe(b.tokenHash);
  });

  it('hache de façon déterministe : même jeton → même empreinte', () => {
    const t = 'jeton-de-test';
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).toHaveLength(64); // sha256 hex
    expect(hashToken(t)).not.toContain(t);
  });

  it('produit une expiration future cohérente avec le TTL', () => {
    const before = Date.now();
    const { expiresAt } = createSessionToken(3600);
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 3600 * 1000 - 50);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 3600 * 1000 + 50);
  });

  it('les jetons base64url ne contiennent pas de caractères de cookie problématiques', () => {
    const { token } = createSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('emails', () => {
  it('normalise en minuscules et retire les espaces', () => {
    expect(normalizeEmail('  USER@Example.COM ')).toBe('user@example.com');
  });

  it('valide les formats raisonnables', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('prenom.nom+tag@entreprise.ca')).toBe(true);
    expect(isValidEmail('pas-un-email')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('a @b.com')).toBe(false);
  });
});
