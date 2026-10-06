'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  BotCommandKind,
  BotCommandStatus,
  BotLogLine,
  BotNodePayload,
  BotNodeStatus,
} from '@/db/schema';
import { formatLastSeen, formatLogTime, formatUptime } from '@/lib/bot-format';

/** Identité stable : sans elle, `?? []` re-crée un tableau à chaque rendu. */
const NO_LOGS: BotLogLine[] = [];

/* ── Props (serialisées par le composant serveur) ────────────────── */

export type BotNodeView = {
  status: BotNodeStatus;
  lastSeenAt: string | null;
  payload: BotNodePayload;
};

export type BotCommandView = {
  id: string;
  kind: BotCommandKind;
  status: BotCommandStatus;
  payload: string | null;
  result: string | null;
  createdAt: string;
  completedAt: string | null;
};

type Props = { node: BotNodeView | null; commands: BotCommandView[] };

/* ── Libellés & couleurs (littéraux : Tailwind lit le source) ────── */

const NODE_LABEL: Record<BotNodeStatus, string> = {
  online: 'En ligne',
  offline: 'Hors ligne',
  stale: 'Signal faible',
};

const NODE_TONE: Record<BotNodeStatus, string> = {
  online: 'text-emerald-400',
  offline: 'text-zinc-500',
  stale: 'text-amber-400',
};

const NODE_BADGE: Record<BotNodeStatus, string> = {
  online: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  offline: 'bg-zinc-500/15 text-zinc-300 ring-zinc-500/30',
  stale: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
};

const KIND_TONE: Record<BotCommandKind, string> = {
  pairing: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  qr: 'bg-teal-500/15 text-teal-300 ring-teal-500/30',
  status: 'bg-zinc-500/15 text-zinc-300 ring-zinc-500/30',
  stop: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
  raw: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
};

const COMMAND_LABEL: Record<BotCommandStatus, string> = {
  pending: 'en attente',
  running: 'en cours',
  done: 'terminée',
  failed: 'échouée',
};

const COMMAND_TONE: Record<BotCommandStatus, string> = {
  pending: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  running: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  done: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  failed: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
};

function Spinner() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="spinner" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.28" strokeWidth="3.4" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
    </svg>
  );
}

/* ── Panneau ─────────────────────────────────────────────────────── */

