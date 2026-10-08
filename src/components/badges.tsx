import type { Action, AppealStatus, IncidentStatus, Severity } from '@/db/schema';
import {
  ACTION_LABELS,
  APPEAL_LABELS,
  SEVERITY_CLASSES,
  SEVERITY_LABELS,
  STATUS_CLASSES,
  STATUS_LABELS,
} from '@/lib/moderation';

/**
 * Badges — une seule source de libellés et de couleurs.
 * Les classes sont écrites littéralement ici (et dans `moderation.ts`)
 * pour que Tailwind les détecte à l'analyse statique.
 */

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`badge ring-1 ring-inset ${SEVERITY_CLASSES[severity]}`}>
      <span className="dot" />
      {SEVERITY_LABELS[severity]}
    </span>
  );
}

export function StatusBadge({ status }: { status: IncidentStatus }) {
  return (
    <span className={`badge ring-1 ring-inset ${STATUS_CLASSES[status]}`}>
      <span className="dot" />
      {STATUS_LABELS[status]}
    </span>
  );
}

const APPEAL_CLASSES: Record<AppealStatus, string> = {
  pending: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  granted: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  denied: 'bg-red-500/15 text-red-400 ring-red-500/40',
};

export function AppealBadge({ status }: { status: AppealStatus }) {
  return (
    <span className={`badge ring-1 ring-inset ${APPEAL_CLASSES[status]}`}>
      <span className="dot" />
      {APPEAL_LABELS[status]}
    </span>
  );
}

const ACTION_CLASSES: Record<Action, string> = {
  flag: 'bg-slate-500/15 text-slate-300 ring-slate-500/30',
  warn: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  mute: 'bg-zinc-500/15 text-zinc-300 ring-zinc-500/30',
  remove: 'bg-red-500/15 text-red-400 ring-red-500/40',
  escalate: 'bg-orange-500/15 text-orange-300 ring-orange-500/30',
};

export function ActionBadge({ action }: { action: Action }) {
  return (
    <span className={`badge mono ring-1 ring-inset ${ACTION_CLASSES[action]}`}>
      {ACTION_LABELS[action]}
    </span>
  );
}
