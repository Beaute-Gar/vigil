import Link from 'next/link';
import type { Metadata } from 'next';
import { getDb } from '@/db';
import type { IncidentStatus } from '@/db/schema';
import { SeverityBadge, StatusBadge, ActionBadge } from '@/components/badges';
import { EmptyState, PageHeader } from '@/components/ui';
import { getOrCreateWorkspace, listIncidents } from '@/lib/repository';

export const metadata: Metadata = { title: 'Incidents' };
export const dynamic = 'force-dynamic';

const STATUSES: (IncidentStatus | 'all')[] = ['all', 'open', 'dismissed', 'confirmed'];
const SEVERITIES = ['all', 'critical', 'high', 'medium', 'low'] as const;

type Search = { status?: string; severity?: string };

function buildHref(base: string, next: Record<string, string>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) {
    if (v && v !== 'all') params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export default async function IncidentsPage({
  searchParams,
}: PageProps<'/dashboard/incidents'>) {
  const sp = (await searchParams) as Search;

  const status = STATUSES.includes(sp.status as IncidentStatus)
    ? (sp.status as IncidentStatus)
    : 'all';

  type SeverityFilter = (typeof SEVERITIES)[number];
  const severity: SeverityFilter = (SEVERITIES as readonly string[]).includes(sp.severity ?? '')
    ? (sp.severity as SeverityFilter)
    : 'all';

  const db = await getDb();
  const workspace = await getOrCreateWorkspace(db);

  const incidents = await listIncidents(db, workspace.id, {
    status: status === 'all' ? undefined : status,
    severity: severity === 'all' ? undefined : severity,
  });

  const active = (status !== 'all' ? 1 : 0) + (severity !== 'all' ? 1 : 0);

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Incidents"
        description="File de traitement. Un incident ne change d’état qu’une fois — une seconde décision est refusée par la machine à états."
        action={
          <Link href="/dashboard" className="btn btn-ghost btn-sm">
            Simuler un message
          </Link>
        }
      />

      {/* ── Filtres ─────────────────────────────────────────────── */}
      <section className="card p-4 mb-4" aria-label="Filtres">
        <div className="flex flex-wrap gap-6">
          <div>
            <div className="label mb-2">Statut</div>
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map((s) => {
                const isActive = status === s;
                const label =
                  s === 'all'
                    ? 'Tous'
                    : s === 'open'
                      ? 'Ouverts'
                      : s === 'dismissed'
                        ? 'Écartés'
                        : 'Confirmés';
                return (
                  <Link
                    key={s}
                    href={buildHref('/dashboard/incidents', {
                      status: s,
                      severity: severity ?? 'all',
                    })}
                    aria-current={isActive ? 'true' : undefined}
                    className={[
                      'btn btn-sm',
                      isActive ? 'btn-primary' : 'btn-ghost',
                    ].join(' ')}
                  >
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>

          <div>
            <div className="label mb-2">Sévérité</div>
            <div className="flex flex-wrap gap-1.5">
              {SEVERITIES.map((s) => {
                const isActive = severity === s || (s === 'all' && !severity);
                const label = s === 'all' ? 'Toutes' : s;
                return (
                  <Link
                    key={s}
                    href={buildHref('/dashboard/incidents', {
                      status: status ?? 'all',
                      severity: s,
                    })}
                    aria-current={isActive ? 'true' : undefined}
                    className={[
                      'btn btn-sm mono',
                      isActive ? 'btn-primary' : 'btn-ghost',
                    ].join(' ')}
                  >
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-4 pt-3.5 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-3">
          <span className="faint text-[0.8rem] mono">
            {incidents.length} incident{incidents.length > 1 ? 's' : ''}
            {active > 0 && ` · ${active} filtre${active > 1 ? 's' : ''} actif${active > 1 ? 's' : ''}`}
          </span>
          {active > 0 && (
            <Link href="/dashboard/incidents" className="text-[0.8rem] text-[var(--accent)] hover:underline">
              Réinitialiser les filtres
            </Link>
          )}
        </div>
      </section>

      {/* ── Liste ───────────────────────────────────────────────── */}
      {incidents.length === 0 ? (
        <EmptyState
          title={active > 0 ? 'Aucun résultat' : 'Aucun incident'}
          description={
            active > 0
              ? 'Aucun incident ne correspond à ces filtres. Élargissez la sélection.'
              : 'Soumettez un message au moteur pour créer votre premier incident.'
          }
          action={
            <Link href={active > 0 ? '/dashboard/incidents' : '/dashboard'} className="btn btn-ghost">
              {active > 0 ? 'Réinitialiser' : 'Aller au simulateur'}
            </Link>
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[46rem]">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th scope="col" className="label px-4 py-3 font-medium">Sévérité</th>
                  <th scope="col" className="label px-4 py-3 font-medium">Message</th>
                  <th scope="col" className="label px-4 py-3 font-medium">Action</th>
                  <th scope="col" className="label px-4 py-3 font-medium">Statut</th>
                  <th scope="col" className="label px-4 py-3 font-medium text-right">Date</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((i) => (
                  <tr key={i.id} className="border-b border-[var(--border)] last:border-0 table-row-hover transition-colors">
                    <td className="px-4 py-3.5 align-top">
                      <SeverityBadge severity={i.severity} />
                    </td>
                    <td className="px-4 py-3.5 align-top min-w-0">
                      <Link href={`/dashboard/incidents/${i.id}`} className="block group">
                        <span className="mono text-[0.83rem] text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">
                          {i.subject}
                          <span className="faint"> · {i.channel}</span>
                        </span>
                        <span className="block muted text-[0.83rem] mt-1 line-clamp-2 leading-snug">
                          {i.content}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3.5 align-top">
                      <ActionBadge action={i.actionTaken} />
                    </td>
                    <td className="px-4 py-3.5 align-top">
                      <StatusBadge status={i.status} />
                    </td>
                    <td className="px-4 py-3.5 align-top text-right">
                      <time
                        dateTime={i.createdAt.toISOString()}
                        className="faint text-[0.78rem] mono whitespace-nowrap"
                      >
                        {i.createdAt.toLocaleDateString('fr-CA', {
                          day: '2-digit',
                          month: 'short',
                          year: '2-digit',
                        })}
                      </time>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
