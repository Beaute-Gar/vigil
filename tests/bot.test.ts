/**
 * Tests du pont WhatsApp — le contrat entre le site et le bot.
 *
 * Deux moitiés, indissociables :
 *  - la **validation** (Zod) : messages en français, clé = champ fautif ;
 *  - l'**exécution** sur PGlite : la fusion des logs à 200 lignes, la
 *    réclamation des commandes, l'idempotence des résultats et le
 *    journal d'audit se vérifient contre un vrai PostgreSQL.
 *
 * Le budget d'un poll (1 upsert + 1 réclamation + 1 update résultats)
 * est la contrainte centrale : ces tests le verrouillent par le
 * comportement, pas par un compteur de requêtes.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { createDb, type Db } from '@/db';
import { botCommands, botNodes, workspaces, type BotLogLine } from '@/db/schema';
import {
  BOT_CLAIM_LIMIT,
  BOT_LOG_LIMIT,
  BOT_NODE_DEFAULT_NAME,
  resolveBotNodeStatus,
  validateBotCommand,
  validateBotSync,
} from '@/lib/bot';
import { formatLastSeen, formatUptime } from '@/lib/bot-format';
import {
  botNodeView,
  createBotCommand,
  getBotNode,
  getOrCreateWorkspace,
  listAudit,
  listBotCommands,
  syncBot,
} from '@/lib/repository';

let db: Db;
let workspaceId: string;
let annexId: string;

const NO_SYNC = { logs: [], results: [] };

function countResults(wsId: string): Promise<number> {
  return listAudit(db, wsId).then((rows) =>
    rows.filter((r) => r.event === 'bot.command.result').length,
  );
}

beforeAll(async () => {
  db = await createDb({ dir: null }); // mémoire vive : isolé et jetable
  workspaceId = (await getOrCreateWorkspace(db, 'Pont principal')).id;
  const [annex] = await db
    .insert(workspaces)
    .values({ name: 'Pont annexe', slug: 'annexe' })
    .returning();
  annexId = annex.id;
}, 60_000);

/* ── Validation ─────────────────────────────────────────────────── */

describe('validation de la synchronisation', () => {
  it('applique les défauts du contrat sur un corps vide', () => {
    const parsed = validateBotSync({});
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.name).toBe('DJOUSSE-TECH-MD');
    expect(parsed.value.logs).toEqual([]);
    expect(parsed.value.results).toEqual([]);
    expect(parsed.value.status).toBeUndefined();
  });

  it('conserve un statut complet tel quel', () => {
    const parsed = validateBotSync({
      name: 'DJOUSSE-TECH-MD',
      status: {
        connected: true,
        number: '237652746693:20',
        uptimeMs: 123456,
        version: '4.0.0',
        prefix: '.',
        commands: 309,
        groups: 22,
        engine: 'sqlite',
        connectMethod: 'qr',
        qr: '27@abc',
        pairingCode: 'ABCD-EFGH',
        pairingFor: '237693978044',
      },
      logs: [{ t: 1770000000000, line: '[SOCKET] ✅ CONNECTÉ' }],
      results: [{ id: 'a81d50f5-1f5a-4c53-9d6f-1a9d0f2b7c11', status: 'done', result: 'OK' }],
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.status?.number).toBe('237652746693:20');
    expect(parsed.value.status?.connectMethod).toBe('qr');
    expect(parsed.value.results[0]).toEqual({
      id: 'a81d50f5-1f5a-4c53-9d6f-1a9d0f2b7c11',
      status: 'done',
      result: 'OK',
    });
  });

  it('refuse plus de 50 lignes de log, en français', () => {
    const parsed = validateBotSync({
      logs: Array.from({ length: 51 }, (_, i) => ({ t: i, line: `ligne ${i}` })),
    });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors.logs).toBe('50 lignes de log maximum par synchronisation.');
  });

  it('nomme le champ fautif, y compris imbriqué', () => {
    const parsed = validateBotSync({ status: { connected: 'oui' } });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors['status.connected']).toBe('« connected » doit être un booléen.');
  });

  it('nomme la ligne fautive dans un tableau', () => {
    const parsed = validateBotSync({ logs: [{ t: 1, line: 'ok' }, { t: 'pas-un-nombre' }] });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors['logs.1.t']).toBe(
      'Chaque log doit porter un horodatage « t » entier, en millisecondes.',
    );
  });

  it('traite `status: null` comme une absence d’état', () => {
    const parsed = validateBotSync({ status: null });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.status).toBeUndefined();
  });

  it('refuse un statut de résultat inconnu', () => {
    const parsed = validateBotSync({
      results: [{ id: 'a81d50f5-1f5a-4c53-9d6f-1a9d0f2b7c11', status: 'ok' }],
    });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors['results.0.status']).toBe(
      'Statut de résultat inconnu : done ou failed.',
    );
  });
});

