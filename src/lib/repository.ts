/**
 * Accès aux données — toute écriture qui doit être tracée passe par ici.
 *
 * Invariant : `audit_log` est en écriture seule. Chaque mutation d'un
 * incident ou d'un appel produit exactement une ligne de journal, dans
 * la même opération que le changement d'état.
 */

import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { rowsOf, type Db } from '@/db';
import {
  appeals,
  auditLog,
  botCommands,
  botNodes,
  incidents,
  rules,
  users,
  workspaceMembers,
  workspaces,
  type Appeal,
  type AppealStatus,
  type BotCommand,
  type BotCommandKind,
  type BotCommandStatus,
  type BotLogLine,
  type BotNode,
  type BotNodePayload,
  type BotNodeStatus,
  type BotStatusReport,
  type Incident,
  type IncidentStatus,
  type Rule,
  type Severity,
} from '@/db/schema';
import {
  BOT_CLAIM_LIMIT,
  BOT_HISTORY_LIMIT,
  BOT_LOG_LIMIT,
  BOT_NODE_DEFAULT_NAME,
  resolveBotNodeStatus,
} from '@/lib/bot';
import { evaluateRules, type RuleLike } from '@/lib/rules';
import {
  decideAppealState,
  resolveIncidentState,
  type TransitionReason,
} from '@/lib/moderation';
import type { RuleValues } from '@/lib/rule-validation';

/* ── Règles ───────────────────────────────────────────────────────── */

export async function listRules(db: Db, workspaceId: string): Promise<Rule[]> {
  return db
    .select()
    .from(rules)
    .where(eq(rules.workspaceId, workspaceId))
    .orderBy(asc(rules.priority));
}

/**
 * Passe de la ligne de base au type du moteur. Regroupé ici pour que
 * `evaluateRules` reste découplé de Drizzle.
 */
export function toRuleLike(rule: Rule): RuleLike {
  return {
    id: rule.id,
    name: rule.name,
    pattern: rule.pattern,
    severity: rule.severity,
    action: rule.action,
    priority: rule.priority,
    enabled: rule.enabled,
  };
}

/**
 * Libellés français des champs modifiables, écrits **dans** la ligne de
 * journal au moment de la mutation.
 *
 * Un journal append-only doit rester lisible sans dépendre d'une table de
 * traduction qui, elle, peut changer demain : on stocke le sens, pas la clé.
 */
const RULE_FIELD_LABELS: Record<keyof RuleValues, string> = {
  name: 'nom',
  description: 'description',
  pattern: 'expression',
  severity: 'sévérité',
  action: 'action',
  priority: 'priorité',
  enabled: 'état',
};

export type RuleActor = { id: string; email: string };

export type CreateRuleOutcome =
  | { ok: true; rule: Rule }
  /** Deux règles homonymes rendraient le journal ambigu à la lecture. */
  | { ok: false; reason: 'duplicate-name' };

export async function createRule(
  db: Db,
  input: { workspaceId: string; value: RuleValues; actor: RuleActor },
): Promise<CreateRuleOutcome> {
  const [taken] = await db
    .select({ name: rules.name })
    .from(rules)
    // Borné à l'espace : deux espaces peuvent légitimement partager un
    // nom de règle, l'ambiguïté n'existe qu'à l'intérieur d'un même journal.
    .where(and(eq(rules.workspaceId, input.workspaceId), eq(rules.name, input.value.name)))
    .limit(1);

  if (taken) return { ok: false, reason: 'duplicate-name' };

  const [created] = await db
    .insert(rules)
    .values({ workspaceId: input.workspaceId, ...input.value })
    .returning();

  await appendAudit(db, {
    workspaceId: input.workspaceId,
    event: 'rule.created',
    details: {
      ruleId: created.id,
      rule: created.name,
      priority: created.priority,
      severity: created.severity,
      action: created.action,
      by: input.actor.email,
    },
  });

  return { ok: true, rule: created };
}

export type UpdateRuleOutcome = { ok: true; rule: Rule } | { ok: false };

