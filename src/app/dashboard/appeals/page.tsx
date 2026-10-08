import Link from 'next/link';
import type { Metadata } from 'next';
import { getDb } from '@/db';
import { AppealBadge, SeverityBadge, StatusBadge } from '@/components/badges';
import { AppealDecision } from '@/components/appeals';
import { EmptyState, Note, PageHeader } from '@/components/ui';
import { getOrCreateWorkspace, listAppeals } from '@/lib/repository';

export const metadata: Metadata = { title: 'Appels' };
export const dynamic = 'force-dynamic';

export default async function AppealsPage() {
  const db = await getDb();
  const workspace = await getOrCreateWorkspace(db);
  const appeals = await listAppeals(db, workspace.id);

  const pending = appeals.filter((a) => a.status === 'pending').length;

  return (
    <div className="max-w-[1400px]">
      <PageHeader
        eyebrow="SECOND EXAMEN"
        title="File d’appels"
        description={
          appeals.length === 0
            ? 'Un appel s’ouvre depuis un incident écarté, avec motivation obligatoire.'
            : `${appeals.length} appel${appeals.length > 1 ? 's' : ''} · ${pending} en attente d’un second examen.`
        }
      />

      <div className="mb-5">
        <Note>
          Le jugement d’un appel est journalisé, motivé et définitif : un appel déjà jugé ne
          se retraite pas.
        </Note>
      </div>

      {appeals.length === 0 ? (
        <EmptyState
          title="Aucun appel"
          description="Rien à réexaminer. Ouvrez un appel depuis un incident écarté pour voir le cycle complet."
          action={
            <Link href="/dashboard/incidents?status=dismissed" className="btn btn-ghost">
              Voir les incidents écartés
            </Link>
          }
        />
      ) : (
        <ul className="space-y-4">
          {appeals.map((a) => (
            <li key={a.id} className="card card-pad">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <SeverityBadge severity={a.incident.severity} />
                    <StatusBadge status={a.incident.status} />
                    <AppealBadge status={a.status} />
                  </div>

                  <div className="mt-3 text-[0.9rem]">
                    <span className="muted">Incident </span>
                    <Link
                      href={`/dashboard/incidents/${a.incident.id}`}
                      className="mono text-[var(--accent)] hover:underline break-all"
                    >
                      {a.incident.subject}
                      <span className="faint"> · {a.incident.channel}</span>
                    </Link>
                  </div>

                  <div className="faint text-[0.77rem] mono mt-1.5">
                    déposé par {a.author}
                    {' · '}
                    {a.createdAt.toLocaleString('fr-CA', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-[var(--border)]">
                <div className="label">Motivation de l’appel</div>
                <p className="muted text-[0.885rem] leading-relaxed mt-2 italic">
                  « {a.reason} »
                </p>

                {a.decisionNote && (
                  <div className="mt-3.5 pt-3.5 border-t border-[var(--border)]">
                    <div className="label">Jugement</div>
                    <p className="muted text-[0.885rem] leading-relaxed mt-2">
                      « {a.decisionNote} »
                    </p>
                  </div>
                )}

                <AppealDecision appealId={a.id} status={a.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
