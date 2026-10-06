import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { BOT_HISTORY_LIMIT } from '@/lib/bot';
import {
  botNodeView,
  getBotNode,
  getOrCreateWorkspace,
  listBotCommands,
} from '@/lib/repository';
import { getCurrentUser } from '@/lib/session';

export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';

/**
 * État courant du pont, pour une lecture légère : ce que le bot publie
 * (état recalculé à la lecture — 30 s sans signalement = `offline`)
 * et les vingt dernières commandes posées.
 *
 * `node` vaut `null` tant qu'aucun bot ne s'est jamais présenté : un
 * état absent se signale mieux qu'un état inventé.
 */
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  }

  const db = await getDb();
  const workspace = await getOrCreateWorkspace(db);

  const [node, commands] = await Promise.all([
    getBotNode(db, workspace.id),
    listBotCommands(db, workspace.id, BOT_HISTORY_LIMIT),
  ]);

  const view = botNodeView(node);

  return NextResponse.json({
    node: view
      ? { status: view.status, lastSeenAt: view.lastSeenAt, payload: view.payload }
      : null,
    commands,
  });
}