describe('validation d’une commande', () => {
  it('exige un payload pour `pairing` et `raw`', () => {
    const pairing = validateBotCommand({ kind: 'pairing' });
    expect(pairing.ok).toBe(false);
    if (!pairing.ok) expect(pairing.errors.payload).toContain('numéro de téléphone');

    const raw = validateBotCommand({ kind: 'raw', payload: '   ' });
    expect(raw.ok).toBe(false);
    if (!raw.ok) expect(raw.errors.payload).toContain('obligatoire');
  });

  it('accepte les commandes sans payload', () => {
    for (const kind of ['qr', 'status', 'stop'] as const) {
      const parsed = validateBotCommand({ kind });
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(parsed.value.payload).toBeNull();
    }
  });

  it('borne le payload à 500 caractères et refuse un kind inconnu', () => {
    const tooLong = validateBotCommand({ kind: 'raw', payload: 'x'.repeat(501) });
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) expect(tooLong.errors.payload).toBe('500 caractères maximum.');

    const bogus = validateBotCommand({ kind: 'reboot' });
    expect(bogus.ok).toBe(false);
    if (!bogus.ok) expect(bogus.errors.kind).toContain('Type de commande inconnu');
  });

  it('rogne le payload', () => {
    const parsed = validateBotCommand({ kind: 'raw', payload: '  .antilink on  ' });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.payload).toBe('.antilink on');
  });
});

/* ── Logique pure ───────────────────────────────────────────────── */

describe('formatage', () => {
  it('formate l’uptime en hh:mm:ss, sans plafond à 24 h', () => {
    expect(formatUptime(0)).toBe('00:00:00');
    expect(formatUptime(45_000)).toBe('00:00:45');
    expect(formatUptime(3_661_000)).toBe('01:01:01');
    expect(formatUptime(90_061_000)).toBe('25:01:01');
    expect(formatUptime(-1)).toBe('—');
  });

  it('raconte la distance depuis le dernier signalement', () => {
    expect(formatLastSeen(0)).toBe("à l'instant");
    expect(formatLastSeen(12_000)).toBe('il y a 12 s');
    expect(formatLastSeen(90_000)).toBe('il y a 1 min');
    expect(formatLastSeen(7_200_000)).toBe('il y a 2 h 0 min');
  });
});

describe('statut calculé à la lecture', () => {
  const seen = new Date('2026-10-06T12:00:00.000Z');

  it('descend en offline au-delà de 30 s sans signalement', () => {
    expect(resolveBotNodeStatus('online', seen, seen)).toBe('online');
    expect(resolveBotNodeStatus('online', seen, new Date(seen.getTime() + 29_000))).toBe(
      'online',
    );
    expect(resolveBotNodeStatus('online', seen, new Date(seen.getTime() + 31_000))).toBe(
      'offline',
    );
  });

  it('n’invente jamais de signalement', () => {
    expect(resolveBotNodeStatus('online', null, seen)).toBe('offline');
  });

  it('ne corrige pas un état stocké plus rare qu’`online`', () => {
    expect(resolveBotNodeStatus('stale', seen, seen)).toBe('stale');
    expect(resolveBotNodeStatus('stale', seen, new Date(seen.getTime() + 60_000))).toBe(
      'offline',
    );
  });
});

/* ── Exécution : nœud + logs ────────────────────────────────────── */

