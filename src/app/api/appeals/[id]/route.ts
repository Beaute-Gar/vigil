import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { decideAppeal } from '@/lib/repository';
import { getCurrentUser } from '@/lib/session';

export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';

const Body = z.object({
  status: z.enum(['granted', 'denied']),
  note: z.string().trim().min(1, 'Une motivation est obligatoire.').max(500),
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
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { errors: { form: first?.message ?? 'Données invalides.' } },
      { status: 422 },
    );
  }

  const db = await getDb();
  const out = await decideAppeal(db, {
    appealId: id,
    to: parsed.data.status,
    actorId: user.id,
    note: parsed.data.note,
  });

  if (!out.ok) {
    const code = out.reason === 'not_found' ? 404 : 409;
    const message =
      out.reason === 'not_found'
        ? 'Appel introuvable.'
        : out.reason === 'already_final'
          ? 'Cet appel a déjà été jugé.'
          : 'Transition refusée.';
    return NextResponse.json({ errors: { form: message }, reason: out.reason }, { status: code });
  }

  return NextResponse.json({ appeal: out.appeal });
}
