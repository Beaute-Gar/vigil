import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { validateBotCommand } from '@/lib/bot';
import { createBotCommand, getOrCreateWorkspace } from '@/lib/repository';
import { getCurrentUser } from '@/lib/session';

export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';

/**
 * Pose une commande pour le bot.
 *
 * Rien n'est exécuté ici : la ligne part en `pending` et le bot la
 * réclame à son prochain passage sur `/api/bot/sync`. L'écran n'a donc
 * pas besoin de canal de retour — l'historique raconte la suite.
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

  const parsed = validateBotCommand(body);
  if (!parsed.ok) {
    return NextResponse.json({ errors: parsed.errors }, { status: 422 });
  }

  const db = await getDb();
  const workspace = await getOrCreateWorkspace(db);

  const command = await createBotCommand(db, {
    workspaceId: workspace.id,
    kind: parsed.value.kind,
    payload: parsed.value.payload,
  });

  return NextResponse.json({ command }, { status: 201 });
}
