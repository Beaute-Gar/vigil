import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { appeals, incidents } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/session';

export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';

const Body = z.object({
  incidentId: z.string().uuid('Identifiant d’incident invalide.'),
  reason: z
    .string()
    .trim()
    .min(10, 'La motivation doit faire au moins 10 caractères.')
    .max(500, '500 caractères maximum.'),
});

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide.' }, { status: 400 });
  }

  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { errors: { form: first?.message ?? 'Données invalides.' } },
      { status: 422 },
    );
  }

  const db = await getDb();

  const [incident] = await db
    .select()
    .from(incidents)
    .where(eq(incidents.id, parsed.data.incidentId))
    .limit(1);

  if (!incident) {
    return NextResponse.json({ errors: { form: 'Incident introuvable.' } }, { status: 404 });
  }

  // On ne conteste que ce qui a été écarté : confirmer un incident n'a
  // rien à appeler, et rouvrir un incident ouvert n'a pas de sens.
  if (incident.status !== 'dismissed') {
    return NextResponse.json(
      {
        errors: {
          form:
            incident.status === 'open'
              ? 'Cet incident est encore ouvert : tranchez-le d’abord.'
              : 'Seul un incident écarté peut faire l’objet d’un appel.',
        },
      },
      { status: 409 },
    );
  }

  const [existing] = await db
    .select({ id: appeals.id })
    .from(appeals)
    .where(eq(appeals.incidentId, incident.id))
    .limit(1);

  if (existing) {
    return NextResponse.json(
      { errors: { form: 'Un appel existe déjà pour cet incident.' } },
      { status: 409 },
    );
  }

  const [created] = await db
    .insert(appeals)
    .values({
      incidentId: incident.id,
      author: incident.subject,
      reason: parsed.data.reason,
    })
    .returning();

  return NextResponse.json({ appeal: created }, { status: 201 });
}
