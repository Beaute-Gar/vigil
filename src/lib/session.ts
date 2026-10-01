/**
 * Session côté serveur : cookie HTTP-only + table `sessions`.
 *
 * Le jeton en clair n'existe que dans le cookie ; la base ne stocke que
 * son SHA-256. Une fuite de base ne donne aucun jeton utilisable.
 */
import { cookies } from 'next/headers';
import { and, eq, gt } from 'drizzle-orm';
import { getDb } from '@/db';
import { sessions, users } from '@/db/schema';
import {
  SESSION_TTL_SECONDS,
  createSessionToken,
  hashToken,
} from '@/lib/auth';

export const SESSION_COOKIE = 'vigil_session';

export type SessionUser = {
  id: string;
  email: string;
  name: string;
};

export async function createSession(userId: string, userAgent?: string | null): Promise<void> {
  const db = await getDb();
  const { token, tokenHash, expiresAt } = createSessionToken();

  await db.insert(sessions).values({
    userId,
    tokenHash,
    expiresAt,
    userAgent: userAgent?.slice(0, 300) ?? null,
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

/**
 * Résout l'utilisateur courant. Retourne `null` si le cookie est absent,
 * expiré ou inconnu — jamais d'exception pour un état normal.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const db = await getDb();
  const tokenHash = hashToken(token);

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return { id: row.id, email: row.email, name: row.name };
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (token) {
    const db = await getDb();
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }

  store.delete(SESSION_COOKIE);
}
