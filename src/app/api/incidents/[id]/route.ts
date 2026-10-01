import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { INCIDENT_STATUSES, type IncidentStatus } from '@/db/schema';
import { resolveIncident } from '@/lib/repository';
import { getCurrentUser } from '@/lib/session';

export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';

/**
 * Corps de décision validé par Zod : le type de sortie en dépend, donc
 * la validation est unique — côté route, pas de relecture dispersée.
 */
const Body = z.object({
  status: z.enum(INCIDENT_STATUSES),
  note: z.string().trim().max(500).optional(),
});

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  }

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide.' }, { status: 400 });
  }

  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { errors: { form: 'Données de décision invalides.' } },
      { status: 422 },
    );
  }

  const { status, note } = parsed.data;
  const target = status as IncidentStatus;

  // Un incident déjà tranché ne peut pas repasser par « open » :
  // la machine à états le refuse explicitement plutôt qu'un UPDATE muet.
  if (target === 'open') {
    return NextResponse.json(
      { errors: { form: 'Un incident tranché ne peut pas être rouvert directement.' } },
      { status: 409 },
    );
  }

  const db = await getDb();
  const out = await resolveIncident(db, {
    incidentId: id,
    to: target,
    actorId: user.id,
    note,
  });

  if (!out.ok) {
    const status409 = out.reason === 'not_found' ? 404 : 409;
    const message =
      out.reason === 'not_found'
        ? 'Incident introuvable.'
        : out.reason === 'already_final'
          ? 'Cet incident a déjà été tranché.'
          : 'Transition refusée.';
    return NextResponse.json({ errors: { form: message }, reason: out.reason }, { status: status409 });
  }

  return NextResponse.json({ incident: out.incident });
}
