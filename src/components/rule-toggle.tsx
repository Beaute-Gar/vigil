'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Bascule d'activation d'une règle.
 *
 * Simple en apparence : désactiver une règle change la modération de
 * l'espace, donc le serveur journalise le changement (rule.enabled /
 * rule.disabled) et le tableau se met à jour après `router.refresh()`.
 */
export function RuleToggle({
  ruleId,
  enabled,
  name,
}: {
  ruleId: string;
  enabled: boolean;
  name: string;
}) {
  const router = useRouter();
  const [state, setState] = useState(enabled);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (pending) return;
    const next = !state;
    setPending(true);
    setError(null);

    try {
      const res = await fetch(`/api/rules/${ruleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });

      const data = (await res.json().catch(() => ({}))) as { errors?: { form?: string } };

      if (!res.ok) {
        setError(data.errors?.form ?? 'Bascule refusée.');
        return;
      }

      setState(next);
      router.refresh();
    } catch {
      setError('Impossible de joindre le serveur.');
      setState(!next); // rétablit l'affichage local
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        role="switch"
        aria-checked={state}
        aria-label={`${name} : ${state ? 'désactiver' : 'activer'}`}
        disabled={pending}
        onClick={toggle}
        className={[
          'relative inline-flex h-5.5 w-10 flex-none items-center rounded-full transition-colors duration-200',
          'disabled:opacity-60 cursor-pointer',
          state ? 'bg-[var(--accent)]' : 'bg-white/12',
        ].join(' ')}
        style={{ height: '1.375rem', width: '2.5rem' }}
      >
        <span
          aria-hidden="true"
          className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 shadow-sm"
          style={{ transform: `translateX(${state ? '1.25rem' : '0.125rem'})` }}
        />
      </button>

      <span
        className={[
          'text-[0.7rem] mono',
          state ? 'text-emerald-300' : 'text-[var(--text-faint)]',
        ].join(' ')}
      >
        {state ? 'active' : 'inactive'}
      </span>

      {error && <span className="text-[0.7rem] text-rose-300 text-right">{error}</span>}
    </div>
  );
}
