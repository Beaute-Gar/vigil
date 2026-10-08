'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ActionBadge, SeverityBadge } from '@/components/badges';

type DetectResponse = {
  clean: boolean;
  invalidRules: { id: string; name: string; reason: string }[];
  incident?: {
    id: string;
    subject: string;
    channel: string;
    content: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    actionTaken: 'flag' | 'warn' | 'mute' | 'remove' | 'escalate';
  } | null;
};

type Result =
  | { kind: 'clean'; invalidRules: DetectResponse['invalidRules'] }
  | {
      kind: 'flagged';
      incident: NonNullable<DetectResponse['incident']>;
      invalidRules: DetectResponse['invalidRules'];
    }
  | { kind: 'error'; message: string };

const SAMPLES = [
  'Bonjour à tous, quelqu’un a le sujet du cours de demain ?',
  'ACHETEZ ma formation à -80%, offre exclusive ce soir !',
  'Regardez ça : bit.ly/3xKpZ ça vaut le détour',
  'Tu es vraiment imbécile, arrête de parler.',
  'Vérifiez votre compte ici, sinon il sera fermé sous 24h.',
  'Je vais vous trouver, tu sais bien où j’habite.',
] as const;

export function Simulator() {
  const router = useRouter();
  const [subject, setSubject] = useState('@nouveau_membre');
  const [channel, setChannel] = useState('#general');
  const [content, setContent] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [pending, setPending] = useState(false);

  async function run(e?: React.FormEvent) {
    e?.preventDefault();
    if (!content.trim() || pending) return;

    setPending(true);
    setResult(null);

    try {
      const res = await fetch('/api/incidents/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, channel, content }),
      });

      const data = (await res.json().catch(() => ({}))) as DetectResponse & {
        error?: string;
        errors?: Record<string, string>;
      };

      if (!res.ok) {
        setResult({
          kind: 'error',
          message: data.errors?.content ?? data.error ?? 'Requête refusée.',
        });
        return;
      }

      if (data.clean) {
        setResult({ kind: 'clean', invalidRules: data.invalidRules ?? [] });
      } else if (data.incident) {
        setResult({
          kind: 'flagged',
          incident: data.incident,
          invalidRules: data.invalidRules ?? [],
        });
        router.refresh(); // les compteurs de la page suivent
      }
    } catch {
      setResult({ kind: 'error', message: 'Impossible de joindre le serveur.' });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={run} className="card overflow-hidden">
      <div className="card-head">
        <div>
          <h2 className="card-title">Soumettre un message au moteur</h2>
          <p className="faint text-[0.76rem] mt-0.5 leading-snug">
            La détection tourne réellement — l’incident s’inscrit dans la base s’il y a lieu.
          </p>
        </div>
        <span className="badge mono ring-1 ring-inset bg-[var(--surface)] text-[var(--text-muted)] ring-[var(--border-strong)]">
          POST /api/incidents/detect
        </span>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="field">
            <label className="label" htmlFor="sim-subject">
              Auteur
            </label>
            <input
              id="sim-subject"
              className="input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="@pseudo"
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="sim-channel">
              Canal
            </label>
            <input
              id="sim-channel"
              className="input"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              placeholder="#general"
            />
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor="sim-content">
            Message à modérer
          </label>
          <textarea
            id="sim-content"
            className="input"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Écrivez un message…"
            rows={4}
            maxLength={2000}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {SAMPLES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setContent(s);
                setResult(null);
              }}
              className="btn btn-ghost btn-sm mono text-[0.72rem] max-w-full"
              title={s}
            >
              <span className="truncate max-w-[14rem]">{s}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" className="btn btn-primary" disabled={pending || !content.trim()}>
            {pending ? 'Analyse…' : 'Analyser'}
          </button>
          {content && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setContent('');
                setResult(null);
              }}
            >
              Effacer
            </button>
          )}
          <span className="faint text-[0.75rem] mono ml-auto">{content.length}/2000</span>
        </div>

        {result && <Outcome result={result} />}
      </div>
    </form>
  );
}

function Outcome({ result }: { result: Result }) {
  if (result.kind === 'clean') {
    return (
      <div className="rounded-[var(--radius-sm)] border border-ok/30 bg-ok/10 px-4 py-3.5">
        <div className="flex items-center gap-2.5 text-ok text-[0.9rem] font-medium">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M20 6 9 17l-5-5"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Aucune règle déclenchée — message accepté
        </div>
        <p className="text-ok/80 text-[0.82rem] mt-1.5 leading-relaxed">
          Rien à signaler, aucun incident créé.
        </p>
        {result.invalidRules.length > 0 && <InvalidRules list={result.invalidRules} />}
      </div>
    );
  }

  if (result.kind === 'error') {
    return (
      <p className="form-error" role="alert">
        {result.message}
      </p>
    );
  }

  const { incident } = result;

  return (
    <div className="rounded-[var(--radius-sm)] border border-warn/30 bg-warn/[0.07] px-4 py-3.5 space-y-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-warn text-[0.9rem] font-medium">Incident créé</span>
        <SeverityBadge severity={incident.severity} />
        <ActionBadge action={incident.actionTaken} />
      </div>

      <dl className="grid gap-x-6 gap-y-1.5 text-[0.83rem] sm:grid-cols-[auto_1fr]">
        <dt className="faint mono">auteur</dt>
        <dd className="mono text-[var(--text)] truncate">{incident.subject}</dd>
        <dt className="faint mono">canal</dt>
        <dd className="mono text-[var(--text)] truncate">{incident.channel}</dd>
        <dt className="faint mono">statut</dt>
        <dd className="text-accent">ouvert — en attente d’un modérateur</dd>
      </dl>

      <p className="text-warn/80 text-[0.82rem] leading-relaxed">
        L’incident et sa première entrée de journal ont été écrits dans la même passe.
      </p>

      {result.invalidRules.length > 0 && <InvalidRules list={result.invalidRules} />}
    </div>
  );
}

function InvalidRules({ list }: { list: DetectResponse['invalidRules'] }) {
  return (
    <div className="mt-3 pt-3 border-t border-warn/30">
      <div className="text-[0.76rem] mono uppercase tracking-wide text-warn/90 mb-1.5">
        Règles à réparer ({list.length})
      </div>
      <ul className="space-y-1">
        {list.map((r) => (
          <li key={r.id} className="text-[0.79rem] text-warn/85 mono">
            {r.name} — {r.reason}
          </li>
        ))}
      </ul>
    </div>
  );
}
