/**
 * Pont WhatsApp — contrat d'échange avec le bot DJOUSSE TECH.
 *
 * Deux directions, un seul format :
 *
 *   bot  → site   `POST /api/bot/sync`    toutes les ~3 s (polling)
 *   site → bot    `POST /api/bot/commands` (l'écran pose un ordre)
 *
 * Ce module contient la **validation Zod** du corps de synchronisation
 * et les constantes de dimensionnement. Messages en français, un par
 * champ (`422 { errors }`), parce que le bot les affiche telles quelles.
 * L'accès aux données reste dans `src/lib/repository.ts`.
 */

import { z } from 'zod';
import {
  BOT_COMMAND_KINDS,
  type BotCommandKind,
  type BotCommandStatus,
  type BotLogLine,
  type BotNodeStatus,
  type BotStatusReport,
} from '@/db/schema';

/* ── Constantes du pont ──────────────────────────────────────────── */

/** Nom du nœud quand le bot n'en fournit pas. */
export const BOT_NODE_DEFAULT_NAME = 'DJOUSSE-TECH-MD';

/** Taille de la file de logs conservée dans `bot_nodes.payload`. */
export const BOT_LOG_LIMIT = 200;

/** Sans signalement depuis ce délai, le nœud est lu comme hors ligne. */
export const BOT_OFFLINE_AFTER_MS = 30_000;

/** Commandes réclamées par synchronisation (les plus anciennes d'abord). */
export const BOT_CLAIM_LIMIT = 20;

/** Commandes renvoyées par `GET /api/bot/state` et affichées à l'écran. */
export const BOT_HISTORY_LIMIT = 20;

/** Longueur maximale du payload d'une commande libre. */
export const BOT_PAYLOAD_MAX_LENGTH = 500;

/**
 * Délai au-delà duquel une commande sans issue est considérée morte.
 *
 * Le bot signale toutes les 3 s et exécute ses ordres dans la seconde :
 * 60 s sans résultat, c'est deux minutes de polls ratés — le problème
 * n'est pas la commande, c'est le bot (éteint, déconnecté, jamais parti).
 */
export const BOT_COMMAND_TIMEOUT_MS = 60_000;

/** Résultat posé par le site quand le bot ne répond pas à temps. */
export const BOT_COMMAND_TIMEOUT_RESULT =
  'Aucune réponse du bot sous 60 s — vérifiez qu’il tourne.';

/**
 * Horodatage du rendu serveur de la console du pont.
 *
 * L’horloge vit ici, pas dans le composant : React refuse `Date.now()`
 * dans le corps d’un composant (pureté / re-rendres idempotents). Un
 * composant serveur `force-dynamic` est rendu une fois par requête — y
 * porter l’heure est précisément ce qu’il fait, et la valeur part vers
 * le client comme référence commune du premier rendu (voir `BotPanel`).
 */
export function botRenderNow(): number {
  return Date.now();
}

/* ── Validation : synchronisation du bot ─────────────────────────── */

const BotStatusBody = z.object(
  {
    connected: z.boolean('« connected » doit être un booléen.'),
    number: z.string('« number » doit être du texte.').max(64, '64 caractères maximum.').nullable(),
    uptimeMs: z
      .number('« uptimeMs » doit être un nombre.')
      .int('« uptimeMs » doit être un entier (millisecondes).')
      .min(0, '« uptimeMs » ne peut pas être négatif.'),
    version: z.string('« version » doit être du texte.').max(40, '40 caractères maximum.'),
    prefix: z.string('« prefix » doit être du texte.').max(8, '8 caractères maximum.'),
    commands: z
      .number('« commands » doit être un nombre.')
      .int('« commands » doit être un entier (nombre de commandes chargées).')
      .min(0, '« commands » ne peut pas être négatif.'),
    // Optionnel, aligné sur BotStatusReport : un bot qui ne connaît pas
    // encore ses groupes ne doit PAS être refusé — un 422 couperait le pont
    // entier alors que tout le reste du statut est valide.
    groups: z
      .number('« groups » doit être un nombre.')
      .int('« groups » doit être un entier (nombre de groupes).')
      .min(0, '« groups » ne peut pas être négatif.')
      .optional(),
    engine: z.string('« engine » doit être du texte.').max(40, '40 caractères maximum.'),
    connectMethod: z.enum(['qr', 'pairing'], '« connectMethod » inconnu : qr ou pairing.'),
    qr: z
      .string('« qr » doit être du texte (QR brut ou data-URL).')
      .max(30000, 'QR trop volumineux (30 000 caractères maximum).')
      .nullable(),
    pairingCode: z
      .string('« pairingCode » doit être du texte.')
      .max(40, '40 caractères maximum.')
      .nullable(),
    pairingFor: z
      .string('« pairingFor » doit être du texte.')
      .max(32, '32 caractères maximum.')
      .nullable(),
  },
  '« status » doit être un objet.',
);

