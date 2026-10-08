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

/**
 * `now` : horodatage du rendu serveur, transmis tel quel.
 *
 * Sans lui, le premier rendu client recalculerait l’uptime et la distance
 * depuis le dernier signalement à partir de `Date.now()` local : texte
 * différent au moment de l’hydratation → erreur React #418. L’état part
 * donc de la valeur serveur, puis l’horloge reprend la main côté client
 * (immédiatement, puis toutes les secondes).
 */
type Props = { node: BotNodeView | null; commands: BotCommandView[]; now: number };

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
  pairing: 'bg-cyan-500/15 text-cyan-300 ring-cyan-500/30',
  qr: 'bg-cyan-500/15 text-cyan-300 ring-cyan-500/30',
  status: 'bg-zinc-500/15 text-zinc-300 ring-zinc-500/30',
  stop: 'bg-red-500/15 text-red-400 ring-red-500/40',
  raw: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
};

const COMMAND_LABEL: Record<BotCommandStatus, string> = {
  pending: 'en attente',
  running: 'en cours',
  done: 'terminée',
  failed: 'échec',
};

const COMMAND_TONE: Record<BotCommandStatus, string> = {
  pending: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  running: 'bg-cyan-500/15 text-cyan-300 ring-cyan-500/30',
  done: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  failed: 'bg-red-500/15 text-red-400 ring-red-500/40',
};

const isLive = (status: BotCommandStatus) => status === 'pending' || status === 'running';

function Spinner({ size = 13 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="spinner"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.28" strokeWidth="3.4" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
    </svg>
  );
}

/** Titre de carte + sous-titre court, bandeau identique d’une carte à l’autre. */
function CardHead({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="card-head">
      <div className="min-w-0">
        <h2 className="card-title">{title}</h2>
        {hint && <p className="faint text-[0.76rem] mt-0.5 leading-snug">{hint}</p>}
      </div>
      {action && <div className="flex items-center gap-2 flex-none">{action}</div>}
    </div>
  );
}

/* ── Panneau ─────────────────────────────────────────────────────── */

