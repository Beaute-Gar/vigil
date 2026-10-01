import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { createRule, getOrCreateWorkspace } from '@/lib/repository';
import { validateRule } from '@/lib/rule-validation';
import { getCurrentUser } from '@/lib/session';

export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';

/**
 * Création d'une règle.
 *
 * Toute la validation métier vit dans `validateRule` : regex compilable
 * *et* cohérence sévérité/action. La route ne fait que traduire le
 * résultat en statut HTTP — invariablement.
 */
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

  const parsed = validateRule(body);
  if (!parsed.ok) {
    return NextResponse.json({ errors: parsed.errors }, { status: 422 });
  }

  const db = await getDb();
  const workspace = await getOrCreateWorkspace(db);

  const outcome = await createRule(db, {
    workspaceId: workspace.id,
    value: parsed.value,
    actor: { id: user.id, email: user.email },
  });

  if (!outcome.ok) {
    return NextResponse.json(
      { errors: { name: 'Une règle porte déjà ce nom dans cet espace.' } },
      { status: 409 },
    );
  }

  return NextResponse.json({ rule: outcome.rule }, { status: 201 });
}
