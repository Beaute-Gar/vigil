'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ACTIONS,
  SEVERITIES,
  type Action,
  type Rule,
  type Severity,
} from '@/db/schema';
import { ACTION_LABELS, SEVERITY_LABELS } from '@/lib/moderation';
import { actionMeetsFloor, evaluateRules, SEVERITY_FLOOR } from '@/lib/rules';

type ApiErrors = Record<string, string>;

/** Valeurs d'un brouillon non encore enregistré. */
type Draft = {
  name: string;
  description: string;
  pattern: string;
  severity: Severity;
  action: Action;
  /** Nombre saisi en chaîne : un champ vide ne doit pas devenir `null` */
  priority: string;
  enabled: boolean;
};

const EMPTY: Draft = {
  name: '',
  description: '',
  pattern: '',
  severity: 'low',
  action: 'flag',
  priority: '10',
  enabled: true,
};

/**
 * Formulaire de règle — création et édition, même composant.
 *
 * Trois retours immédiats pendant la frappe, pas après l'envoi :
 *
 *  1. l'expression est-elle compilable ;
 *  2. l'action est-elle au niveau exigé par la sévérité ;
 *  3. **l'aperçu exécute `evaluateRules`** — la fonction exacte que
 *     l'API appellera. La promesse faite à l'auteur est donc littérale :
 *     ce que vous voyez ici, c'est ce que le moteur décidera.
 *
 * Le serveur revalide tout de toute façon : ce formulaire ne fait que
 * rendre l'erreur visible avant un aller-retour inutile.
 */
