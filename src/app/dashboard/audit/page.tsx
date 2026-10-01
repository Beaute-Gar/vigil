import type { Metadata } from 'next';
import { getDb } from '@/db';
import { EmptyState, Note, PageHeader } from '@/components/ui';
import { getOrCreateWorkspace, listAudit } from '@/lib/repository';

export const metadata: Metadata = { title: 'Journal d’audit' };
export const dynamic = 'force-dynamic';

const EVENT_TONE: Record<string, string> = {
  'incident.created': 'text-sky-300 ring-sky-500/30 bg-sky-500/15',
  'incident.dismissed': 'text-zinc-300 ring-zinc-500/30 bg-zinc-500/15',
  'incident.confirmed': 'text-emerald-300 ring-emerald-500/30 bg-emerald-500/15',
  'appeal.granted': 'text-emerald-300 ring-emerald-500/30 bg-emerald-500/15',
  'appeal.denied': 'text-rose-300 ring-rose-500/30 bg-rose-500/15',
  'rule.enabled': 'text-amber-300 ring-amber-500/30 bg-amber-500/15',
  'rule.disabled': 'text-amber-300 ring-amber-500/30 bg-amber-500/15',
  'rule.created': 'text-teal-300 ring-teal-500/30 bg-teal-500/15',
  'rule.updated': 'text-teal-300 ring-teal-500/30 bg-teal-500/15',
};

const DEFAULT_TONE = 'text-[var(--text-muted)] ring-[var(--border-strong)] bg-white/[0.03]';

function formatDetail(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

/**
 * Repère les champs que l'on sait présenter proprement. Le reste ne
 * s'affiche en JSON brut qu'en dernier recours — jamais en première ligne.
 */
function describeDetails(details: Record<string, unknown>): string[] {
  const parts: string[] = [];

  const from = formatDetail(details.from);
  const to = formatDetail(details.to);
  if (from && to) parts.push(`état ${from} → ${to}`);

  const rule = formatDetail(details.rule);
  if (rule) parts.push(`règle « ${rule} »`);

  // Écrit en clair au moment de la mutation (repository.ts) : le journal
  // ne dépend d'aucune table de traduction pour rester lisible.
  const changed = Array.isArray(details.changed)
    ? details.changed.map((c) => formatDetail(c)).filter((c): c is string => Boolean(c))
    : [];
  if (changed.length > 0) parts.push(`champ${changed.length > 1 ? 's' : ''} ${changed.join(', ')}`);

  // Inutile si « priorité » figure déjà dans les champs modifiés.
  const priority = typeof details.priority === 'number' ? details.priority : null;
  if (priority !== null && !changed.includes('priorité')) parts.push(`priorité ${priority}`);

  const action = formatDetail(details.action);
  const severity = formatDetail(details.severity);
  if (action && severity) parts.push(`décision ${action} · sévérité ${severity}`);

  const channel = formatDetail(details.channel);
  if (channel) parts.push(`canal ${channel}`);

  const matched = Array.isArray(details.matched) ? details.matched.length : 0;
  if (matched > 0) parts.push(`${matched} règle${matched > 1 ? 's' : ''} déclenchée${matched > 1 ? 's' : ''}`);

  const actor = formatDetail(details.by);
  if (actor) parts.push(`par ${actor}`);

  return parts;
}

export default async function AuditPage() {
  const db = await getDb();
  const workspace = await getOrCreateWorkspace(db);
  const entries = await listAudit(db, workspace.id, 250);

  const counts = entries.reduce<Record<string, number>>((acc, e) => {
    acc[e.event] = (acc[e.event] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Journal d’audit"
        description={`${entries.length} entrée${entries.length > 1 ? 's' : ''} — la chronologie complète de l’espace, dans l’ordre antéchronologique.`}
      />

      {entries.length > 0 && (
        <section className="flex flex-wrap gap-2 mb-5" aria-label="Répartition des événements">
          {Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .map(([event, n]) => (
              <span
                key={event}
                className={`badge mono ring-1 ring-inset ${EVENT_TONE[event] ?? DEFAULT_TONE}`}
              >
                {event}
                <span className="opacity-70">· {n}</span>
              </span>
            ))}
        </section>
      )}

      {entries.length === 0 ? (
        <EmptyState
          title="Journal vide"
          description="Chaque décision, création d’incident et activation de règle y laissera une trace."
        />
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[44rem]">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th scope="col" className="label px-4 py-3 font-medium w-52">Événement</th>
                    <th scope="col" className="label px-4 py-3 font-medium">Détail</th>
                    <th scope="col" className="label px-4 py-3 font-medium text-right w-52">Horodatage</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => {
                    const details = e.details as Record<string, unknown>;
                    const note = formatDetail(details.note);
                    const parts = describeDetails(details);

                    return (
                      <tr
                        key={e.id}
                        className="border-b border-[var(--border)] last:border-0 table-row-hover transition-colors align-top"
                      >
                        <td className="px-4 py-3.5">
                          <span
                            className={`badge mono ring-1 ring-inset ${EVENT_TONE[e.event] ?? DEFAULT_TONE}`}
                          >
                            {e.event}
                          </span>
                        </td>

                        <td className="px-4 py-3.5 min-w-0">
                          <div className="text-[0.85rem] leading-relaxed muted break-words">
                            {parts.length > 0 && (
                              <div className="mono text-[0.79rem] text-[var(--text-muted)]">
                                {parts.join(' · ')}
                              </div>
                            )}

                            {note && (
                              <div className="italic mt-1">« {note} »</div>
                            )}

                            {parts.length === 0 && !note && (
                              <div className="mono text-[0.79rem] faint">
                                {Object.keys(details).length > 0
                                  ? JSON.stringify(details).slice(0, 160)
                                  : '—'}
                              </div>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-3.5 text-right">
                          <time
                            dateTime={e.createdAt.toISOString()}
                            className="faint text-[0.77rem] mono whitespace-nowrap"
                          >
                            {e.createdAt.toLocaleString('fr-CA', {
                              day: '2-digit',
                              month: 'short',
                              year: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </time>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4">
            <Note>
              Écriture seule : aucune requête du projet ne modifie ni ne supprime ces lignes.
              Le journal est la preuve, pas un affichage.
            </Note>
          </div>
        </>
      )}
    </div>
  );
}