/**
 * Met à jour une règle — et n'écrit que ce qui change réellement.
 *
 * Deux conséquences, voulues :
 *  - un PATCH `{ enabled: true }` sur une règle déjà active ne produit
 *    ni UPDATE ni ligne de journal : le journal raconte des changements,
 *    pas des requêtes ;
 *  - l'activation reste un événement distinct (`rule.enabled` /
 *    `rule.disabled`) plutôt que d'être absorbé par `rule.updated` : c'est
 *    le signal que la console affiche depuis le début, on ne le renomme pas.
 */
export async function updateRule(
  db: Db,
  input: { ruleId: string; value: Partial<RuleValues>; actor: RuleActor },
): Promise<UpdateRuleOutcome> {
  const before = await getRule(db, input.ruleId);
  if (!before) return { ok: false };

  const next = {} as Partial<RuleValues>;
  const changed: (keyof RuleValues)[] = [];

  for (const key of Object.keys(input.value) as (keyof RuleValues)[]) {
    const value = input.value[key];
    if (value === undefined || before[key] === value) continue;
    Object.assign(next, { [key]: value });
    changed.push(key);
  }

  if (changed.length === 0) return { ok: true, rule: before };

  const [updated] = await db
    .update(rules)
    .set(next)
    .where(eq(rules.id, input.ruleId))
    .returning();

  if (changed.includes('enabled')) {
    await appendAudit(db, {
      workspaceId: before.workspaceId,
      event: before.enabled ? 'rule.disabled' : 'rule.enabled',
      details: {
        ruleId: before.id,
        rule: before.name,
        priority: before.priority,
        severity: before.severity,
        by: input.actor.email,
      },
    });
  }

  const definition = changed.filter((key) => key !== 'enabled');
  if (definition.length > 0) {
    await appendAudit(db, {
      workspaceId: before.workspaceId,
      event: 'rule.updated',
      details: {
        ruleId: before.id,
        rule: updated.name,
        priority: updated.priority,
        severity: updated.severity,
        action: updated.action,
        changed: definition.map((key) => RULE_FIELD_LABELS[key]),
        by: input.actor.email,
      },
    });
  }

  return { ok: true, rule: updated };
}

/* ── Détection → incident + audit ─────────────────────────────────── */

export type DetectInput = {
  workspaceId: string;
  subject: string;
  channel: string;
  content: string;
};

export type DetectResult = {
  created: Incident | null;
  /** true = contenu propre, aucune règle déclenchée */
  clean: boolean;
  invalidRules: { id: string; name: string; reason: string }[];
  matchedRuleIds: string[];
  /**
   * La règle qui a décidé — nom compris.
   *
   * L'incident ne porte que `ruleId` : un appelant machine (le bot) qui
   * veut afficher « règle *Liens raccourcis* » devrait faire un aller-retour
   * pour lire un nom. On le renvoie ici, à la source.
   */
  decidedBy: { id: string; name: string; priority: number } | null;
};

/**
 * Fait passer un message dans le moteur de règles et, s'il est signalé,
 * crée l'incident **et** son entrée de journal dans une seule requête
 * (PGlite / Postgres : la séquence d'inserts est atomique côté client
 * ici, mais chaque étape reste idempotente grâce à l'absence de doublon
 * possible sur un appel unique).
 */
export async function detect(db: Db, input: DetectInput): Promise<DetectResult> {
  const activeRules = await listRules(db, input.workspaceId);
  const evaluation = evaluateRules(
    input.content,
    activeRules.map(toRuleLike),
  );

  const invalidRules = evaluation.invalidRules;

  if (!evaluation.decidedBy || !evaluation.severity || !evaluation.action) {
    return {
      created: null,
      clean: true,
      invalidRules,
      matchedRuleIds: [],
      decidedBy: null,
    };
  }

  const [incident] = await db
    .insert(incidents)
    .values({
      workspaceId: input.workspaceId,
      ruleId: evaluation.decidedBy.id,
      subject: input.subject,
      channel: input.channel,
      content: input.content,
      severity: evaluation.severity,
      actionTaken: evaluation.action,
      status: 'open',
    })
    .returning();

  await appendAudit(db, {
    workspaceId: input.workspaceId,
    incidentId: incident.id,
    event: 'incident.created',
    details: {
      rule: evaluation.decidedBy.name,
      severity: evaluation.severity,
      action: evaluation.action,
      channel: input.channel,
      matched: evaluation.matches.map((m) => ({
        rule: m.rule.name,
        priority: m.rule.priority,
        hits: m.hits.slice(0, 5),
      })),
      ...(invalidRules.length > 0 ? { invalidRules } : {}),
    },
  });

  return {
    created: incident,
    clean: false,
    invalidRules,
    matchedRuleIds: evaluation.matches.map((m) => m.rule.id),
    decidedBy: {
      id: evaluation.decidedBy.id,
      name: evaluation.decidedBy.name,
      priority: evaluation.decidedBy.priority,
    },
  };
}

