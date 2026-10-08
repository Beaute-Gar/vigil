/**
 * Cycle de vie d'un incident et d'un appel — logique pure.
 *
 * Aucune dépendance à Drizzle ni à Next : tout ce fichier est testable
 * en unitaire, sans base de données. Les effets de bord (écriture base,
 * journal d'audit) vivent dans `repository.ts`.
 */

import type {
  AppealStatus,
  IncidentStatus,
  Severity,
} from '@/db/schema';
import { SEVERITIES } from '@/db/schema';

/* ── Machines à états ─────────────────────────────────────────────── */

/**
 * Un incident ouvert peut être tranché ; une fois tranché, il est figé.
 * Réouvrir passe par un appel, pas par un UPDATE silencieux — c'est ce
 * qui rend l'historique défendable.
 */
export const INCIDENT_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  open: ['dismissed', 'confirmed'],
  dismissed: [],
  confirmed: [],
};

export const APPEAL_TRANSITIONS: Record<AppealStatus, AppealStatus[]> = {
  pending: ['granted', 'denied'],
  granted: [],
  denied: [],
};

export type TransitionResult<T> =
  | { ok: true; from: T; to: T }
  | { ok: false; reason: TransitionReason; from: T; to: T };

/** Raison d'un refus de transition — type nommé, référençable par l'API. */
export type TransitionReason = 'illegal_transition' | 'already_final';

export function canTransition<T extends string>(
  map: Record<T, T[]>,
  from: T,
  to: T,
): boolean {
  return (map[from] ?? []).includes(to);
}

/**
 * Applique une transition en validant l'état de départ.
 * Erreur explicite plutôt qu'un `UPDATE` silencieux qui écraserait l'historique.
 */
export function transition<T extends string>(
  map: Record<T, T[]>,
  from: T,
  to: T,
): TransitionResult<T> {
  if (from === to) return { ok: false, reason: 'already_final', from, to };
  if (!canTransition(map, from, to)) {
    const reason = (map[from] ?? []).length === 0 ? 'already_final' : 'illegal_transition';
    return { ok: false, reason, from, to };
  }
  return { ok: true, from, to };
}

export const resolveIncidentState = (
  from: IncidentStatus,
  to: IncidentStatus,
): TransitionResult<IncidentStatus> => transition(INCIDENT_TRANSITIONS, from, to);

export const decideAppealState = (
  from: AppealStatus,
  to: AppealStatus,
): TransitionResult<AppealStatus> => transition(APPEAL_TRANSITIONS, from, to);

/* ── Libellés (source unique pour l'UI et l'API) ──────────────────── */

export const SEVERITY_LABELS: Record<Severity, string> = {
  low: 'Faible',
  medium: 'Moyenne',
  high: 'Élevée',
  critical: 'Critique',
};

export const STATUS_LABELS: Record<IncidentStatus, string> = {
  open: 'Ouvert',
  dismissed: 'Écarté',
  confirmed: 'Confirmé',
};

export const APPEAL_LABELS: Record<AppealStatus, string> = {
  pending: 'En attente',
  granted: 'Accueilli',
  denied: 'Rejeté',
};

export const ACTION_LABELS: Record<string, string> = {
  flag: 'Signaler',
  warn: 'Avertir',
  mute: 'Muter',
  remove: 'Retirer',
  escalate: 'Escalader',
};

/** Classe Tailwind par sévérité — un seul endroit à changer. */
export const SEVERITY_CLASSES: Record<Severity, string> = {
  low: 'bg-slate-500/15 text-slate-300 ring-slate-500/30',
  medium: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  high: 'bg-orange-500/15 text-orange-300 ring-orange-500/30',
  critical: 'bg-red-500/15 text-red-400 ring-red-500/40',
};

export const STATUS_CLASSES: Record<IncidentStatus, string> = {
  open: 'bg-cyan-500/15 text-cyan-300 ring-cyan-500/30',
  dismissed: 'bg-zinc-500/15 text-zinc-300 ring-zinc-500/30',
  confirmed: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
};

/* ── Indicateurs ──────────────────────────────────────────────────── */

export type Kpis = {
  open: number;
  dismissed: number;
  confirmed: number;
  pendingAppeals: number;
  bySeverity: Record<Severity, number>;
  /** Taux d'incident jugé « faux positif » — métrique de qualité des règles */
  dismissalRate: number;
};

type IncidentLite = { status: IncidentStatus; severity: Severity };
type AppealLite = { status: AppealStatus };

export function computeKpis(incidents: IncidentLite[], appeals: AppealLite[]): Kpis {
  const bySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<
    Severity,
    number
  >;

  let open = 0;
  let dismissed = 0;
  let confirmed = 0;

  for (const i of incidents) {
    bySeverity[i.severity] += 1;
    if (i.status === 'open') open += 1;
    else if (i.status === 'dismissed') dismissed += 1;
    else if (i.status === 'confirmed') confirmed += 1;
  }

  const pendingAppeals = appeals.filter((a) => a.status === 'pending').length;
  const decided = dismissed + confirmed;

  return {
    open,
    dismissed,
    confirmed,
    pendingAppeals,
    bySeverity,
    // 0 quand rien n'est tranché : on n'affiche pas « 0 % » pour un vide.
    dismissalRate: decided === 0 ? 0 : Math.round((dismissed / decided) * 100),
  };
}