describe('synchronisation du nœud', () => {
  it('crée le nœud, l’horodate et y écrit l’état reçu', async () => {
    await syncBot(db, {
      workspaceId,
      name: BOT_NODE_DEFAULT_NAME,
      status: {
        connected: true,
        number: '237652746693:20',
        uptimeMs: 123456,
        version: '4.0.0',
        prefix: '.',
        commands: 309,
        groups: 22,
        engine: 'sqlite',
        connectMethod: 'qr',
        qr: '27@abc',
        pairingCode: null,
        pairingFor: null,
      },
      logs: [{ t: 1770000000000, line: '[SOCKET] ✅ CONNECTÉ' }],
      results: [],
    });

    const node = await getBotNode(db, workspaceId);
    expect(node).toBeDefined();
    expect(node?.name).toBe(BOT_NODE_DEFAULT_NAME);
    expect(node?.status).toBe('online');
    expect(node?.lastSeenAt).toBeInstanceOf(Date);
    expect(node?.payload.number).toBe('237652746693:20');
    expect(node?.payload.version).toBe('4.0.0');
    expect(node?.payload.logs.map((l) => l.line)).toEqual(['[SOCKET] ✅ CONNECTÉ']);
  });

  it('ajoute les nouveaux logs en fin de file, sans en perdre', async () => {
    await syncBot(db, {
      workspaceId,
      name: BOT_NODE_DEFAULT_NAME,
      status: { connected: true },
      logs: [{ t: 1770000001000, line: '[CMD] .ping' }],
      results: [],
    });

    const node = await getBotNode(db, workspaceId);
    expect(node?.payload.logs.map((l) => l.line)).toEqual([
      '[SOCKET] ✅ CONNECTÉ',
      '[CMD] .ping',
    ]);
    // Un statut partiel n’efface pas les champs qu’il ne mentionne pas.
    expect(node?.payload.number).toBe('237652746693:20');
  });

  it('ne touche qu’aux logs quand aucun statut n’accompagne le poll', async () => {
    await syncBot(db, {
      workspaceId,
      name: BOT_NODE_DEFAULT_NAME,
      logs: [{ t: 1770000002000, line: '[SYNC] sans état' }],
      results: [],
    });

    const node = await getBotNode(db, workspaceId);
    expect(node?.payload.number).toBe('237652746693:20');
    expect(node?.payload.connected).toBe(true);
    expect(node?.payload.logs.map((l) => l.line)).toEqual([
      '[SOCKET] ✅ CONNECTÉ',
      '[CMD] .ping',
      '[SYNC] sans état',
    ]);
    expect(node?.status).toBe('online');
  });

  it('reste unique par espace : deux polls, une seule ligne', async () => {
    const rows = await db
      .select()
      .from(botNodes)
      .where(and(eq(botNodes.workspaceId, workspaceId), eq(botNodes.name, BOT_NODE_DEFAULT_NAME)));
    expect(rows).toHaveLength(1);
  });

  it('ne conserve que les 200 derniers logs, en tronquant par la gauche', async () => {
    const name = 'TRONCATURE';
    const history: BotLogLine[] = [];

    for (let poll = 0; poll < 6; poll++) {
      const batch: BotLogLine[] = Array.from({ length: 50 }, (_, i) => ({
        t: poll * 1000 + i,
        line: `poll${poll}-ligne${i}`,
      }));
      history.push(...batch);
      await syncBot(db, { workspaceId, name, logs: batch, results: [] });

      const node = await getBotNode(db, workspaceId, name);
      const kept = node?.payload.logs ?? [];
      expect(kept.length).toBeLessThanOrEqual(BOT_LOG_LIMIT);
      expect(kept.map((l) => l.line)).toEqual(
        history.slice(-BOT_LOG_LIMIT).map((l) => l.line),
      );
    }
  });
});

/* ── Exécution : commandes ──────────────────────────────────────── */

