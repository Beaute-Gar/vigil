import type { Metadata } from 'next';
import { getDb } from '@/db';
import { ActionBadge, SeverityBadge } from '@/components/badges';
import { RuleFormButton } from '@/components/rule-form';
import { RuleToggle } from '@/components/rule-toggle';
import { EmptyState, Note, PageHeader } from '@/components/ui';
import { getOrCreateWorkspace, listRules } from '@/lib/repository';

export const metadata: Metadata = { title: 'Règles' };
export const dynamic = 'force-dynamic';

export default async function RulesPage() {
  const db = await getDb();
  const workspace = await getOrCreateWorkspace(db);
  const rules = await listRules(db, workspace.id);

  const activeCount = rules.filter((r) => r.enabled).length;

  return (
    <div className="max-w-[1400px]">
      <PageHeader
        eyebrow="MOTEUR"
        title="Règles de modération"
        description={`Ordre d’évaluation explicite : ${rules.length} règle${rules.length > 1 ? 's' : ''}, ${activeCount} active${activeCount > 1 ? 's' : ''}. La priorité décide de l’ordre, la sévérité décide de l’action.`}
        action={<RuleFormButton mode="create" label="Nouvelle règle" className="btn btn-primary btn-sm" />}
      />

      {/* ── Rappel du contrat ───────────────────────────────────── */}
      <section className="grid gap-4 sm:grid-cols-2 mb-5">
        <div className="card card-pad">
          <div className="label mono">PRIORITÉ CROISSANTE</div>
          <p className="muted text-[0.875rem] leading-relaxed mt-2.5">
            Le numéro le plus bas est consulté en premier. Réordonner deux règles change
            exactement ce qui doit changer — et rien d’autre.
          </p>
        </div>
        <div className="card card-pad">
          <div className="label mono">SÉVÉRITÉ MAXIMALE</div>
          <p className="muted text-[0.875rem] leading-relaxed mt-2.5">
            Toutes les règles sont évaluées. L’action retenue est celle de la règle la plus
            grave, jamais la première rencontrée : une règle « spam » ne masque pas une
            menace.
          </p>
        </div>
      </section>

      {rules.length === 0 ? (
        <EmptyState
          title="Aucune règle"
          description="L'espace de travail ne contient encore aucune règle : rien ne sera signalé."
          action={<RuleFormButton mode="create" label="Créer la première règle" />}
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[58rem]">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th scope="col" className="label px-4 py-3 font-medium w-20">Priorité</th>
                  <th scope="col" className="label px-4 py-3 font-medium">Règle</th>
                  <th scope="col" className="label px-4 py-3 font-medium">Expression</th>
                  <th scope="col" className="label px-4 py-3 font-medium">Sévérité</th>
                  <th scope="col" className="label px-4 py-3 font-medium">Action</th>
                  <th scope="col" className="label px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr
                    key={r.id}
                    className={[
                      'border-b border-[var(--border)] last:border-0 table-row-hover transition-colors align-top',
                      r.enabled ? '' : 'opacity-55',
                    ].join(' ')}
                  >
                    <td className="px-4 py-4">
                      <span className="mono text-[1.05rem] text-[var(--accent)] font-semibold">
                        {String(r.priority).padStart(2, '0')}
                      </span>
                    </td>
                    <td className="px-4 py-4 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[0.94rem] font-medium">{r.name}</span>
                        {!r.enabled && (
                          <span className="badge ring-1 ring-inset bg-zinc-500/15 text-zinc-300 ring-zinc-500/30">
                            désactivée
                          </span>
                        )}
                      </div>
                      <p className="muted text-[0.83rem] leading-snug mt-1.5 max-w-md">
                        {r.description}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <code className="mono text-[0.78rem] text-[var(--accent)]/85 break-all leading-relaxed">
                        /{r.pattern}/gi
                      </code>
                    </td>
                    <td className="px-4 py-4">
                      <SeverityBadge severity={r.severity} />
                    </td>
                    <td className="px-4 py-4">
                      <ActionBadge action={r.action} />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-end gap-3">
                        <RuleFormButton mode="edit" rule={r} label="Modifier" />
                        <RuleToggle ruleId={r.id} enabled={r.enabled} name={r.name} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {rules.length > 0 && (
        <div className="mt-4">
          <Note>
            Une expression invalide ne fait jamais échouer la chaîne : elle est isolée et
            remontée dans le verdict. Une règle cassée doit se voir, pas arrêter la
            modération.
          </Note>
        </div>
      )}
    </div>
  );
}