export function BotPanel({ node, commands, now: serverNow }: Props) {
  const router = useRouter();

  // Horloge locale : « vu il y a 12 s » et l’uptime avancent même entre
  // deux rafraîchissements du serveur — sans jamais diverger du HTML
  // servi (voir `Props.now`).
  const [now, setNow] = useState(serverNow);
  const [pending, setPending] = useState<BotCommandKind | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [phone, setPhone] = useState('');
  const [raw, setRaw] = useState('');
  const [copied, setCopied] = useState(false);

  /**
   * Demandes en vol : l’identifiant de la dernière commande du type au
   * moment du clic. Tant que ce reste la dernière visible, le
   * rafraîchissement n’est pas arrivé ; quand la nouvelle arrive, c’est
   * son état qui décide. Aucune horloge dans la comparaison (pas de
   * décalage serveur/Client possible), et aucun compte à rebours : le
   * bot qui ne répond pas fait basculer la commande en « échec » au bout
   * de 60 s — le spinner s’arrête tout seul.
   */
  const [sent, setSent] = useState<Partial<Record<BotCommandKind, string | null>>>({});

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

  /* ── Suivi des commandes posées ──────────────────────────────── */

  const latestOf = (kind: BotCommandKind): BotCommandView | null =>
    commands.find((c) => c.kind === kind) ?? null;

  /**
   * Une commande de ce type est-elle en vol ? Trois états : rien de posé,
   * posé mais pas encore vu par le serveur, posé et vivant (pending /
   * running). Une commande `terminée` ou `échec` libère le bouton.
   */
  function inFlight(kind: BotCommandKind): boolean {
    const snapshot = sent[kind];
    if (snapshot === undefined) return false;
    const newest = latestOf(kind);
    if ((newest?.id ?? null) === snapshot) return true; // pas encore rafraîchie
    return newest !== null && isLive(newest.status);
  }

  const qrInFlight = inFlight('qr');
  const pairingInFlight = inFlight('pairing');
  const latestQr = latestOf('qr');
  const latestPairing = latestOf('pairing');
  const qrFailure = latestQr?.status === 'failed' ? (latestQr.result ?? '') : null;
  const pairingFailure =
    latestPairing?.status === 'failed' ? (latestPairing.result ?? '') : null;

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

      // Le repère : l’identifiant de la dernière commande de ce type,
      // *avant* rafraîchissement. La commande posée sera la suivante ;
      // c’est son état qui pilotera le spinner, jusqu’à l’issue ou
      // l’expiration.
      setSent((prev) => ({
        ...prev,
        [kind]: commands.find((c) => c.kind === kind)?.id ?? null,
      }));
      setFeedback({
        kind: 'ok',
        text: `Commande « ${kind} » enregistrée — le bot la prendra à son prochain passage (60 s maximum d’attente).`,
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

      {/* ── Barre d’état : pleine largeur, tout en mono ─────────── */}
      <section className="card anim-in overflow-hidden" aria-label="État du bot">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-[var(--border)] px-5 py-3.5">
          <span className="flex items-center gap-2.5 min-w-0">
            <span
              aria-hidden="true"
              className={`dot ${online ? 'live-dot' : ''} ${NODE_TONE[node?.status ?? 'offline']}`}
              style={{ width: 11, height: 11 }}
            />
            <span className="text-[0.95rem] font-semibold whitespace-nowrap">
              {node ? (online ? 'Bot connecté' : 'Bot hors ligne') : 'Aucun bot connecté'}
            </span>
          </span>

          <span className="mono text-[0.95rem] text-[var(--text)] truncate">
            {node?.payload.number ?? '—'}
          </span>

          <span className="hidden sm:block h-4 w-px bg-[var(--border-strong)]" />

          <span className="flex items-baseline gap-1.5">
            <span className="label">Uptime</span>
            <span className="mono text-[0.95rem]">{uptimeText}</span>
          </span>

          <span className="flex items-baseline gap-1.5">
            <span className="label">Méthode</span>
            <span className="mono text-[0.95rem]">{payload?.connectMethod ?? '—'}</span>
          </span>

          <span className="mono faint text-[0.76rem] ml-auto whitespace-nowrap">
            vu {lastSeenText}
          </span>

          <span className={`badge ring-1 ring-inset ${NODE_BADGE[node?.status ?? 'offline']}`}>
            <span className="dot" />
            {NODE_LABEL[node?.status ?? 'offline']}
          </span>
        </div>

        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3.5 px-5 py-4">
          <div>
            <dt className="label">Version</dt>
            <dd className="mono text-[1.02rem] mt-1">{payload?.version ?? '—'}</dd>
          </div>
          <div>
            <dt className="label">Commandes chargées</dt>
            <dd className="mono text-[1.02rem] mt-1">{payload?.commands ?? '—'}</dd>
          </div>
          <div>
            <dt className="label">Groupes</dt>
            <dd className="mono text-[1.02rem] mt-1">{payload?.groups ?? '—'}</dd>
          </div>
          <div>
            <dt className="label">Moteur</dt>
            <dd className="mono text-[1.02rem] mt-1">
              {payload?.engine ?? '—'}
              {payload?.prefix ? (
                <span className="faint text-[0.78rem]"> · prefix {payload.prefix}</span>
              ) : null}
            </dd>
          </div>
        </dl>
      </section>

      {/* ── Connexion (QR + appairage) | Console ────────────────── */}
      <div className="grid gap-4 min-[900px]:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)] min-[900px]:items-start">
        <div className="@container grid gap-4 @lg:grid-cols-2">
          {/* QR */}
          <section className="card overflow-hidden anim-in" style={{ animationDelay: '70ms' }}>
            <CardHead
              title="QR de connexion"
              hint="WhatsApp → Appareils connectés"
              action={
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => void send('qr')}
                  disabled={pending !== null || qrInFlight}
                >
                  {(pending === 'qr' || qrInFlight) && <Spinner />}
                  {pending === 'qr' || qrInFlight ? 'Demande…' : 'Demander un QR'}
                </button>
              }
            />

            <div className="card-pad">
              {qrInFlight ? (
                <div className="shimmer grid h-40 place-items-center rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] bg-[var(--bg)] px-4 text-center">
                  <span className="flex flex-col items-center gap-2 text-[0.82rem] muted">
                    <Spinner size={16} />
                    Demande en cours — le bot prépare un QR.
                    <span className="faint mono text-[0.72rem]">60 s maximum d’attente</span>
                  </span>
                </div>
              ) : qr ? (
                <>
                  {qr.startsWith('data:image') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={qr}
                      alt="QR de connexion WhatsApp"
                      className="h-40 w-40 rounded-[var(--radius-sm)] border border-[var(--border)] bg-white p-2"
                    />
                  ) : (
                    <pre className="mono max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg)] p-3 text-[0.75rem] leading-relaxed text-[var(--text-muted)]">
                      {qr}
                    </pre>
                  )}
                  {qrFailure && (
                    <p className="form-error mt-3" role="alert">
                      {qrFailure}
                    </p>
                  )}
                </>
              ) : qrFailure ? (
                <div
                  className="grid h-40 place-items-center rounded-[var(--radius-sm)] border border-red-500/30 bg-red-500/[0.07] px-4 text-center"
                  role="alert"
                >
                  <span className="text-[0.82rem] leading-relaxed text-red-300">
                    {qrFailure}
                    <span className="block faint text-[0.76rem] mt-1.5">
                      Redemandez un QR une fois le bot relancé.
                    </span>
                  </span>
                </div>
              ) : (
                <div className="grid h-40 place-items-center rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] px-4 text-center text-[0.82rem] faint">
                  Aucun QR — demandez-en un, il s’affichera ici.
                </div>
              )}
            </div>
          </section>

          {/* Appairage */}
          <section className="card overflow-hidden anim-in" style={{ animationDelay: '140ms' }}>
            <CardHead title="Code par appairage" hint="Sans QR : un numéro, un code" />

            <div className="card-pad">
              {pairingCode !== null ? (
                <div className="anim-line rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--bg)] px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <code className="mono text-[1.35rem] tracking-[0.16em] text-[var(--accent)]">
                      {pairingCode}
                    </code>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => void copyPairingCode()}
                    >
                      {copied ? 'Copié ✓' : 'Copier'}
                    </button>
                  </div>
                  <p className="faint mono text-[0.72rem] mt-2">
                    pour {payload?.pairingFor ?? 'le numéro demandé'}
                  </p>
                </div>
              ) : (
                <p className="faint text-[0.8rem] leading-relaxed">
                  Aucun code en cours — générez-en un pour le numéro ci-dessous.
                </p>
              )}

              {pairingFailure && (
                <p className="form-error mt-3" role="alert">
                  {pairingFailure}
                </p>
              )}

              <form
                className="mt-3.5 flex flex-wrap gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (digits && !pairingInFlight) void send('pairing', digits);
                }}
              >
                <input
                  className="input mono min-w-[9rem] flex-1"
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
                  disabled={pending !== null || pairingInFlight || digits.length === 0}
                >
                  {(pending === 'pairing' || pairingInFlight) && <Spinner />}
                  {pending === 'pairing' || pairingInFlight ? 'Génération…' : 'Générer le code'}
                </button>
              </form>
              <p className="faint text-[0.74rem] mt-2 leading-snug">
                Format international <strong>sans +</strong>, ex. 237693978044.
              </p>
            </div>
          </section>
        </div>

        {/* Console */}
        <section className="card anim-in flex flex-col min-[900px]:h-full" style={{ animationDelay: '210ms' }}>
          <CardHead
            title="Console"
            hint={`${logs.length} ligne${logs.length > 1 ? 's' : ''} conservée${
              logs.length > 1 ? 's' : ''
            } sur 200 — défilement vers le bas`}
            action={
              <>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm mono"
                  onClick={() => void send('status')}
                  disabled={pending !== null || inFlight('status')}
                >
                  {(pending === 'status' || inFlight('status')) && <Spinner />}
                  STATUS
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm mono"
                  onClick={() => void send('stop')}
                  disabled={pending !== null || inFlight('stop')}
                >
                  {(pending === 'stop' || inFlight('stop')) && <Spinner />}
                  STOP
                </button>
              </>
            }
          />

          <div className="p-4 flex-1 flex">
            <div
              ref={consoleRef}
              role="region"
              aria-label="Console du bot"
              className="mono w-full min-h-[16rem] min-[900px]:min-h-[22rem] max-h-[26rem] overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg)] p-3.5 text-[0.74rem] leading-[1.6]"
            >
              {logs.length === 0 ? (
                <span className="faint">
                  Aucun log — le bot n’a encore rien publié. Chaque synchronisation (3 s) viendra
                  remplir cette console.
                </span>
              ) : (
                logKeys.map((key, i) => (
                  <div key={key} className="anim-line break-words whitespace-pre-wrap">
                    <span className="faint" suppressHydrationWarning>
                      {formatLogTime(logs[i].t)}
                    </span>{' '}
                    <span className="text-[var(--text-muted)]">{logs[i].line}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>

      {/* ── Commande libre | Historique ─────────────────────────── */}
      <div className="grid gap-4 min-[900px]:grid-cols-2 min-[900px]:items-start">
        {/* Commande libre */}
        <section className="card overflow-hidden anim-in" style={{ animationDelay: '280ms' }}>
          <CardHead
            title="Commande libre"
            hint="La saisie part telle quelle, préfixe compris"
            action={
              <span className="badge mono ring-1 ring-inset bg-white/[0.03] text-[var(--text-muted)] ring-[var(--border-strong)]">
                kind: raw
              </span>
            }
          />
          <div className="card-pad">
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const value = raw.trim();
                if (!value || inFlight('raw')) return;
                void send('raw', value);
                setRaw('');
              }}
            >
              <input
                className="input mono min-w-[11rem] flex-1"
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                maxLength={500}
                placeholder=".antilink on"
                aria-label="Commande à exécuter sur le bot"
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={pending !== null || inFlight('raw') || raw.trim().length === 0}
              >
                {(pending === 'raw' || inFlight('raw')) && <Spinner />}
                Envoyer
              </button>
            </form>

            <p className="mt-3 text-[0.78rem] leading-relaxed text-amber-300/85">
              ⚠ Cette commande s’exécute réellement sur le bot : elle modifie son comportement en
              direct. Sans réponse sous 60 s, elle bascule en <strong>échec</strong>.
            </p>
          </div>
        </section>

        {/* Historique */}
        <section className="card overflow-hidden anim-in" style={{ animationDelay: '350ms' }}>
          <CardHead
            title="Historique des commandes"
            hint={`Les ${commands.length} dernières commandes posées, du plus récent au plus ancien`}
          />

          {commands.length === 0 ? (
            <p className="faint px-5 py-6 text-[0.85rem]">
              Aucune commande posée pour l’instant — demandez un QR ou un code d’appairage.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left min-w-[34rem]">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th scope="col" className="label px-4 py-2.5 font-medium w-24">Type</th>
                    <th scope="col" className="label px-4 py-2.5 font-medium">Payload / résultat</th>
                    <th scope="col" className="label px-4 py-2.5 font-medium w-28">État</th>
                    <th scope="col" className="label px-4 py-2.5 font-medium text-right w-40">Posée le</th>
                  </tr>
                </thead>
                <tbody>
                  {commands.map((c, i) => (
                    <tr
                      key={c.id}
                      className="anim-in table-row-hover transition-colors border-b border-[var(--border)] align-top last:border-0"
                      style={{ animationDelay: `${Math.min(i * 35, 350)}ms` }}
                    >
                      <td className="px-4 py-3">
                        <span className={`badge mono ring-1 ring-inset ${KIND_TONE[c.kind]}`}>
                          {c.kind}
                        </span>
                      </td>
                      <td className="min-w-0 px-4 py-3">
                        {c.payload && (
                          <div className="mono truncate text-[0.8rem] text-[var(--text)]" title={c.payload}>
                            {c.payload}
                          </div>
                        )}
                        {c.result && (
                          <div
                            className={`mt-1 text-[0.77rem] line-clamp-2 leading-snug ${
                              c.status === 'failed' ? 'text-red-300/90' : 'muted'
                            }`}
                            title={c.result}
                          >
                            ↳ {c.result}
                          </div>
                        )}
                        {!c.payload && !c.result && <span className="faint text-[0.8rem]">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`badge ring-1 ring-inset ${COMMAND_TONE[c.status]}`}
                          title={c.status}
                        >
                          <span className="dot" />
                          {COMMAND_LABEL[c.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <time
                          dateTime={c.createdAt}
                          className="faint mono whitespace-nowrap text-[0.75rem]"
                          suppressHydrationWarning
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
    </div>
  );
}
