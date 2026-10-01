import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDb } from '@/db';
import { ActionBadge, SeverityBadge, StatusBadge, AppealBadge } from '@/components/badges';
import { DecisionPanel } from '@/components/decision-panel';
import { AppealCreateForm, AppealDecision } from '@/components/appeals';
import { Note } from '@/components/ui';
import {
  getActorName,
  getAppealForIncident,
  getIncident,
  getRule,
  listAuditForIncident,
} from '@/lib/repository';

export const metadata: Metadata = { title: 'Incident' };
export const dynamic = 'force-dynamic';

const EVENT_LABELS: Record<string, string> = {
  'incident.created': 'Incident créé',
  'incident.dismissed': 'Décision : écarté',
  'incident.confirmed': 'Décision : confirmé',
  'appeal.granted': 'Appel accueilli',
  'appeal.denied': 'Appel rejeté',
};

export default async function IncidentDetailPage({
  params,
}: PageProps<'/dashboard/incidents/[id]'>) {
  const { id } = await params;

  const db = await getDb();
  const incident = await getIncident(db, id);
  if (!incident) notFound();

  const [rule, audit, appeal, resolvedBy] = await Promise.all([
    incident.ruleId ? getRule(db, incident.ruleId) : undefined,
    listAuditForIncident(db, incident.id),
    getAppealForIncident(db, incident.id),
    getActorName(db, incident.resolvedById),
  ]);

  return (
    <div className="max-w-6xl">
      <Link
        href="/dashboard/incidents"
        className="inline-flex items-center gap-1.5 muted text-[0.83rem] hover:text-[var(--accent)] transition-colors mb-5"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M19 12H5M11 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Retour aux incidents
      </Link>

      {/* ── En-tête ─────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-[var(--border)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <SeverityBadge severity={incident.severity} />
            <StatusBadge status={incident.status} />
            <ActionBadge action={incident.actionTaken} />
          </div>
          <h1 className="text-[1.35rem] leading-tight mt-3.5 break-words">
            <span className="mono">{incident.subject}</span>
            <span className="faint font-normal"> dans </span>
            <span className="mono text-[var(--accent)]">{incident.channel}</span>
          </h1>
          <time
            dateTime={incident.createdAt.toISOString()}
            className="faint text-[0.8rem] mono block mt-2"
          >
            {incident.createdAt.toLocaleString('fr-CA', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
            {' · '}réf. {incident.id.slice(0, 8)}
          </time>
        </div>
      </header>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
        {/* ── Colonne principale ───────────────────────────────── */}
        <div className="space-y-4">
          <section className="card card-pad">
            <div className="label">Message signalé</div>
            <blockquote className="mt-3 pl-4 border-l-2 border-[var(--accent)]/50">
              <p className="mono text-[0.9rem] leading-relaxed whitespace-pre-wrap break-words">
                {incident.content}
              </p>
            </blockquote>
          </section>

          <section className="card card-pad">
            <div className="label">Règle décisionnaire</div>
            {rule ? (
              <div className="mt-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-[1.02rem]">{rule.name}</h2>
                  <span className="badge mono ring-1 ring-inset bg-white/[0.03] text-[var(--text-muted)] ring-[var(--border-strong)]">
                    priorité {rule.priority}
                  </span>
                  {!rule.enabled && (
                    <span className="badge ring-1 ring-inset bg-zinc-500/15 text-zinc-300 ring-zinc-500/30">
                      désactivée
                    </span>
                  )}
                </div>
                <p className="muted text-[0.875rem] leading-relaxed mt-2.5">{rule.description}</p>

                <dl className="mt-4 grid gap-x-5 gap-y-2 text-[0.84rem] sm:grid-cols-[auto_1fr] pt-4 border-t border-[var(--border)]">
                  <dt className="faint mono">expression</dt>
                  <dd className="mono text-[var(--accent)] break-all">/{rule.pattern}/gi</dd>
                  <dt className="faint mono">action</dt>
                  <dd>
                    <ActionBadge action={rule.action} />
                  </dd>
                </dl>
              </div>
            ) : (
              <p className="muted text-[0.875rem] mt-3">
                Aucune règle rattachée — incident établi hors du moteur.
              </p>
            )}
          </section>

          {/* ── Appel ───────────────────────────────────────────── */}
          <section aria-labelledby="appeal-heading">
            <h2 id="appeal-heading" className="text-[1.05rem] mb-3">
              Appel
            </h2>

            {appeal ? (
              <div className="card card-pad">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="label">Déposé par</div>
                    <p className="mono text-[0.9rem] mt-1">{appeal.author}</p>
                  </div>
                  <AppealBadge status={appeal.status} />
                </div>

                <blockquote className="mt-3.5 pt-3.5 border-t border-[var(--border)]">
                  <p className="text-[0.885rem] leading-relaxed muted italic">
                    « {appeal.reason} »
                  </p>
                </blockquote>

                <AppealDecision appealId={appeal.id} status={appeal.status} />
              </div>
            ) : incident.status === 'dismissed' ? (
              <AppealCreateForm incidentId={incident.id} />
            ) : (
              <div className="card card-pad">
                <p className="muted text-[0.86rem] leading-relaxed">
                  {incident.status === 'open'
                    ? 'Tranchez l’incident avant de pouvoir le contester.'
                    : 'Un incident confirmé n’ouvre pas de voie d’appel : la sanction tient.'}
                </p>
              </div>
            )}
          </section>
        </div>

        {/* ── Colonne latérale ─────────────────────────────────── */}
        <div className="space-y-4">
          <DecisionPanel
            incidentId={incident.id}
            status={incident.status}
            resolvedAt={incident.resolvedAt?.toISOString() ?? null}
            resolvedByName={resolvedBy}
          />

          <section className="card card-pad" aria-labelledby="audit-heading">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="audit-heading" className="text-[1.02rem]">
                Journal
              </h2>
              <span className="faint text-[0.75rem] mono">{audit.length} ligne(s)</span>
            </div>

            <ol className="mt-4 space-y-0">
              {audit.map((entry, idx) => {
                const actorName =
                  (entry.details as { actorName?: string }).actorName ?? null;
                return (
                  <li
                    key={entry.id}
                    className="relative pl-6 pb-5 last:pb-0"
                  >
                    {idx < audit.length - 1 && (
                      <span
                        aria-hidden="true"
                        className="absolute left-[4.5px] top-3 bottom-0 w-px bg-[var(--border-strong)]"
                      />
                    )}
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-1.5 h-[9px] w-[9px] rounded-full bg-[var(--accent)] ring-4 ring-[var(--bg-elevated)]"
                    />
                    <div className="text-[0.87rem] leading-snug">
                      {EVENT_LABELS[entry.event] ?? entry.event}
                    </div>
                    <div className="faint text-[0.74rem] mono mt-1">
                      {entry.createdAt.toLocaleString('fr-CA', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                      {actorName && <> · {actorName}</>}
                    </div>
                    {(entry.details as { note?: string }).note && (
                      <div className="muted text-[0.8rem] mt-1.5 leading-snug italic">
                        « {(entry.details as { note: string }).note} »
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>

          <Note>
            Ces lignes ne sont ni modifiables ni supprimables : aucune requête du projet ne
            met à jour <span className="mono text-[var(--accent)]">audit_log</span>.
          </Note>
        </div>
      </div>
    </div>
  );
}