const BotLogLineBody = z.object(
  {
    t: z
      .number('Chaque log doit porter un horodatage « t » entier, en millisecondes.')
      .int('« t » doit être un entier : horodatage en millisecondes.'),
    line: z
      .string('Chaque log doit porter une ligne « line ».')
      .max(2000, '2000 caractères maximum par ligne de log.'),
  },
  'Chaque ligne de « logs » doit être un objet { t, line }.',
);

const BotResultBody = z.object(
  {
    id: z
      .string('« id » doit être l’identifiant texte de la commande.')
      .min(1, '« id » ne peut pas être vide.')
      .max(64, '64 caractères maximum.'),
    status: z.enum(['done', 'failed'], 'Statut de résultat inconnu : done ou failed.'),
    result: z
      .string('« result » doit être du texte.')
      .max(8000, '8000 caractères maximum.')
      .nullable()
      .optional(),
  },
  'Chaque résultat doit être un objet { id, status, result }.',
);

export const BotSyncBody = z.object(
  {
    name: z
      .string('« name » doit être du texte.')
      .trim()
      .min(1, '« name » ne peut pas être vide.')
      .max(120, '120 caractères maximum.')
      .optional()
      .default(BOT_NODE_DEFAULT_NAME),
    // `null` est accepté et traité comme absent : un bot qui signale
    // « pas d'état » ne doit pas perdre sa fenêtre de logs pour autant.
    status: BotStatusBody.nullable().optional(),
    logs: z
      .array(BotLogLineBody, '« logs » doit être un tableau de lignes { t, line }.')
      .max(50, '50 lignes de log maximum par synchronisation.')
      .optional()
      .default([]),
    results: z
      .array(BotResultBody, '« results » doit être un tableau de résultats.')
      .max(50, '50 résultats maximum par synchronisation.')
      .optional()
      .default([]),
  },
  'Le corps de la synchronisation doit être un objet JSON.',
);

export type BotSyncValue = {
  name: string;
  status?: BotStatusReport;
  logs: BotLogLine[];
  results: { id: string; status: 'done' | 'failed'; result: string | null }[];
};

/* ── Validation : commande émise par la console ─────────────────── */

export const BotCommandBody = z.object(
  {
    kind: z.enum(
      BOT_COMMAND_KINDS,
      `Type de commande inconnu : ${BOT_COMMAND_KINDS.join(', ')}.`,
    ),
    payload: z
      .string('« payload » doit être du texte.')
      .trim()
      .max(BOT_PAYLOAD_MAX_LENGTH, `${BOT_PAYLOAD_MAX_LENGTH} caractères maximum.`)
      .nullable()
      .optional(),
  },
  'La commande doit être un objet { kind, payload }.',
);

export type BotCommandValue = { kind: BotCommandKind; payload: string | null };

/* ── Traduction des issues ──────────────────────────────────────── */

/**
 * Une erreur par champ, la première rencontrée étant la plus précise.
 * La clé reprend le chemin Zod complet (`status.connected`,
 * `logs.0.line`) : le bot affiche exactement ce qu'il a mal formé.
 */
export function issuesToErrors(
  issues: { path: PropertyKey[]; message: string }[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join('.') : 'form';
    if (errors[key]) continue;
    errors[key] = issue.message;
  }
  return Object.keys(errors).length > 0 ? errors : { form: 'Charge utile invalide.' };
}

export type BotSyncValidation =
  | { ok: true; value: BotSyncValue }
  | { ok: false; errors: Record<string, string> };

/**
 * Valide le corps de `POST /api/bot/sync`.
 *
 * `status: null` est normalisé en absence — même effet en base (seuls
 * `logs` et `last_seen_at` bougent), aucune clause à écrire deux fois.
 */
export function validateBotSync(input: unknown): BotSyncValidation {
  const parsed = BotSyncBody.safeParse(input);
  if (!parsed.success) return { ok: false, errors: issuesToErrors(parsed.error.issues) };

  const { status, ...rest } = parsed.data;
  return {
    ok: true,
    value: {
      name: rest.name,
      ...(status ? { status } : {}),
      logs: rest.logs,
      results: rest.results.map((r) => ({ id: r.id, status: r.status, result: r.result ?? null })),
    },
  };
}

export type BotCommandValidation =
  | { ok: true; value: BotCommandValue }
  | { ok: false; errors: Record<string, string> };

/**
 * Valide la commande de `POST /api/bot/commands`.
 *
 * `pairing` (un numéro) et `raw` (une commande à exécuter) n'ont aucun
 * sens sans payload : le refus se fait ici, message par champ, plutôt
 * que plus tard dans la chaîne.
 */
