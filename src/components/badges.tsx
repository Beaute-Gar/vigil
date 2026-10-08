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
  pending: 'bg-warn/15 text-warn ring-warn/30',
  granted: 'bg-ok/15 text-ok ring-ok/30',
  denied: 'bg-danger/15 text-danger ring-danger/40',
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
  flag: 'bg-neutral/15 text-neutral ring-neutral/30',
  warn: 'bg-warn/15 text-warn ring-warn/30',
  mute: 'bg-neutral/15 text-neutral ring-neutral/30',
  remove: 'bg-danger/15 text-danger ring-danger/40',
  escalate: 'bg-orange-500/15 text-orange-700 ring-orange-500/30',
};

export function ActionBadge({ action }: { action: Action }) {
  return (
    <span className={`badge mono ring-1 ring-inset ${ACTION_CLASSES[action]}`}>
      {ACTION_LABELS[action]}
    </span>
  );
}