export function BotPanel({ node, commands }: Props) {
  const router = useRouter();

  // Horloge locale : « vu il y a 12 s » et l’uptime avancent même
  // entre deux rafraîchissements du serveur.
  const [now, setNow] = useState(() => Date.now());
  const [pending, setPending] = useState<BotCommandKind | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [phone, setPhone] = useState('');
  const [raw, setRaw] = useState('');
  const [copied, setCopied] = useState(false);

  const payload = node?.payload;
  const logs = payload?.logs ?? NO_LOGS;
  const online = node?.status === 'online';

  const consoleRef = useRef<HTMLDivElement>(null);
  const firstPaint = useRef(true);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Le serveur fait foi : mêmes cartes, état neuf, toutes les 3 s.
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(id);
  }, [router]);

  const lastLogKey =
    logs.length > 0 ? `${logs[logs.length - 1].t}|${logs[logs.length - 1].line}` : '';

  // Défilement vers le bas — seulement si l’utilisateur regarde déjà
  // le bas : une console qui remonte sous les doigts est intolérable.
  useEffect(() => {
    const el = consoleRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (firstPaint.current || nearBottom) {
      firstPaint.current = false;
      el.scrollTop = el.scrollHeight;
    }
  }, [lastLogKey]);

  // Clés fondées sur le contenu : une ligne qui défile de la file ne
  // « remonte » pas dans le DOM — seules les lignes récemment arrivées
  // sont montées, donc seules elles jouent l’animation d’entrée.
  const logKeys = useMemo(() => {
    const seen = new Map<string, number>();
    return logs.map((line) => {
      const base = `${line.t}|${line.line}`;
      const occurrence = seen.get(base) ?? 0;
      seen.set(base, occurrence + 1);
      return `${base}#${occurrence}`;
    });
  }, [logs]);

  const uptimeBase = typeof payload?.uptimeMs === 'number' ? payload.uptimeMs : null;
  // Le bot n’envoie son uptime qu’au dernier signalement : on ajoute
  // l’écoulement depuis, mais seulement tant qu’il est en ligne.
  const uptimeDrift =
    online && node?.lastSeenAt ? Math.max(0, now - Date.parse(node.lastSeenAt)) : 0;
  const uptimeText = uptimeBase === null ? '—' : formatUptime(uptimeBase + uptimeDrift);

  const lastSeenText = node?.lastSeenAt
    ? formatLastSeen(now - Date.parse(node.lastSeenAt))
    : 'jamais vu';

  async function send(kind: BotCommandKind, value?: string | null) {
    if (pending) return;
    setPending(kind);
    setFeedback(null);

    try {
      const body = value === undefined || value === null ? { kind } : { kind, payload: value };
      const res = await fetch('/api/bot/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        errors?: Record<string, string>;
      };

      if (!res.ok) {
        setFeedback({
          kind: 'error',
          text: data.errors?.payload ?? data.errors?.kind ?? data.error ?? 'Commande refusée.',
        });
        return;
      }

      setFeedback({
        kind: 'ok',
        text: `Commande « ${kind} » enregistrée — le bot la prendra à son prochain passage.`,
      });
      router.refresh();
    } catch {
      setFeedback({ kind: 'error', text: 'Impossible de joindre le serveur.' });
    } finally {
      setPending(null);
    }
  }

  async function copyPairingCode() {
    const code = payload?.pairingCode;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setFeedback({ kind: 'error', text: 'Copie refusée par le navigateur.' });
    }
  }

  const digits = phone.replace(/[^\d]/g, '').replace(/^\+/, '');
  const qr = payload?.qr ?? null;
  const pairingCode = payload?.pairingCode ?? null;

  return (
    <div className="space-y-4">
      {feedback && (
        <div
          key={feedback.text}
          role={feedback.kind === 'error' ? 'alert' : 'status'}
          className={`anim-line ${feedback.kind === 'error' ? 'form-error' : 'form-notice'}`}
        >
          {feedback.text}
        </div>
      )}

      {/* ── Carte statut ───────────────────────────────────────── */}
      <section className="card card-pad anim-in" aria-label="État du bot">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className={`dot ${online ? 'live-dot' : ''} ${NODE_TONE[node?.status ?? 'offline']}`}
              style={{ width: 11, height: 11 }}
            />
            <div>
              <h2 className="text-[1.02rem]">
                {node ? (online ? 'Bot connecté' : 'Bot hors ligne') : 'Aucun bot connecté'}
              </h2>
              <p className="faint text-[0.79rem] mt-0.5 mono">
                {node?.payload.number ?? '—'} · vu {lastSeenText}
              </p>
            </div>
          </div>
          <span className={`badge ring-1 ring-inset ${NODE_BADGE[node?.status ?? 'offline']}`}>
            <span className="dot" />
            {NODE_LABEL[node?.status ?? 'offline']}
          </span>
        </div>

        <dl className="grid gap-x-6 gap-y-3.5 mt-5 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="label">Uptime</dt>
            <dd className="mono text-[1.05rem] mt-1">{uptimeText}</dd>
          </div>
          <div>
            <dt className="label">Version</dt>
            <dd className="mono text-[1.05rem] mt-1">
              {payload?.version ?? '—'}
              {payload?.prefix ? <span className="faint text-[0.8rem]"> · prefix {payload.prefix}</span> : null}
            </dd>
          </div>
          <div>
            <dt className="label">Commandes chargées</dt>
            <dd className="mono text-[1.05rem] mt-1">{payload?.commands ?? '—'}</dd>
          </div>
          <div>
            <dt className="label">Groupes</dt>
            <dd className="mono text-[1.05rem] mt-1">{payload?.groups ?? '—'}</dd>
          </div>
          <div>
            <dt className="label">Moteur</dt>
            <dd className="mono text-[1.05rem] mt-1">{payload?.engine ?? '—'}</dd>
          </div>
          <div>
            <dt className="label">Appairage</dt>
            <dd className="mono text-[1.05rem] mt-1">{payload?.connectMethod ?? '—'}</dd>
          </div>
        </dl>
      </section>

      {/* ── QR + appairage ─────────────────────────────────────── */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card card-pad anim-in" style={{ animationDelay: '70ms' }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[1.02rem]">QR de connexion</h2>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void send('qr')}
              disabled={pending !== null}
            >
              {pending === 'qr' && <Spinner />}
              {pending === 'qr' ? 'Demande…' : 'Demander un QR'}
            </button>
          </div>
          <p className="faint text-[0.79rem] mt-1.5 leading-relaxed">
            Scannez-le depuis WhatsApp → Appareils connectés. Il expire vite : demandez-en un
            nouveau s’il a disparu.
          </p>

          {qr === null ? (
            <div className="mt-4 grid h-44 place-items-center rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] px-4 text-center text-[0.82rem] faint">
              Aucun QR — demandez-en un, il s’affichera ici.
            </div>
          ) : qr.startsWith('data:image') ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qr}
              alt="QR de connexion WhatsApp"
              className="mt-4 h-44 w-44 rounded-[var(--radius-sm)] border border-[var(--border)] bg-white p-2"
            />
          ) : (
            <pre className="mono anim-line mt-4 max-h-44 overflow-auto whitespace-pre-wrap break-all rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg)] p-3 text-[0.78rem] leading-relaxed text-[var(--text-muted)]">
              {qr}
            </pre>
          )}
        </div>

        <div className="card card-pad anim-in" style={{ animationDelay: '140ms' }}>
          <h2 className="text-[1.02rem]">Code par appairage</h2>
          <p className="faint text-[0.79rem] mt-1.5 leading-relaxed">
            Alternative au QR : WhatsApp → Appareils connectés → Connecter avec un numéro de
            téléphone.
          </p>

          {pairingCode !== null && (
            <div className="anim-line mt-4 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--bg)] px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <code className="mono text-[1.45rem] tracking-[0.16em] text-[var(--accent)]">
                  {pairingCode}
                </code>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copyPairingCode()}>
                  {copied ? 'Copié ✓' : 'Copier'}
                </button>
              </div>
              <p className="faint mono text-[0.74rem] mt-2">
                pour {payload?.pairingFor ?? 'le numéro demandé'}
              </p>
            </div>
          )}

          <form
            className="mt-4 flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (digits) void send('pairing', digits);
            }}
          >
            <input
              className="input mono min-w-[11rem] flex-1"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="237693978044"
              aria-label="Numéro de téléphone international"
              maxLength={24}
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={pending !== null || digits.length === 0}
            >
              {pending === 'pairing' && <Spinner />}
              {pending === 'pairing' ? 'Génération…' : 'Générer le code'}
            </button>
          </form>
          <p className="faint text-[0.75rem] mt-2">
            Format international <strong>sans +</strong>, ex. 237693978044.
          </p>
        </div>
      </section>

      {/* ── Console ────────────────────────────────────────────── */}
      <section className="card anim-in" style={{ animationDelay: '210ms' }}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 className="text-[1.02rem]">Console</h2>
            <p className="faint text-[0.79rem] mt-1">
              {logs.length} ligne{logs.length > 1 ? 's' : ''} conservée
              {logs.length > 1 ? 's' : ''} sur 200 — défilement vers le bas.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-ghost btn-sm mono"
              onClick={() => void send('status')}
              disabled={pending !== null}
            >
              {pending === 'status' && <Spinner />}
              STATUS
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm mono"
              onClick={() => void send('stop')}
              disabled={pending !== null}
            >
              {pending === 'stop' && <Spinner />}
              STOP
            </button>
          </div>
        </div>

        <div className="p-4">
          <div
            ref={consoleRef}
            role="region"
            aria-label="Console du bot"
            className="mono h-72 overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg)] p-3.5 text-[0.75rem] leading-[1.55]"
          >
            {logs.length === 0 ? (
              <span className="faint">Aucun log — le bot n’a encore rien publié.</span>
            ) : (
              logKeys.map((key, i) => (
                <div key={key} className="anim-line break-words whitespace-pre-wrap">
                  <span className="faint">{formatLogTime(logs[i].t)}</span>{' '}
                  <span className="text-[var(--text-muted)]">{logs[i].line}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* ── Commande libre ─────────────────────────────────────── */}
      <section className="card card-pad anim-in" style={{ animationDelay: '280ms' }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[1.02rem]">Commande libre</h2>
          <span className="badge mono ring-1 ring-inset bg-white/[0.03] text-[var(--text-muted)] ring-[var(--border-strong)]">
            kind: raw
          </span>
        </div>
        <p className="faint text-[0.79rem] mt-1.5 leading-relaxed">
          Le préfixe est nécessaire : la saisie part telle quelle, ex.{' '}
          <code className="mono text-[var(--text)]">.antilink on</code>.
        </p>

        <form
          className="mt-3.5 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const value = raw.trim();
            if (!value) return;
            void send('raw', value);
            setRaw('');
          }}
        >
          <input
            className="input mono min-w-[13rem] flex-1"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            maxLength={500}
            placeholder=".antilink on"
            aria-label="Commande à exécuter sur le bot"
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={pending !== null || raw.trim().length === 0}
          >
            {pending === 'raw' && <Spinner />}
            Envoyer
          </button>
        </form>

        <p className="mt-2.5 text-[0.78rem] leading-relaxed text-amber-300/85">
          ⚠ Cette commande s’exécute réellement sur le bot : elle modifie son comportement en
          direct.
        </p>
      </section>

      {/* ── Historique ─────────────────────────────────────────── */}
      <section className="card overflow-hidden anim-in" style={{ animationDelay: '350ms' }}>
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h2 className="text-[1.02rem]">Historique des commandes</h2>
          <p className="faint text-[0.79rem] mt-1">
            Les {commands.length} dernières commandes posées, du plus récent au plus ancien.
          </p>
        </div>

        {commands.length === 0 ? (
          <p className="faint px-5 py-6 text-[0.85rem]">
            Aucune commande posée pour l’instant — demandez un QR ou un code d’appairage.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left min-w-[46rem]">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th scope="col" className="label px-4 py-3 font-medium w-32">Type</th>
                  <th scope="col" className="label px-4 py-3 font-medium">Payload / résultat</th>
                  <th scope="col" className="label px-4 py-3 font-medium w-36">État</th>
                  <th scope="col" className="label px-4 py-3 font-medium text-right w-56">Posée le</th>
                </tr>
              </thead>
              <tbody>
                {commands.map((c, i) => (
                  <tr
                    key={c.id}
                    className="anim-in table-row-hover transition-colors border-b border-[var(--border)] align-top last:border-0"
                    style={{ animationDelay: `${Math.min(i * 35, 350)}ms` }}
                  >
                    <td className="px-4 py-3.5">
                      <span className={`badge mono ring-1 ring-inset ${KIND_TONE[c.kind]}`}>
                        {c.kind}
                      </span>
                    </td>
                    <td className="min-w-0 px-4 py-3.5">
                      {c.payload && (
                        <div className="mono truncate text-[0.82rem] text-[var(--text)]" title={c.payload}>
                          {c.payload}
                        </div>
                      )}
                      {c.result && (
                        <div className="mt-1 truncate text-[0.79rem] muted" title={c.result}>
                          ↳ {c.result}
                        </div>
                      )}
                      {!c.payload && !c.result && <span className="faint text-[0.8rem]">—</span>}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`badge ring-1 ring-inset ${COMMAND_TONE[c.status]}`}
                        title={c.status}
                      >
                        <span className="dot" />
                        {COMMAND_LABEL[c.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <time
                        dateTime={c.createdAt}
                        className="faint mono whitespace-nowrap text-[0.77rem]"
                      >
                        {new Date(c.createdAt).toLocaleString('fr-CA', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </time>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
