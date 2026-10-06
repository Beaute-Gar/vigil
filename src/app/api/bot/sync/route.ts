import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { validateBotSync } from '@/lib/bot';
import { getOrCreateWorkspace, syncBot } from '@/lib/repository';
import { getCurrentUser } from '@/lib/session';

export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';

/**
 * Synchronisation du bot DJOUSSE TECH — le cœur du pont.
 *
 * Le bot appelle cette route toutes les ~3 s (polling : aucun canal
 * temps réel disponible sur Vercel). Un appel fait trois choses, dans
 * cet ordre : il dépose l'état + les logs, il rend les résultats des
 * commandes, il repart avec les commandes en attente.
 *
 * La session est celle du bot lui-même, ouverte par `POST /api/auth/login`
 * et portée par le cookie `vigil_session` : mêmes garanties que l'écran,
 * aucun jeton secondaire à gérer.
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

  const parsed = validateBotSync(body);
  if (!parsed.ok) {
    return NextResponse.json({ errors: parsed.errors }, { status: 422 });
  }

  const db = await getDb();
  const workspace = await getOrCreateWorkspace(db);

  const { commands } = await syncBot(db, {
    workspaceId: workspace.id,
    ...parsed.value,
  });

  return NextResponse.json({
    ok: true,
    commands: commands.map((c) => ({ id: c.id, kind: c.kind, payload: c.payload })),
  });
}
