import type { Metadata } from 'next';
import { getDb } from '@/db';
import {
  BotPanel,
  type BotCommandView,
  type BotNodeView,
} from '@/components/bot-panel';
import { Note, PageHeader } from '@/components/ui';
import { BOT_HISTORY_LIMIT } from '@/lib/bot';
import {
  botNodeView,
  getBotNode,
  getOrCreateWorkspace,
  listBotCommands,
} from '@/lib/repository';

export const metadata: Metadata = { title: 'Bot WhatsApp' };
export const dynamic = 'force-dynamic';

/**
 * Console du pont WhatsApp.
 *
 * Le serveur ne fait qu’assembler : il lit le nœud (statut **recalculé**
 * à la lecture — 30 s sans signalement = hors ligne) et les vingt
 * dernières commandes, puis laisse le panneau client piloter le rythme
 * (rafraîchissement toutes les 3 s, au même tempo que le bot).
 */
export default async function BotPage() {
  const db = await getDb();
  const workspace = await getOrCreateWorkspace(db);

  const [node, commands] = await Promise.all([
    getBotNode(db, workspace.id),
    listBotCommands(db, workspace.id, BOT_HISTORY_LIMIT),
  ]);

  const view = botNodeView(node);
  const nodeView: BotNodeView | null = view
    ? {
        status: view.status,
        lastSeenAt: view.lastSeenAt ? view.lastSeenAt.toISOString() : null,
        payload: view.payload,
      }
    : null;

  const commandViews: BotCommandView[] = commands.map((c) => ({
    id: c.id,
    kind: c.kind,
    status: c.status,
    payload: c.payload,
    result: c.result,
    createdAt: c.createdAt.toISOString(),
    completedAt: c.completedAt ? c.completedAt.toISOString() : null,
  }));

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Bot WhatsApp"
        description="Le bot DJOUSSE TECH publie son état et ses logs, la console lui pose des ordres. Un seul canal, dans les deux sens."
        action={
          <span className="badge mono ring-1 ring-inset bg-white/[0.03] text-[var(--text-muted)] ring-[var(--border-strong)]">
            POST /api/bot/sync · 3 s
          </span>
        }
      />

      <BotPanel node={nodeView} commands={commandViews} />

      <div className="mt-4">
        <Note>
          Aucun canal temps réel n’est disponible ici : le bot interpelle le site toutes les
          3 s, et l’écran se rafraîchit au même rythme. Un nœud sans signalement depuis 30 s
          bascule en <strong>hors ligne</strong> à la lecture — sans cron, sans écriture.
        </Note>
      </div>
    </div>
  );
}
