import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import { rules } from '@/db/schema';
import { appendAudit } from '@/lib/repository';
import { getCurrentUser } from '@/lib/session';

export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';

const Body = z.object({
  enabled: z.boolean(),
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
      { errors: { form: 'Valeur invalide.' } },
      { status: 422 },
    );
  }

  const db = await getDb();

  const [rule] = await db.select().from(rules).where(eq(rules.id, id)).limit(1);
  if (!rule) {
    return NextResponse.json({ errors: { form: 'Règle introuvable.' } }, { status: 404 });
  }

  if (rule.enabled === parsed.data.enabled) {
    return NextResponse.json({ rule });
  }

  const [updated] = await db
    .update(rules)
    .set({ enabled: parsed.data.enabled })
    .where(eq(rules.id, id))
    .returning();

  // Activer ou désactiver une règle change le comportement de la
  // modération : cela fait partie de l'historique, donc c'est journalisé.
  await appendAudit(db, {
    workspaceId: rule.workspaceId,
    event: parsed.data.enabled ? 'rule.enabled' : 'rule.disabled',
    details: {
      ruleId: rule.id,
      rule: rule.name,
      priority: rule.priority,
      severity: rule.severity,
      by: user.email,
    },
  });

  return NextResponse.json({ rule: updated });
}
