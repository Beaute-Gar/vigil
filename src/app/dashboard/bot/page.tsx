import type { Metadata } from 'next';
import { getDb } from '@/db';
import {
  BotPanel,
  type BotCommandView,
  type BotNodeView,
} from '@/components/bot-panel';
import { Note, PageHeader } from '@/components/ui';
import { BOT_HISTORY_LIMIT, botRenderNow } from '@/lib/bot';
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
 * dernières commandes (les commandes mortes depuis 60 s y basculent en
 * `failed` à cette même lecture), puis laisse le panneau client piloter
 * le rythme (rafraîchissement toutes les 3 s, au même tempo que le bot).
 *
 * `now` part vers le client : c’est la référence commune du rendu
 * serveur, sans laquelle l’uptime et la distance depuis le dernier
 * signalement divergent à l’hydratation (erreur React #418).
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
    <div className="max-w-[1400px]">
      <PageHeader
        eyebrow="PONT WHATSAPP"
        title="Bot WhatsApp"
        description="Le bot DJOUSSE TECH publie son état et ses logs, la console lui pose des ordres. Un seul canal, dans les deux sens."
        action={
          <span className="badge mono ring-1 ring-inset bg-[var(--surface)] text-[var(--text-muted)] ring-[var(--border-strong)]">
            POST /api/bot/sync · 3 s
          </span>
        }
      />

      <BotPanel node={nodeView} commands={commandViews} now={botRenderNow()} />

      <div className="mt-4">
        <Note>
          Aucun canal temps réel n’est disponible ici : le bot interpelle le site toutes les
          3 s, et l’écran se rafraîchit au même rythme. Un nœud sans signalement depuis 30 s
          bascule en <strong>hors ligne</strong>, et une commande sans réponse depuis 60 s en{' '}
          <strong>échec</strong> — les deux états sont calculés à la lecture, sans cron.
        </Note>
      </div>
    </div>
  );
}
