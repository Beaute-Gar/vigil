import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { getRule, updateRule } from '@/lib/repository';
import { validateRule, validateRulePatch } from '@/lib/rule-validation';
import { getCurrentUser } from '@/lib/session';

export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';

/**
 * Mise à jour d'une règle — du simple `{ enabled }` du bouton de bascule
 * jusqu'à la réécriture complète du formulaire.
 *
 * La validation se fait en DEUX temps, et l'ordre compte :
 *
 *   1. `validateRulePatch`   → le fragment est-il bien formé ?
 *   2. `validateRule`        → la règle *résultante* est-elle cohérente ?
 *
 * Sans la deuxième, passer une règle de `low` à `critical` en laissant
 * l'action à `flag` serait accepté : le point de décision le plus grave
 * du système ne ferait rien. C'est exactement ce que le plancher interdit.
 */
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

  const patch = validateRulePatch(body);
  if (!patch.ok) {
    return NextResponse.json({ errors: patch.errors }, { status: 422 });
  }

  if (Object.keys(patch.value).length === 0) {
    return NextResponse.json(
      { errors: { form: 'Aucun champ à modifier.' } },
      { status: 422 },
    );
  }

  const db = await getDb();

  const before = await getRule(db, id);
  if (!before) {
    return NextResponse.json({ errors: { form: 'Règle introuvable.' } }, { status: 404 });
  }

  const merged = validateRule({ ...before, ...patch.value });
  if (!merged.ok) {
    return NextResponse.json({ errors: merged.errors }, { status: 422 });
  }

  const outcome = await updateRule(db, {
    ruleId: id,
    value: patch.value,
    actor: { id: user.id, email: user.email },
  });

  if (!outcome.ok) {
    return NextResponse.json({ errors: { form: 'Règle introuvable.' } }, { status: 404 });
  }

  return NextResponse.json({ rule: outcome.rule });
}
