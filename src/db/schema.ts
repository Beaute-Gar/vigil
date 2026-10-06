/**
 * Schéma PostgreSQL — Vigil
 *
 * Driver : PGlite (PostgreSQL réel compilé en WASM) en local et en CI,
 * zéro service à installer. En production, le même schéma tourne sur
 * Neon / Vercel Postgres / Supabase : seul l'URL change.
 *
 * Choix de modélisation :
 *  - Les statuts et sévérités sont des `text` validés côté TypeScript +
 *    Zod plutôt que des `pgEnum` : ajouter un état ne demande pas une
 *    migration de type, seulement une validation.
 *  - `audit_log` est en écriture seule : aucun UPDATE/DELETE n'existe
 *    dans le code applicatif.
 */
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  integer,
  boolean,
} from 'drizzle-orm/pg-core';

/* ── Types domaine (source de vérité TS) ─────────────────────────── */

export const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const ACTIONS = ['flag', 'warn', 'mute', 'remove', 'escalate'] as const;
export type Action = (typeof ACTIONS)[number];

export const INCIDENT_STATUSES = ['open', 'dismissed', 'confirmed'] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const APPEAL_STATUSES = ['pending', 'granted', 'denied'] as const;
export type AppealStatus = (typeof APPEAL_STATUSES)[number];

export const MEMBER_ROLES = ['owner', 'moderator', 'reviewer'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/* ── Tables ───────────────────────────────────────────────────────── */

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    /** scrypt (node:crypto) — sel + hash concaténés, aucun dépendance native */
    passwordHash: text('password_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex('users_email_uidx').on(t.email)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** SHA-256 du jeton : le jeton en clair ne touche jamais la base */
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const workspaces = pgTable(
  'workspaces',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex('workspaces_slug_uidx').on(t.slug)],
);

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').$type<MemberRole>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex('members_pair_uidx').on(t.workspaceId, t.userId)],
);

/**
 * Une règle de modération. `priority` est évaluée en ordre croissant :
 * le numéro le plus bas est consulté en premier, exactement comme les
 * 13 protections de DJOUSSE GUARD.
 */
export const rules = pgTable(
  'rules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull(),
    /** Source d'une RegExp JavaScript, compilée à l'évaluation */
    pattern: text('pattern').notNull(),
    severity: text('severity').$type<Severity>().notNull(),
    action: text('action').$type<Action>().notNull(),
    priority: integer('priority').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index('rules_ws_priority_idx').on(t.workspaceId, t.priority)],
);

export const incidents = pgTable(
  'incidents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    /** null si l'incident vient d'une détection « hors règle » */
    ruleId: uuid('rule_id').references(() => rules.id, {
      onDelete: 'set null',
    }),
    /** Auteur du message signalé */
    subject: text('subject').notNull(),
    /** Serveur / canal d'origine */
    channel: text('channel').notNull(),
    content: text('content').notNull(),
    severity: text('severity').$type<Severity>().notNull(),
    actionTaken: text('action_taken').$type<Action>().notNull(),
    status: text('status').$type<IncidentStatus>().notNull().default('open'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedById: uuid('resolved_by_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index('incidents_ws_status_idx').on(t.workspaceId, t.status),
    index('incidents_created_idx').on(t.createdAt),
  ],
);

export const appeals = pgTable(
  'appeals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    incidentId: uuid('incident_id')
      .notNull()
      .references(() => incidents.id, { onDelete: 'cascade' }),
    author: text('author').notNull(),
    reason: text('reason').notNull(),
    status: text('status').$type<AppealStatus>().notNull().default('pending'),
    decisionNote: text('decision_note'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decidedById: uuid('decided_by_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index('appeals_status_idx').on(t.status)],
);

/**
 * Journal d'audit immuable. Une ligne = un changement d'état.
 * Aucune requête du projet ne met à jour ou supprime ces lignes.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    incidentId: uuid('incident_id').references(() => incidents.id, {
      onDelete: 'set null',
    }),
    actorId: uuid('actor_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    /** Verbe canonique : incident.created, incident.dismissed, appeal.granted… */
    event: text('event').notNull(),
    details: jsonb('details').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index('audit_ws_created_idx').on(t.workspaceId, t.createdAt)],
);

/* ── Pont WhatsApp (bot DJOUSSE TECH) ────────────────────────────── */

export const BOT_COMMAND_KINDS = ['pairing', 'qr', 'status', 'stop', 'raw'] as const;
export type BotCommandKind = (typeof BOT_COMMAND_KINDS)[number];

export const BOT_COMMAND_STATUSES = ['pending', 'running', 'done', 'failed'] as const;
export type BotCommandStatus = (typeof BOT_COMMAND_STATUSES)[number];

export const BOT_NODE_STATUSES = ['online', 'offline', 'stale'] as const;
export type BotNodeStatus = (typeof BOT_NODE_STATUSES)[number];

/**
 * État tel que le bot l'a publié, champ à champ.
 *
 * Ces valeurs sont **aplatics** dans `bot_nodes.payload` (l'écran lit
 * `payload.qr`, `payload.pairingCode`, … sans second niveau) ; seule la
 * file de logs vit sous une clé dédiée.
 */
export type BotStatusReport = {
  connected?: boolean;
  number?: string | null;
  uptimeMs?: number;
  version?: string;
  prefix?: string;
  /** Nombre de commandes chargées par le bot. */
  commands?: number;
  groups?: number;
  engine?: string;
  connectMethod?: 'qr' | 'pairing';
  /** QR brut ou data-URL. */
  qr?: string | null;
  pairingCode?: string | null;
  pairingFor?: string | null;
};

export type BotLogLine = { t: number; line: string };

/** `payload` de `bot_nodes` : dernier état reçu + 200 derniers logs. */
export type BotNodePayload = BotStatusReport & { logs: BotLogLine[] };

/**
 * Un nœud = une instance du bot Node.js chez l'utilisateur.
 * `status` est conservé tel que publié ; l'écran recalcule `offline`
 * à la lecture dès que `last_seen_at` dépasse 30 s (aucun cron).
 */
export const botNodes = pgTable(
  'bot_nodes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    payload: jsonb('payload').$type<BotNodePayload>().notNull(),
    status: text('status').$type<BotNodeStatus>().notNull().default('offline'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex('bot_nodes_ws_name_uidx').on(t.workspaceId, t.name),
    index('bot_nodes_last_seen_idx').on(t.lastSeenAt),
  ],
);

/**
 * Une commande = un ordre posé par la console, en attente d'être
 * réclamé par le prochain `POST /api/bot/sync` du bot.
 */
export const botCommands = pgTable(
  'bot_commands',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<BotCommandKind>().notNull(),
    payload: text('payload'),
    status: text('status').$type<BotCommandStatus>().notNull().default('pending'),
    result: text('result'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [index('bot_commands_ws_status_created_idx').on(t.workspaceId, t.status, t.createdAt)],
);

/* ── Schéma agrégé (registre Drizzle) ─────────────────────────────── */

export const schema = {
  users,
  sessions,
  workspaces,
  workspaceMembers,
  rules,
  incidents,
  appeals,
  auditLog,
  botNodes,
  botCommands,
};

export type User = typeof users.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type Rule = typeof rules.$inferSelect;
export type Incident = typeof incidents.$inferSelect;
export type Appeal = typeof appeals.$inferSelect;
export type AuditEntry = typeof auditLog.$inferSelect;
export type BotNode = typeof botNodes.$inferSelect;
export type BotCommand = typeof botCommands.$inferSelect;