export function RuleFormButton({
  mode,
  rule,
  label,
  className = 'btn btn-ghost btn-sm',
}: {
  mode: 'create' | 'edit';
  rule?: Rule;
  label: string;
  className?: string;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const uid = useId();

  const [draft, setDraft] = useState<Draft>(
    rule
      ? {
          name: rule.name,
          description: rule.description,
          pattern: rule.pattern,
          severity: rule.severity,
          action: rule.action,
          priority: String(rule.priority),
          enabled: rule.enabled,
        }
      : EMPTY,
  );
  const [sample, setSample] = useState('');
  const [errors, setErrors] = useState<ApiErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => (e[key as string] ? { ...e, [key as string]: '' } : e));
  }

  function open() {
    setErrors({});
    setFormError(null);
    dialogRef.current?.showModal();
  }

  /* ── Aperçu : le moteur, pas une copie ──────────────────────────── */

  const patternProblem =
    draft.pattern.trim() === ''
      ? null
      : evaluateRules('x', [
          {
            id: 'preview',
            name: draft.name || 'aperçu',
            pattern: draft.pattern,
            severity: draft.severity,
            action: draft.action,
            priority: 1,
            enabled: true, // l'aperçu prévisualise l'expression, pas l'état
          },
        ]).invalidRules.length > 0;

  const floorProblem = !actionMeetsFloor(draft.severity, draft.action);

  const preview =
    sample.trim() === ''
      ? null
      : evaluateRules(sample, [
          {
            id: 'preview',
            name: draft.name || 'aperçu',
            pattern: draft.pattern,
            severity: draft.severity,
            action: draft.action,
            priority: 1,
            enabled: true,
          },
        ]);

  /* ── Envoi ──────────────────────────────────────────────────────── */

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setErrors({});
    setFormError(null);

    try {
      const res = await fetch(mode === 'create' ? '/api/rules' : `/api/rules/${rule?.id}`, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.name,
          description: draft.description,
          pattern: draft.pattern,
          severity: draft.severity,
          action: draft.action,
          priority: Number(draft.priority),
          enabled: draft.enabled,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        errors?: ApiErrors & { form?: string };
      };

      if (!res.ok) {
        const fieldErrors: ApiErrors = {};
        let summary: string | null = null;
        for (const [key, message] of Object.entries(data.errors ?? {})) {
          if (key === 'form') summary = message;
          else fieldErrors[key] = message;
        }
        setErrors(fieldErrors);
        setFormError(summary ?? (res.status === 401 ? 'Session expirée : reconnectez-vous.' : null));
        return;
      }

      dialogRef.current?.close();
      if (mode === 'create') setDraft(EMPTY);
      router.refresh();
    } catch {
      setFormError('Impossible de joindre le serveur.');
    } finally {
      setPending(false);
    }
  }

  const id = (field: string) => `${uid}-${field}`;

  return (
    <>
      <button type="button" className={className} onClick={open}>
        {label}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={id('title')}
        className="rule-dialog"
        onClick={(e) => {
          // Clic sur le fond : ferme, comme Échap — le panneau lui-même
          // ne se ferme jamais par accident.
          if (e.target === dialogRef.current) dialogRef.current.close();
        }}
      >
        <form onSubmit={onSubmit} noValidate className="rule-dialog-body">
          <header className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h2 id={id('title')} className="text-[1.05rem]">
                {mode === 'create' ? 'Nouvelle règle' : `Modifier « ${rule?.name} »`}
              </h2>
              <p className="muted text-[0.83rem] mt-1.5 leading-relaxed">
                La sévérité fixe un plancher à l’action — une règle critique ne peut pas se
                contenter de signaler.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm flex-none"
              onClick={() => dialogRef.current?.close()}
            >
              Fermer
            </button>
          </header>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="field sm:col-span-2">
              <label className="label" htmlFor={id('name')}>
                Nom
              </label>
              <input
                id={id('name')}
                className="input"
                value={draft.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Spam commercial"
                maxLength={60}
                required
              />
              {errors.name && <p className="form-error">{errors.name}</p>}
            </div>

            <div className="field sm:col-span-2">
              <label className="label" htmlFor={id('description')}>
                Description
              </label>
              <textarea
                id={id('description')}
                className="input"
                value={draft.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="Ce que la règle détecte, et pourquoi elle existe."
                maxLength={200}
                required
                style={{ minHeight: '4rem' }}
              />
              {errors.description && <p className="form-error">{errors.description}</p>}
            </div>

            <div className="field sm:col-span-2">
              <label className="label" htmlFor={id('pattern')}>
                Expression régulière
              </label>
              <input
                id={id('pattern')}
                className="input mono"
                value={draft.pattern}
                onChange={(e) => set('pattern', e.target.value)}
                placeholder="\\b(achetez|gagnez|promo)\\b"
                spellCheck={false}
                required
              />
              {patternProblem === null ? (
                <p className="faint text-[0.76rem] leading-snug">
                  Sans les barres obliques : le moteur ajoute les drapeaux{" "}
                  <code className="mono">gi</code> (insensible à la casse, toutes les occurrences).
                </p>
              ) : patternProblem ? (
                <p className="form-error">Expression invalide : elle ne compile pas.</p>
              ) : (
                <p className="text-[0.76rem] text-ok leading-snug">
                  Expression valide.
                </p>
              )}
              {errors.pattern && <p className="form-error">{errors.pattern}</p>}
            </div>

            <div className="field">
              <label className="label" htmlFor={id('severity')}>
                Sévérité
              </label>
              <select
                id={id('severity')}
                className="input"
                value={draft.severity}
                onChange={(e) => set('severity', e.target.value as Draft['severity'])}
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {SEVERITY_LABELS[s]}
                  </option>
                ))}
              </select>
              <p className="faint text-[0.76rem] leading-snug">
                Planche : action ≥ {SEVERITY_FLOOR[draft.severity]}.
              </p>
            </div>

            <div className="field">
              <label className="label" htmlFor={id('action')}>
                Action
              </label>
              <select
                id={id('action')}
                className="input"
                value={draft.action}
                onChange={(e) => set('action', e.target.value as Draft['action'])}
              >
                {ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {ACTION_LABELS[a]}
                  </option>
                ))}
              </select>
              {floorProblem && (
                <p className="form-error">
                  Trop faible : exige au moins « {ACTION_LABELS[SEVERITY_FLOOR[draft.severity]]} ».
                </p>
              )}
              {errors.action && <p className="form-error">{errors.action}</p>}
            </div>

            <div className="field">
              <label className="label" htmlFor={id('priority')}>
                Priorité
              </label>
              <input
                id={id('priority')}
                className="input mono"
                type="number"
                min={1}
                max={999}
                value={draft.priority}
                onChange={(e) => set('priority', e.target.value)}
                required
              />
              <p className="faint text-[0.76rem] leading-snug">
                Le plus bas est consulté en premier.
              </p>
              {errors.priority && <p className="form-error">{errors.priority}</p>}
            </div>

            <div className="field">
              <label className="label flex items-center gap-2.5 cursor-pointer" htmlFor={id('enabled')}>
                <input
                  id={id('enabled')}
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(e) => set('enabled', e.target.checked)}
                  className="accent-[var(--accent)] w-4 h-4"
                />
                Règle active
              </label>
              <p className="faint text-[0.76rem] leading-snug">
                Une règle inactive n’est jamais évaluée.
              </p>
              {errors.enabled && <p className="form-error">{errors.enabled}</p>}
            </div>

            {/* ── Aperçu vivant ─────────────────────────────────────── */}
            <div className="field sm:col-span-2">
              <label className="label" htmlFor={id('sample')}>
                Tester sur un message
              </label>
              <input
                id={id('sample')}
                className="input"
                value={sample}
                onChange={(e) => setSample(e.target.value)}
                placeholder="Achetez vite, gagnez 5000€ !"
              />
              {preview && (
                <p
                  className={[
                    'text-[0.79rem] leading-snug mt-1',
                    preview.invalidRules.length > 0
                      ? 'text-danger'
                      : preview.matches.length > 0
                        ? 'text-ok'
                        : 'faint',
                  ].join(' ')}
                >
                  {preview.invalidRules.length > 0
                    ? 'Expression cassée : le moteur l’isolerait dans `invalidRules`.'
                    : preview.matches.length > 0
                      ? `Correspond — le moteur déciderait ${ACTION_LABELS[preview.action ?? 'flag']} (sévérité ${
                          SEVERITY_LABELS[preview.severity ?? 'low']
                        }).`
                      : 'Aucune correspondance : ce message passerait inaperçu.'}
                </p>
              )}
            </div>
          </div>

          {formError && (
            <p className="form-error mt-4" role="alert">
              {formError}
            </p>
          )}

          <footer className="flex justify-end gap-2.5 mt-6 pt-4 border-t border-[var(--border)]">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => dialogRef.current?.close()}
            >
              Annuler
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending || floorProblem}>
              {pending ? 'Enregistrement…' : mode === 'create' ? 'Créer la règle' : 'Enregistrer'}
            </button>
          </footer>
        </form>
      </dialog>
    </>
  );
}
