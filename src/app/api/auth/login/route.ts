import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { normalizeEmail, verifyPassword } from '@/lib/auth';
import { findUserByEmail } from '@/lib/repository';
import { createSession } from '@/lib/session';

export const runtime = 'nodejs';

/**
 * Message volontairement identique que l'email existe ou non :
 * on ne transforme pas le formulaire de connexion en oracle d'énumération.
 * Le coût asymétrique (scrypt) existe dans les deux cas.
 */
const GENERIC_ERROR = 'Identifiants incorrects.';

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide.' }, { status: 400 });
  }

  const { email, password } = (body ?? {}) as Record<string, unknown>;
  const rawEmail = typeof email === 'string' ? normalizeEmail(email) : '';
  const rawPassword = typeof password === 'string' ? password : '';

  if (!rawEmail || !rawPassword) {
    return NextResponse.json({ errors: { form: GENERIC_ERROR } }, { status: 401 });
  }

  const db = await getDb();
  const user = await findUserByEmail(db, rawEmail);

  if (!user) {
    // hash bidon pour ne pas révéler l'absence de compte par le temps de réponse
    await verifyPassword(rawPassword, 'scrypt$16384$8$1$00$00');
    return NextResponse.json({ errors: { form: GENERIC_ERROR } }, { status: 401 });
  }

  const ok = await verifyPassword(rawPassword, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ errors: { form: GENERIC_ERROR } }, { status: 401 });
  }

  await createSession(user.id, request.headers.get('user-agent'));

  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name },
  });
}
