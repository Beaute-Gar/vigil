'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AppealStatus } from '@/db/schema';

/* ── Création d'un appel ───────────────────────────────────────────── */

export function AppealCreateForm({ incidentId }: { incidentId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);

    try {
      const res = await fetch('/api/appeals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incidentId, reason }),
      });

      const data = (await res.json().catch(() => ({}))) as { errors?: { form?: string } };

      if (!res.ok) {
        setError(data.errors?.form ?? 'Appel refusé.');
        return;
      }

      setReason('');
      router.refresh();
    } catch {
      setError('Impossible de joindre le serveur.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="card card-pad">
      <div className="label">Contester la décision</div>
      <p className="faint text-[0.8rem] leading-relaxed mt-1.5">
        Un appel ouvre un second examen. La motivation est obligatoire — un appel sans
        justification n’est pas un appel.
      </p>

      <div className="field mt-3.5">
        <label className="label" htmlFor="appeal-reason">
          Motivation
        </label>
        <textarea
          id="appeal-reason"
          className="input"
          style={{ fontFamily: 'var(--font-sans)', minHeight: '5rem' }}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          minLength={10}
          maxLength={500}
          required
          placeholder="Pourquoi cette décision devrait être révisée…"
        />
        <span className="faint text-[0.74rem] mono self-end">
          {reason.length}/500 · min. 10
        </span>
      </div>

      {error && (
        <p className="form-error mt-3" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="btn btn-primary mt-4 w-full sm:w-auto" disabled={pending}>
        {pending ? 'Envoi…' : 'Ouvrir un appel'}
      </button>
    </form>
  );
}

/* ── Jugement d'un appel ──────────────────────────────────────────── */

export function AppealDecision({
  appealId,
  status,
}: {
  appealId: string;
  status: AppealStatus;
}) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [pending, setPending] = useState<'granted' | 'denied' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(to: 'granted' | 'denied') {
    if (pending) return;
    setPending(to);
    setError(null);

    try {
      const res = await fetch(`/api/appeals/${appealId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: to, note }),
      });

      const data = (await res.json().catch(() => ({}))) as { errors?: { form?: string } };

      if (!res.ok) {
        setError(data.errors?.form ?? 'Jugement refusé.');
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

  if (status !== 'pending') {
    return (
      <p className="faint text-[0.79rem] leading-relaxed pt-3 border-t border-[var(--border)] mt-3">
        Appel{' '}
        <strong className={status === 'granted' ? 'text-emerald-300' : 'text-rose-300'}>
          {status === 'granted' ? 'accueilli' : 'rejeté'}
        </strong>
        . Clôturé.
      </p>
    );
  }

  return (
    <div className="pt-3.5 mt-3.5 border-t border-[var(--border)]">
      <label className="label" htmlFor={`note-${appealId}`}>
        Motivation du jugement <span className="faint">(obligatoire)</span>
      </label>
      <textarea
        id={`note-${appealId}`}
        className="input mt-1.5"
        style={{ fontFamily: 'var(--font-sans)', minHeight: '3.5rem' }}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
        placeholder="Ce que le second examen a établi…"
      />

      <div className="flex flex-wrap gap-2.5 mt-3.5">
        <button
          type="button"
          className="btn btn-primary flex-1 min-w-[8rem]"
          disabled={pending !== null || note.trim().length === 0}
          onClick={() => decide('granted')}
        >
          {pending === 'granted' ? 'Traitement…' : 'Accueillir l’appel'}
        </button>
        <button
          type="button"
          className="btn btn-ghost flex-1 min-w-[8rem]"
          disabled={pending !== null || note.trim().length === 0}
          onClick={() => decide('denied')}
        >
          {pending === 'denied' ? 'Traitement…' : 'Rejeter'}
        </button>
      </div>

      {error && (
        <p className="form-error mt-3" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
