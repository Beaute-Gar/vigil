import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { users } from '@/db/schema';
import {
  checkPassword,
  hashPassword,
  isValidEmail,
  normalizeEmail,
} from '@/lib/auth';
import { ensureMembership, findUserByEmail, getOrCreateWorkspace } from '@/lib/repository';
import { createSession } from '@/lib/session';

export const runtime = 'nodejs';

const MIN_NAME = 2;

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide.' }, { status: 400 });
  }

  const { email, password, name } = (body ?? {}) as Record<string, unknown>;
  const errors: Record<string, string> = {};

  const rawEmail = typeof email === 'string' ? normalizeEmail(email) : '';
  const rawPassword = typeof password === 'string' ? password : '';
  const rawName = typeof name === 'string' ? name.trim() : '';

  if (!isValidEmail(rawEmail)) errors.email = 'Adresse e-mail invalide.';
  if (rawName.length < MIN_NAME) errors.name = 'Le nom doit faire au moins 2 caractères.';

  // Vérifié après la longueur : deux messages distincts, pas un
  const pwIssue = checkPassword(rawPassword);
  if (pwIssue === 'too_short')
    errors.password = 'Au moins 10 caractères.';
  else if (pwIssue === 'common')
    errors.password = 'Ce mot de passe est trop courant.';

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ errors }, { status: 422 });
  }

  const db = await getDb();

  // 409 et non 403 : on ne révèle rien d'autre que « déjà pris ».
  // Un email existant est public de toute façon via l'inscription.
  if (await findUserByEmail(db, rawEmail)) {
    return NextResponse.json(
      { errors: { email: 'Un compte existe déjà avec cette adresse.' } },
      { status: 409 },
    );
  }

  const [user] = await db
    .insert(users)
    .values({
      email: rawEmail,
      name: rawName,
      passwordHash: await hashPassword(rawPassword),
    })
    .returning();

  // Chaque compte démarre sur son propre espace de travail.
  const ws = await getOrCreateWorkspace(db, `${rawName} — espace Vigil`);
  await ensureMembership(db, user.id, ws.id, 'owner');

  await createSession(user.id, request.headers.get('user-agent'));

  return NextResponse.json(
    { user: { id: user.id, email: user.email, name: user.name } },
    { status: 201 },
  );
}
