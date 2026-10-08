'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { IncidentStatus } from '@/db/schema';

type Props = {
  incidentId: string;
  status: IncidentStatus;
  resolvedAt: string | null;
  resolvedByName: string | null;
};

/**
 * Décision d'un incident.
 *
 * Deux issues depuis « ouvert », puis plus rien : la machine à états côté
 * serveur refuse toute seconde décision, ce que ce panneau reflète en
 * n'affichant plus les actions une fois l'état final atteint.
 */
export function DecisionPanel({ incidentId, status, resolvedAt, resolvedByName }: Props) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [pending, setPending] = useState<'dismissed' | 'confirmed' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(to: 'dismissed' | 'confirmed') {
    if (pending) return;
    setPending(to);
    setError(null);

    try {
      const res = await fetch(`/api/incidents/${incidentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: to, note: note.trim() || undefined }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        errors?: { form?: string };
      };

      if (!res.ok) {
        setError(data.errors?.form ?? 'Décision refusée.');
        return;
      }

      setNote('');
      router.refresh();
    } catch {
      setError('Impossible de joindre le serveur.');
    } finally {
      setPending(null);
    }
  }

  if (status !== 'open') {
    return (
      <div className="card card-pad">
        <div className="label">Décision</div>
        <p className="text-[0.92rem] mt-2.5 leading-relaxed">
          Incident{' '}
          <strong className={status === 'dismissed' ? 'text-neutral' : 'text-ok'}>
            {status === 'dismissed' ? 'écarté' : 'confirmé'}
          </strong>
          {resolvedAt && (
            <>
              {' '}
              le{' '}
              <time dateTime={resolvedAt} className="mono text-[var(--text-muted)]">
                {new Date(resolvedAt).toLocaleString('fr-CA', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
            </>
          )}
          {resolvedByName && <> par {resolvedByName}</>}.
        </p>
        <p className="faint text-[0.8rem] leading-relaxed mt-3 pt-3 border-t border-[var(--border)]">
          Un incident tranché ne repasse pas par « ouvert ». Pour contester cette décision,
          ouvrez un appel depuis la page détaillée.
        </p>
      </div>
    );
  }

  return (
    <div className="card card-pad">
      <div className="label">Décision du modérateur</div>

      <div className="field mt-3.5">
        <label className="label" htmlFor="decision-note">
          Motivation <span className="faint">(facultelle, 500 caractères)</span>
        </label>
        <textarea
          id="decision-note"
          className="input"
          style={{ fontFamily: 'var(--font-sans)', minHeight: '4.5rem' }}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder="Contexte, preuve, justification…"
        />
        <span className="faint text-[0.74rem] mono self-end">{note.length}/500</span>
      </div>

      <div className="flex flex-wrap gap-2.5 mt-4">
        <button
          type="button"
          className="btn btn-ghost flex-1 min-w-[8rem]"
          disabled={pending !== null}
          onClick={() => decide('dismissed')}
        >
          {pending === 'dismissed' ? 'Traitement…' : 'Écarter'}
        </button>
        <button
          type="button"
          className="btn btn-danger flex-1 min-w-[8rem]"
          disabled={pending !== null}
          onClick={() => decide('confirmed')}
        >
          {pending === 'confirmed' ? 'Traitement…' : 'Confirmer'}
        </button>
      </div>

      <p className="faint text-[0.775rem] leading-relaxed mt-3.5">
        <strong className="text-[var(--text-muted)]">Écarter</strong> marque un faux positif et
        alimente le taux de révision des règles.{' '}
        <strong className="text-[var(--text-muted)]">Confirmer</strong> maintient l’action
        prise à la détection.
      </p>

      {error && (
        <p className="form-error mt-3.5" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