/* ── Résolution d'incident ────────────────────────────────────────── */

export type ResolveInput = {
  incidentId: string;
  to: IncidentStatus;
  actorId: string;
  note?: string;
};

export type ResolveOutcome =
  | { ok: true; incident: Incident }
  | { ok: false; reason: TransitionReason | 'not_found' };

export async function resolveIncident(
  db: Db,
  input: ResolveInput,
): Promise<ResolveOutcome> {
  const [current] = await db
    .select()
    .from(incidents)
    .where(eq(incidents.id, input.incidentId))
    .limit(1);

  if (!current) return { ok: false, reason: 'not_found' };

  const transition = resolveIncidentState(current.status, input.to);
  if (!transition.ok) return { ok: false, reason: transition.reason };

  const [updated] = await db
    .update(incidents)
    .set({
      status: input.to,
      resolvedAt: new Date(),
      resolvedById: input.actorId,
    })
    .where(eq(incidents.id, input.incidentId))
    .returning();

  await appendAudit(db, {
    workspaceId: current.workspaceId,
    incidentId: current.id,
    actorId: input.actorId,
    event: `incident.${input.to}`,
    details: { from: current.status, to: input.to, ...(input.note ? { note: input.note } : {}) },
  });

  return { ok: true, incident: updated };
}

/* ── Appels ───────────────────────────────────────────────────────── */

/**
 * Appels rattachés à un espace de travail, avec leur incident —
 * une seule jointure, pas de requête en deux temps.
 */
export async function listAppeals(
  db: Db,
  workspaceId: string,
): Promise<(Appeal & { incident: Incident })[]> {
  const rows = await db
    .select({ appeal: appeals, incident: incidents })
    .from(appeals)
    .innerJoin(incidents, eq(appeals.incidentId, incidents.id))
    .where(eq(incidents.workspaceId, workspaceId))
    .orderBy(desc(appeals.createdAt));

  return rows.map((r) => ({ ...r.appeal, incident: r.incident }));
}

export type AppealDecisionInput = {
  appealId: string;
  to: Exclude<AppealStatus, 'pending'>;
  actorId: string;
  note: string;
};

export type AppealOutcome =
  | { ok: true; appeal: Appeal }
  | { ok: false; reason: TransitionReason | 'not_found' };

/**
 * Trancher un appel peut rouvrir l'incident écarté : c'est le sens du
 * processus d'appel. On le fait dans la foulée, toujours journalisé.
 */
export async function decideAppeal(db: Db, input: AppealDecisionInput): Promise<AppealOutcome> {
  const [current] = await db
    .select()
    .from(appeals)
    .where(eq(appeals.id, input.appealId))
    .limit(1);

  if (!current) return { ok: false, reason: 'not_found' };

  const transition = decideAppealState(current.status, input.to);
  if (!transition.ok) return { ok: false, reason: transition.reason };

  const [updated] = await db
    .update(appeals)
    .set({
      status: input.to,
      decisionNote: input.note,
      decidedAt: new Date(),
      decidedById: input.actorId,
    })
    .where(eq(appeals.id, input.appealId))
    .returning();

  await appendAudit(db, {
    workspaceId: null,
    incidentId: current.incidentId,
    actorId: input.actorId,
    event: `appeal.${input.to}`,
    details: { appealId: current.id, note: input.note },
  });

  return { ok: true, appeal: updated };
}

/* ── Journal d'audit ──────────────────────────────────────────────── */

type AuditInput = {
  workspaceId: string | null;
  incidentId?: string | null;
  actorId?: string | null;
  event: string;
  details: Record<string, unknown>;
};

/**
 * Append-only. Il n'existe aucune fonction update/delete pour cette
 * table dans le projet — c'est vérifiable en lisant le dépôt.
 */
