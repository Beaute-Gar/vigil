import type { ReactNode } from 'react';

/**
 * En-tête de page du tableau de bord.
 *
 * Deux voix typographiques : l’intitulé (sans-serif, compact) et
 * l’intertitre en petites capitales tracées (mono, accent) qui situe
 * l’écran dans la console. Un filet sépare l’en-tête du corps — la
 * structure se lit avant le contenu.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  action,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && (
            <p className="label mono text-[var(--accent)] mb-2">{eyebrow}</p>
          )}
          <h1 className="text-[1.45rem] leading-none tracking-[-0.02em] font-semibold">{title}</h1>
          {description && (
            <p className="muted text-[0.875rem] mt-2.5 max-w-3xl leading-relaxed">{description}</p>
          )}
        </div>
        {action && <div className="flex items-center gap-2 flex-none">{action}</div>}
      </div>
      <div className="mt-5 h-px bg-[var(--border)]" aria-hidden="true" />
    </header>
  );
}

/**
 * Carte de chiffre — le libellé porte le sens, la couleur n’aide pas.
 * Valeur en mono, chiffres tabulaires : les colonnes s’alignent.
 */
export function KpiCard({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'neutral' | 'accent' | 'warn' | 'danger';
}) {
  const tones = {
    neutral: 'text-[var(--text)]',
    accent: 'text-[var(--accent)]',
    warn: 'text-amber-400',
    danger: 'text-red-400',
  } as const;

  return (
    <div className="card card-pad">
      <div className="label">{label}</div>
      <div className={`mono text-[2rem] leading-none mt-2.5 font-semibold ${tones[tone]}`}>
        {value}
      </div>
      {hint && <div className="faint text-xs mt-2 leading-snug">{hint}</div>}
    </div>
  );
}

/** État vide explicite — jamais un rectangle blanc silencieux. */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="card text-center px-6 py-12">
      <div className="mx-auto mb-4 grid place-items-center w-11 h-11 rounded-full border border-[var(--border-strong)] text-[var(--text-faint)]">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M4 7h16M4 12h16M4 17h10"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <h3 className="text-base">{title}</h3>
      <p className="muted text-sm mt-2 max-w-md mx-auto leading-relaxed">{description}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

/** Filet de progression — valeurs relatives, jamais décoratives. */
export function Meter({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="meter" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Encart explicatif — la « leçon » d’un écran, en une phrase. */
export function Note({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-white/[0.02] px-4 py-3 text-[0.82rem] leading-relaxed muted">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="flex-none mt-0.5 text-[var(--accent)]"
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 11v5M12 8h.01" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
      <span>{children}</span>
    </div>
  );
}