describe('réclamation des commandes', () => {
  it('les renvoie aux plus anciennes d’abord, une seule fois', async () => {
    const c1 = await createBotCommand(db, { workspaceId, kind: 'status' });
    const c2 = await createBotCommand(db, {
      workspaceId,
      kind: 'pairing',
      payload: '237693978044',
    });
    const c3 = await createBotCommand(db, { workspaceId, kind: 'raw', payload: '.antilink on' });

    // Des horodatages explicites : l’ordre du contrat ne se joue pas
    // au hasard des microsecondes.
    const base = Date.now() - 60_000;
    await db
      .update(botCommands)
      .set({ createdAt: new Date(base - 30_000) })
      .where(eq(botCommands.id, c1.id));
    await db
      .update(botCommands)
      .set({ createdAt: new Date(base - 20_000) })
      .where(eq(botCommands.id, c2.id));
    await db
      .update(botCommands)
      .set({ createdAt: new Date(base - 10_000) })
      .where(eq(botCommands.id, c3.id));

    const first = await syncBot(db, { workspaceId, name: BOT_NODE_DEFAULT_NAME, ...NO_SYNC });
    expect(first.commands.map((c) => c.id)).toEqual([c1.id, c2.id, c3.id]);
    expect(first.commands.map((c) => c.kind)).toEqual(['status', 'pairing', 'raw']);
    expect(first.commands[1].payload).toBe('237693978044');
    expect(first.commands.every((c) => c.status === 'running')).toBe(true);

    // Elles sont `running` : le poll suivant ne doit pas les rejouer.
    const second = await syncBot(db, { workspaceId, name: BOT_NODE_DEFAULT_NAME, ...NO_SYNC });
    expect(second.commands).toEqual([]);
  });

  it('ne réclame jamais plus de 20 commandes par passage', async () => {
    for (let i = 0; i < BOT_CLAIM_LIMIT + 5; i++) {
      await createBotCommand(db, { workspaceId: annexId, kind: 'status' });
    }

    const { commands } = await syncBot(db, {
      workspaceId: annexId,
      name: 'ANNEXE',
      ...NO_SYNC,
    });
    expect(commands).toHaveLength(BOT_CLAIM_LIMIT);

    const stillPending = await db
      .select()
      .from(botCommands)
      .where(and(eq(botCommands.workspaceId, annexId), eq(botCommands.status, 'pending')));
    expect(stillPending).toHaveLength(5);
  });

  it('livre l’historique du plus récent au plus ancien', async () => {
    const rows = await listBotCommands(db, workspaceId, 20);
    expect(rows.length).toBeGreaterThan(0);
    const times = rows.map((r) => r.createdAt.getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });
});

/* ── Exécution : résultats + audit ──────────────────────────────── */

describe('résultats de commandes', () => {
  it('clôt la commande, l’horodate et journalise l’issue', async () => {
    const cmd = await createBotCommand(db, {
      workspaceId,
      kind: 'raw',
      payload: '.antilink on',
    });

    const { commands } = await syncBot(db, {
      workspaceId,
      name: BOT_NODE_DEFAULT_NAME,
      logs: [],
      results: [{ id: cmd.id, status: 'done', result: 'antilink activé' }],
    });

    // Déjà jugée dans ce même poll : elle ne repart pas en file.
    expect(commands.map((c) => c.id)).not.toContain(cmd.id);

    const [row] = await db
      .select()
      .from(botCommands)
      .where(eq(botCommands.id, cmd.id));
    expect(row.status).toBe('done');
    expect(row.result).toBe('antilink activé');
    expect(row.completedAt).toBeInstanceOf(Date);

    const audits = (await listAudit(db, workspaceId)).filter(
      (a) => a.event === 'bot.command.result',
    );
    expect(audits).toHaveLength(1);
    const details = audits[0].details as { commandId?: string; kind?: string; status?: string };
    expect(details.commandId).toBe(cmd.id);
    expect(details.kind).toBe('raw');
    expect(details.status).toBe('done');
  });

  it('est idempotent : un résultat renvoyé deux fois ne double rien', async () => {
    const cmd = await createBotCommand(db, { workspaceId, kind: 'stop' });
    const result = { id: cmd.id, status: 'failed' as const, result: 'arrêt refusé' };

    await syncBot(db, { workspaceId, name: BOT_NODE_DEFAULT_NAME, logs: [], results: [result] });
    const [first] = await db.select().from(botCommands).where(eq(botCommands.id, cmd.id));

    const before = await countResults(workspaceId);
    await syncBot(db, { workspaceId, name: BOT_NODE_DEFAULT_NAME, logs: [], results: [result] });
    const [again] = await db.select().from(botCommands).where(eq(botCommands.id, cmd.id));

    expect(again.status).toBe('failed');
    expect(again.result).toBe('arrêt refusé');
    expect(again.completedAt?.getTime()).toBe(first.completedAt?.getTime());
    expect(await countResults(workspaceId)).toBe(before);
  });

  it('ignore silencieusement un identifiant inconnu ou mal formé', async () => {
    const before = await countResults(workspaceId);

    await syncBot(db, {
      workspaceId,
      name: BOT_NODE_DEFAULT_NAME,
      logs: [],
      results: [
        { id: '00000000-0000-0000-0000-000000000000', status: 'failed', result: 'fantôme' },
        { id: 'pas-un-uuid', status: 'done', result: 'boiteux' },
      ],
    });

    expect(await countResults(workspaceId)).toBe(before);
  });

  it('ne touche jamais à une commande d’un autre espace de travail', async () => {
    const foreign = await createBotCommand(db, { workspaceId: annexId, kind: 'status' });

    await syncBot(db, {
      workspaceId,
      name: BOT_NODE_DEFAULT_NAME,
      logs: [],
      results: [{ id: foreign.id, status: 'done', result: 'détourné' }],
    });

    const [row] = await db.select().from(botCommands).where(eq(botCommands.id, foreign.id));
    expect(row.status).toBe('pending');
    expect(row.result).toBeNull();
  });
});

/* ── Vue affichée ───────────────────────────────────────────────── */

describe('vue de l’écran', () => {
  it('recalcule offline à la lecture, sans jamais l’écrire', async () => {
    const node = await getBotNode(db, workspaceId);
    const now = new Date();

    expect(botNodeView(node, now)?.status).toBe('online');
    expect(botNodeView(node, new Date(now.getTime() + 31_000))?.status).toBe('offline');

    // La base, elle, n’a pas bougé.
    const stored = await getBotNode(db, workspaceId);
    expect(stored?.status).toBe('online');
  });

  it('renvoie null tant qu’aucun bot ne s’est présenté', async () => {
    expect(await getBotNode(db, annexId)).toBeUndefined();
    expect(botNodeView(undefined)).toBeNull();
  });
});