export function validateBotCommand(input: unknown): BotCommandValidation {
  const parsed = BotCommandBody.safeParse(input);
  if (!parsed.success) return { ok: false, errors: issuesToErrors(parsed.error.issues) };

  const value = parsed.data;
  if ((value.kind === 'pairing' || value.kind === 'raw') && !value.payload) {
    return {
      ok: false,
      errors: {
        payload:
          value.kind === 'pairing'
            ? 'Un numéro de téléphone international (sans +) est requis pour générer le code.'
            : 'La commande à exécuter est obligatoire (ex. .antilink on).',
      },
    };
  }

  return { ok: true, value: { kind: value.kind, payload: value.payload ?? null } };
}

/* ── État calculé à la lecture ───────────────────────────────────── */

/**
 * Statut affiché d'un nœud.
 *
 * Le bot écrit `online` à chaque synchronisation ; c'est la **lecture**
 * qui décide : plus de signalement depuis 30 s = hors ligne. Aucun cron,
 * aucune écriture décorative — l'état est toujours vrai au moment où
 * on le regarde.
 */
export function resolveBotNodeStatus(
  stored: BotNodeStatus,
  lastSeenAt: Date | null,
  now: Date = new Date(),
): BotNodeStatus {
  if (!lastSeenAt) return 'offline';
  if (now.getTime() - lastSeenAt.getTime() > BOT_OFFLINE_AFTER_MS) return 'offline';
  return stored;
}

/**
 * Une commande sans résultat depuis plus de `BOT_COMMAND_TIMEOUT_MS`.
 *
 * `bot_commands` ne porte qu'un horodatage de création (pas de « mise à
 * jour ») : l'âge fait foi. `done`/`failed` n'expirent jamais — une issue
 * est déjà posée, il n'y a rien à rattraper.
 *
 * La bascule elle-même (écriture `failed` + résultat explicite) vit dans
 * `repository.ts`, **à la lecture** : `GET /api/bot/state` et le pendant
 * de `POST /api/bot/sync`. Aucun cron, et seules les commandes qui
 * expirent réellement sont écrites.
 */
export function isBotCommandExpired(
  status: BotCommandStatus,
  createdAt: Date,
  now: Date = new Date(),
): boolean {
  if (status !== 'pending' && status !== 'running') return false;
  return now.getTime() - createdAt.getTime() > BOT_COMMAND_TIMEOUT_MS;
}

/* ── État PUBLIC — page « Connecter mon WhatsApp » ───────────────── */

/**
 * Ce que la page de connexion a le droit de voir : six champs, pas un
 * de plus. Le site public n'affiche qu'un QR et l'état autour de lui ;
 * journal, numéro en clair, commandes et code d'appairage restent
 * réservés à la console authentifiée.
 */
export type PublicBotState = {
  online: boolean;
  connected: boolean;
  qr: string | null;
  connectMethod: 'qr' | 'pairing' | null;
  /** Numéro connecté, masqué : `+237 6••••••93`. */
  numberMasked: string | null;
  lastSeenAt: string | null;
};

/**
 * Masque un numéro : `237652746693` → `+237 6••••••93`.
 * On garde l'indicatif, le premier chiffre et les deux derniers — assez
 * pour reconnaître SON compte, pas pour composer le numéro d'autrui.
 */
export function maskNumber(number: string | null | undefined): string | null {
  const digits = String(number || '').replace(/\D/g, '');
  if (digits.length < 8) return null;
  const hidden = '•'.repeat(Math.max(3, digits.length - 6));
  return `+${digits.slice(0, 3)} ${digits.slice(3, 4)}${hidden}${digits.slice(-2)}`;
}

/**
 * Réduit l'état du pont à ce qu'une page PUBLIQUE peut afficher.
 *
 * Deux garde-fous, tous deux couverts par les tests :
 *  - bot muet depuis 30 s (`offline`) → ni QR ni connexion annoncés :
 *    un QR dont le bot est mort ne se scanne plus, l'afficher serait
 *    un mensonge ;
 *  - la sortie est un objet NEUF à clés exactes : exposer un champ de
 *    plus est un choix explicite, une fuite involontaire (logs, pairing
 *    Code…) est structurellement impossible.
 */
export function publicBotState(
  status: BotNodeStatus,
  lastSeenAt: Date | null,
  payload: (BotStatusReport & { logs?: BotLogLine[] }) | null | undefined,
): PublicBotState {
  const online = status === 'online';
  const connected = online && payload?.connected === true;
  return {
    online,
    connected,
    qr: online ? payload?.qr ?? null : null,
    connectMethod: online ? payload?.connectMethod ?? null : null,
    numberMasked: connected ? maskNumber(payload?.number) : null,
    lastSeenAt: lastSeenAt ? lastSeenAt.toISOString() : null,
  };
}