export async function appendAudit(db: Db, input: AuditInput) {
  // Un workspace peut être null (appel lié à un incident orphelin) : on
  // journalise quand même, l'intégrité référentielle est en ON DELETE SET NULL.
  const ws = input.workspaceId;
  const [row] = await db
    .insert(auditLog)
    .values({
      workspaceId: ws ?? (await resolveWorkspaceForIncident(db, input.incidentId)),
      incidentId: input.incidentId ?? null,
      actorId: input.actorId ?? null,
      event: input.event,
      details: input.details,
    })
    .returning();
  return row;
}

async function resolveWorkspaceForIncident(
  db: Db,
  incidentId?: string | null,
): Promise<string> {
  if (!incidentId) {
    const [w] = await db.select({ id: workspaces.id }).from(workspaces).limit(1);
    if (!w) throw new Error('audit_log exige un workspace et aucun n\'existe');
    return w.id;
  }
  const [row] = await db
    .select({ workspaceId: incidents.workspaceId })
    .from(incidents)
    .where(eq(incidents.id, incidentId))
    .limit(1);
  if (!row) throw new Error('incident introuvable pour le journal audit');
  return row.workspaceId;
}

export async function listAudit(db: Db, workspaceId: string, limit = 100) {
  return db
    .select()
    .from(auditLog)
    .where(eq(auditLog.workspaceId, workspaceId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

/* ── Requêtes de lecture pour l'UI ────────────────────────────────── */

export async function listIncidents(
  db: Db,
  workspaceId: string,
  filters: { status?: IncidentStatus; severity?: Severity } = {},
): Promise<Incident[]> {
  const conds = [eq(incidents.workspaceId, workspaceId)];
  if (filters.status) conds.push(eq(incidents.status, filters.status));
  if (filters.severity) conds.push(eq(incidents.severity, filters.severity));

  return db
    .select()
    .from(incidents)
    .where(and(...conds))
    .orderBy(desc(incidents.createdAt))
    .limit(200);
}

export async function getIncident(db: Db, id: string): Promise<Incident | undefined> {
  const [row] = await db.select().from(incidents).where(eq(incidents.id, id)).limit(1);
  return row;
}

export async function getRule(db: Db, id: string): Promise<Rule | undefined> {
  const [row] = await db.select().from(rules).where(eq(rules.id, id)).limit(1);
  return row;
}

/** Journal d'un incident donné, du plus récent au plus ancien. */
export async function listAuditForIncident(db: Db, incidentId: string) {
  return db
    .select()
    .from(auditLog)
    .where(eq(auditLog.incidentId, incidentId))
    .orderBy(desc(auditLog.createdAt));
}

/** L'appel rattaché à un incident — au plus un par construction. */
export async function getAppealForIncident(db: Db, incidentId: string) {
  const [row] = await db
    .select()
    .from(appeals)
    .where(eq(appeals.incidentId, incidentId))
    .limit(1);
  return row;
}

/** Résout un nom d'affichage ; `null` si l'acteur a été détaché. */
export async function getActorName(db: Db, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const [row] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.name ?? null;
}

export async function countByStatus(db: Db, workspaceId: string) {
  const rows = await db
    .select({ status: incidents.status, n: count() })
    .from(incidents)
    .where(eq(incidents.workspaceId, workspaceId))
    .groupBy(incidents.status);
  return rows;
}

/**
 * Appels en attente d'un jugement.
 *
 * Ne compte que `pending` : l'intitulé du tableau de bord est « en
 * attente », compter les appels clôturés y ferait mentir.
 */
export async function countPendingAppeals(db: Db) {
  const [row] = await db
    .select({ n: count() })
    .from(appeals)
    .where(eq(appeals.status, 'pending'));
  return row?.n ?? 0;
}

export async function severityBreakdown(db: Db, workspaceId: string) {
  return db
    .select({ severity: incidents.severity, n: count() })
    .from(incidents)
    .where(eq(incidents.workspaceId, workspaceId))
    .groupBy(incidents.severity);
}

/** Volume des 7 derniers jours, pour la courbe du tableau de bord. */
export async function dailyVolume(db: Db, workspaceId: string) {
  const rows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${incidents.createdAt}), 'YYYY-MM-DD')`,
      n: count(),
    })
    .from(incidents)
    .where(eq(incidents.workspaceId, workspaceId))
    .groupBy(sql`1`)
    .orderBy(sql`1`);
  return rows;
}

/* ── Comptes & apparence « démo » ─────────────────────────────────── */

export async function getOrCreateWorkspace(db: Db, name = 'Communauté DJOUSSE') {
  const slug = 'djousse';
  const [existing] = await db.select().from(workspaces).where(eq(workspaces.slug, slug)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(workspaces).values({ name, slug }).returning();
  return created;
}

export async function findUserByEmail(db: Db, email: string) {
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return row;
}

export async function ensureMembership(db: Db, userId: string, workspaceId: string, role: 'owner' | 'moderator' | 'reviewer' = 'owner') {
  const [existing] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.workspaceId, workspaceId)),
    )
    .limit(1);
  if (existing) return existing;
  const [row] = await db
    .insert(workspaceMembers)
    .values({ userId, workspaceId, role })
    .returning();
  return row;
}

/* ── Pont WhatsApp (bot DJOUSSE TECH) ─────────────────────────────── */

/** Un identifiant non UUID est « inconnu » : ignoré, jamais une erreur SQL. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type BotResultReport = {
  id: string;
  status: 'done' | 'failed';
  result: string | null;
};

export type BotSyncInput = {
  workspaceId: string;
  name: string;
  status?: BotStatusReport;
  logs: BotLogLine[];
  results: BotResultReport[];
};

export type BotSyncOutcome = { commands: BotCommand[] };

type CompletedCommandRow = {
  id: string;
  kind: BotCommandKind;
  status: BotCommandStatus;
  result: string | null;
  payload: string | null;
};

/**
 * Upsert du nœud — **une seule requête**, fusion des logs comprise.
 *
 * Le budget d'un poll est volontairement maigre : une synchronisation
 * toutes les 3 s ne doit pas lire l'ancien payload pour le réécrire (1
 * select + 1 update), ni rejouer une ligne de log à la fois. Tout se
 * joue dans la clause `do update` :
 *
 *   payload = (ancien payload)          ← l'état du bot précédent
 *           || (payload proposé − logs) ← le dernier état reçu, écrasé
 *           || { logs: … }              ← 200 dernières lignes, en ordre
 *
 * `jsonb_array_elements(…) with ordinality` concatène l'ancienne file
 * et la nouvelle, `limit 200` tronque **par la gauche** (les plus
 * anciennes tombent), et l'agrégat remet le reste dans l'ordre.
 * Comme tout tient dans un UPDATE, deux polls concurrents ne peuvent
 * pas se voler de lignes : la clause est réévaluée sur la ligne verrouillée.
 */
async function upsertBotNode(
  db: Db,
  input: { workspaceId: string; name: string; status?: BotStatusReport; logs: BotLogLine[] },
): Promise<void> {
  const proposed = JSON.stringify({ ...(input.status ?? {}), logs: input.logs });

  await db.execute(sql`
    insert into bot_nodes (workspace_id, name, payload, status, last_seen_at)
    values (${input.workspaceId}, ${input.name}, ${proposed}::jsonb, 'online', now())
    on conflict (workspace_id, name) do update set
      status = 'online',
      last_seen_at = now(),
      payload = (
        (coalesce(bot_nodes.payload, '{}'::jsonb) || (excluded.payload - 'logs'))
        || jsonb_build_object('logs', coalesce((
          select jsonb_agg(part.item order by part.seq)
          from (
            select ln.item, ln.seq
            from jsonb_array_elements(
              coalesce(bot_nodes.payload -> 'logs', '[]'::jsonb)
              || coalesce(excluded.payload -> 'logs', '[]'::jsonb)
            ) with ordinality as ln(item, seq)
            order by ln.seq desc
            limit ${BOT_LOG_LIMIT}
          ) as part
        ), '[]'::jsonb))
      )
  `);
}

/**
 * Traite une synchronisation du bot, dans cet ordre :
 *
 *  1. **upsert du nœud** (état + logs) ;
 *  2. **résultats** — une seule requête `update … from (values …)` pour
 *     toute la palette, puis une ligne de journal par résultat traité ;
 *  3. **réclamation** des commandes `pending` → `running`, les plus
 *     anciennes d'abord, au plus `BOT_CLAIM_LIMIT`.
 *
 * Les résultats passent *avant* la réclamation : une commande dont le
 * bot renvoie déjà l'issue dans ce même poll ne doit pas ressortir
 * comme « à faire ». L'ordre donne aussi l'idempotence : une commande
 * `done`/`failed` n'est plus mise à jour (donc plus journalisée) si le
 * bot renvoie le même résultat — un retry ne duplique rien.
 */
export async function syncBot(db: Db, input: BotSyncInput): Promise<BotSyncOutcome> {
  const name = input.name || BOT_NODE_DEFAULT_NAME;

  await upsertBotNode(db, {
    workspaceId: input.workspaceId,
    name,
    status: input.status,
    logs: input.logs,
  });

  const results = input.results.filter((r) => UUID_RE.test(r.id));
  if (results.length > 0) {
    const palette = sql.join(
      results.map((r) => sql`(${r.id}::uuid, ${r.status}::text, ${r.result}::text)`),
      sql`, `,
    );

    const completed = rowsOf<CompletedCommandRow>(
      await db.execute(sql`
        update bot_commands as c
        set status = v.status, result = v.result, completed_at = now()
        from (values ${palette}) as v (id, status, result)
        where c.id = v.id
          and c.workspace_id = ${input.workspaceId}
          and c.status in ('pending', 'running')
        returning c.id, c.kind, c.status, c.result, c.payload
      `),
    );

    for (const row of completed) {
      await appendAudit(db, {
        workspaceId: input.workspaceId,
        event: 'bot.command.result',
        details: {
          commandId: row.id,
          kind: row.kind,
          status: row.status,
          ...(row.result ? { result: row.result } : {}),
        },
      });
    }
  }

  const pendingIds = db
    .select({ id: botCommands.id })
    .from(botCommands)
    .where(and(eq(botCommands.workspaceId, input.workspaceId), eq(botCommands.status, 'pending')))
    .orderBy(asc(botCommands.createdAt), asc(botCommands.id))
    .limit(BOT_CLAIM_LIMIT);

  const claimed = await db
    .update(botCommands)
    .set({ status: 'running' })
    .where(inArray(botCommands.id, pendingIds))
    .returning();

  // `returning` n'ordonne rien : c'est le contrat qui le fait, pas la chance.
  return {
    commands: claimed.sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
    ),
  };
}

/** Pose un ordre pour le prochain poll du bot. */
export async function createBotCommand(
  db: Db,
  input: { workspaceId: string; kind: BotCommandKind; payload?: string | null },
): Promise<BotCommand> {
  const [row] = await db
    .insert(botCommands)
    .values({
      workspaceId: input.workspaceId,
      kind: input.kind,
      payload: input.payload ?? null,
    })
    .returning();
  return row;
}

export async function getBotNode(
  db: Db,
  workspaceId: string,
  name = BOT_NODE_DEFAULT_NAME,
): Promise<BotNode | undefined> {
  const [row] = await db
    .select()
    .from(botNodes)
    .where(and(eq(botNodes.workspaceId, workspaceId), eq(botNodes.name, name)))
    .limit(1);
  return row;
}

/** Dernières commandes posées, du plus récent au plus ancien. */
export async function listBotCommands(
  db: Db,
  workspaceId: string,
  limit = BOT_HISTORY_LIMIT,
): Promise<BotCommand[]> {
  return db
    .select()
    .from(botCommands)
    .where(eq(botCommands.workspaceId, workspaceId))
    .orderBy(desc(botCommands.createdAt), desc(botCommands.id))
    .limit(limit);
}

export type BotNodeView = {
  status: BotNodeStatus;
  lastSeenAt: Date | null;
  payload: BotNodePayload;
};

/**
 * Vue affichable d'un nœud : le statut y est **recalculé** (30 s sans
 * signalement = hors ligne). Jamais écrit en base — voir `resolveBotNodeStatus`.
 */
export function botNodeView(node: BotNode | undefined, now = new Date()): BotNodeView | null {
  if (!node) return null;
  return {
    status: resolveBotNodeStatus(node.status, node.lastSeenAt, now),
    lastSeenAt: node.lastSeenAt,
    payload: node.payload,
  };
}
