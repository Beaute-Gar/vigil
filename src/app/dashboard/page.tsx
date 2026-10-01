import Link from 'next/link';
import type { Metadata } from 'next';
import { getDb } from '@/db';
import { SeverityBadge, StatusBadge } from '@/components/badges';
import { Simulator } from '@/components/simulator';
import { EmptyState, KpiCard, Meter, Note, PageHeader } from '@/components/ui';
import {
  countByStatus,
  countPendingAppeals,
  dailyVolume,
  getOrCreateWorkspace,
  listIncidents,
  severityBreakdown,
} from '@/lib/repository';

export const metadata: Metadata = { title: 'Vue d’ensemble' };
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const db = await getDb();
  const workspace = await getOrCreateWorkspace(db);

  const [byStatus, appeals, bySeverity, volume, recent] = await Promise.all([
    countByStatus(db, workspace.id),
    countPendingAppeals(db),
    severityBreakdown(db, workspace.id),
    dailyVolume(db, workspace.id),
    listIncidents(db, workspace.id),
  ]);

  const count = (status: string) => byStatus.find((r) => r.status === status)?.n ?? 0;

  const open = count('open');
  const dismissed = count('dismissed');
  const confirmed = count('confirmed');
  const decided = dismissed + confirmed;
  const dismissalRate = decided === 0 ? 0 : Math.round((dismissed / decided) * 100);

  const severityTotal = bySeverity.reduce((sum, r) => sum + r.n, 0);
  const severityMax = Math.max(1, ...bySeverity.map((r) => r.n));

  const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'] as const;
  const severityRows = SEVERITY_ORDER.map((s) => ({
    severity: s,
    n: bySeverity.find((r) => r.severity === s)?.n ?? 0,
  }));

  // Volume 7 derniers jours — on ne montre que les jours ayant des données
  const volumeMax = Math.max(1, ...volume.map((v) => v.n));

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Vue d’ensemble"
        description={`Espace « ${workspace.name} » — état courant de la modération, mesuré sur la base réelle.`}
        action={
          <Link href="/dashboard/incidents" className="btn btn-ghost btn-sm">
            File des incidents
          </Link>
        }
      />

      {/* ── Indicateurs ─────────────────────────────────────────── */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Indicateurs">
        <KpiCard
          label="Incidents ouverts"
          value={open}
          tone="accent"
          hint="En attente d’une décision"
        />
        <KpiCard label="Écartés" value={dismissed} hint="Considérés comme faux positifs" />
        <KpiCard label="Confirmés" value={confirmed} tone="warn" hint="Sanction maintenue" />
        <KpiCard
          label="Appels en attente"
          value={appeals}
          tone={appeals > 0 ? 'danger' : 'neutral'}
          hint={appeals > 0 ? 'À trancher' : 'File vide'}
        />
      </section>

      {/* ── Répartition + volume ────────────────────────────────── */}
      <section className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="card card-pad">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[1.02rem]">Derniers incidents</h2>
            <Link
              href="/dashboard/incidents"
              className="text-[0.8rem] text-[var(--accent)] hover:underline"
            >
              Tout voir →
            </Link>
          </div>

          {recent.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="Aucun incident"
                description="Soumettez un message au moteur ci-dessous pour remplir la file."
              />
            </div>
          ) : (
            <ul className="mt-3 -mx-2 divide-y divide-[var(--border)]">
              {recent.slice(0, 6).map((i) => (
                <li key={i.id}>
                  <Link
                    href={`/dashboard/incidents/${i.id}`}
                    className="table-row-hover flex flex-wrap items-center gap-2.5 px-2 py-3 transition-colors"
                  >
                    <SeverityBadge severity={i.severity} />
                    <StatusBadge status={i.status} />
                    <span className="mono text-[0.82rem] text-[var(--text-muted)] truncate min-w-0 flex-1">
                      {i.subject}
                      <span className="faint"> · {i.channel}</span>
                    </span>
                    <time
                      dateTime={i.createdAt.toISOString()}
                      className="faint text-[0.75rem] mono flex-none"
                    >
                      {i.createdAt.toLocaleDateString('fr-CA', {
                        day: '2-digit',
                        month: 'short',
                      })}
                    </time>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-4">
          <div className="card card-pad">
            <h2 className="text-[1.02rem]">Répartition par sévérité</h2>
            <p className="faint text-[0.78rem] mt-1">
              {severityTotal} incident{severityTotal > 1 ? 's' : ''} au total
            </p>
            <ul className="mt-4 space-y-3.5">
              {severityRows.map((row) => (
                <li key={row.severity}>
                  <div className="flex items-center justify-between gap-3 mb-1.5">
                    <SeverityBadge severity={row.severity} />
                    <span className="mono text-[0.82rem] text-[var(--text-muted)]">{row.n}</span>
                  </div>
                  <Meter
                    value={(row.n / severityMax) * 100}
                    label={`Sévérité ${row.severity} : ${row.n}`}
                  />
                </li>
              ))}
            </ul>
          </div>

          <div className="card card-pad">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[1.02rem]">Taux d’écartement</h2>
              <span className="mono text-[1.35rem] font-semibold text-[var(--accent)]">
                {dismissalRate}%
              </span>
            </div>
            <p className="faint text-[0.79rem] mt-2 leading-relaxed">
              Part des incidents tranchés considérés comme faux positifs. Au-delà de 50 %, une
              règle mérite d’être révisée.
            </p>
            <div className="mt-3.5">
              <Meter value={dismissalRate} label={`Taux d’écartement : ${dismissalRate}%`} />
            </div>
            <p className="faint text-[0.76rem] mono mt-2.5">
              {dismissed} écartés / {decided} tranchés
            </p>
          </div>
        </div>
      </section>

      {/* ── Volume ─────────────────────────────────────────────── */}
      {volume.length > 0 && (
        <section className="card card-pad mt-4">
          <h2 className="text-[1.02rem]">Volume quotidien</h2>
          <p className="faint text-[0.78rem] mt-1">Incidents créés, par jour</p>
          <div className="mt-5 flex items-end gap-2 h-28">
            {volume.slice(-14).map((v) => (
              <div key={v.day} className="flex-1 flex flex-col items-center gap-2 min-w-0">
                <span className="mono text-[0.7rem] text-[var(--text-muted)]">{v.n}</span>
                <div
                  className="w-full rounded-t-[3px] bg-[var(--accent)]/70 hover:bg-[var(--accent)] transition-colors"
                  style={{ height: `${Math.max(6, (v.n / volumeMax) * 100)}%` }}
                  title={`${v.day} : ${v.n}`}
                />
                <span className="mono text-[0.66rem] faint truncate w-full text-center">
                  {v.day.slice(5)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Simulateur ─────────────────────────────────────────── */}
      <section className="mt-6">
        <Simulator />
      </section>

      <div className="mt-4">
        <Note>
          Le verdict s’appuie sur <strong className="text-[var(--text)]">toutes</strong> les
          règles correspondantes, et l’action retenue est celle de la règle la plus sévère —
          jamais la première rencontrée.
        </Note>
      </div>
    </div>
  );
}
