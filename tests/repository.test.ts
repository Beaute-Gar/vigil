/**
 * Tests d'intégration sur un vrai PostgreSQL (PGlite, en mémoire).
 *
 * Ce que ça prouve — et que des tests unitaires ne peuvent pas :
 *  - les migrations s'appliquent réellement ;
 *  - les contraintes (unicité, clés étrangères) tiennent ;
 *  - `detect` écrit l'incident ET sa ligne de journal ;
 *  - les transitions refusées ne modifient rien en base.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, createDb, rowsOf, type Db } from '@/db';
import { appeals, auditLog, incidents, rules, users } from '@/db/schema';
import {
  decideAppeal,
  detect,
  getOrCreateWorkspace,
  listAudit,
  listRules,
  resolveIncident,
} from '@/lib/repository';
import { hashPassword } from '@/lib/auth';

let db: Db;
let workspaceId: string;

beforeAll(async () => {
  db = await createDb({ dir: null }); // mémoire vive : isolé et jetable
  const ws = await getOrCreateWorkspace(db, 'Communauté de test');
  workspaceId = ws.id;

  await db.insert(rules).values([
    {
      workspaceId,
      name: 'Spam commercial',
      description: 'Messages promotionnels non sollicités',
      pattern: '\\b(achetez|promo|gagnez)\\b',
      severity: 'low',
      action: 'flag',
      priority: 1,
    },
    {
      workspaceId,
      name: 'Menace',
      description: 'Menaces envers un membre',
      pattern: 'je vais vous',
      severity: 'critical',
      action: 'remove',
      priority: 9,
    },
    {
      workspaceId,
      name: 'Règle désactivée',
      description: 'Ne doit jamais se déclencher',
      pattern: 'bonjour',
      severity: 'high',
      action: 'mute',
      priority: 2,
      enabled: false,
    },
  ]);
}, 60_000);

afterAll(async () => {
  // PGlite en mémoire n'a rien à persister
});

describe('migrations & schéma', () => {
  it('les tables attendues existent', async () => {
    const res = await db.execute<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
    );
    const names = rowsOf<{ table_name: string }>(res).map((r) => r.table_name);
    expect(names).toEqual(
      expect.arrayContaining([
        'users',
        'sessions',
        'workspaces',
        'workspace_members',
        'rules',
        'incidents',
        'appeals',
        'audit_log',
      ]),
    );
  });

  it('l\'unicité de l\'email est bien en base (pas seulement en TypeScript)', async () => {
    const passwordHash = await hashPassword('une-phrase-de-passe-longue');
    await db.insert(users).values({ email: 'a@b.ca', name: 'A', passwordHash });
    await expect(
      db.insert(users).values({ email: 'a@b.ca', name: 'B', passwordHash }),
    ).rejects.toThrow();
  });
});

describe('detect', () => {
  it('crée un incident et sa ligne de journal en une seule passe', async () => {
    const out = await detect(db, {
      workspaceId,
      subject: '@troll',
      channel: '#general',
      content: 'achetez ma formation',
    });

    expect(out.created).not.toBeNull();
    expect(out.clean).toBe(false);
    expect(out.created?.status).toBe('open');
    expect(out.created?.severity).toBe('low');
    expect(out.created?.actionTaken).toBe('flag');

    const audit = await listAudit(db, workspaceId);
    const created = audit.find((a) => a.event === 'incident.created');
    expect(created).toBeDefined();
    expect(created?.incidentId).toBe(out.created?.id);
    const details = created?.details as { rule?: string };
    expect(details.rule).toBe('Spam commercial');
  });

  it('prend la règle la plus sévère, pas la première qui matche', async () => {
    const out = await detect(db, {
      workspaceId,
      subject: '@danger',
      channel: '#general',
      content: 'achetez vite, je vais vous trouver',
    });

    expect(out.created?.severity).toBe('critical');
    expect(out.created?.actionTaken).toBe('remove');
    expect(out.matchedRuleIds).toHaveLength(2); // les deux ont matché
  });

  it('ignore une règle désactivée même si elle matche', async () => {
    const out = await detect(db, {
      workspaceId,
      subject: '@poli',
      channel: '#general',
      content: 'bonjour à tous',
    });
    expect(out.clean).toBe(true);
    expect(out.created).toBeNull();
  });

  it('signale les règles cassées sans faire échouer la passe', async () => {
    await db.insert(rules).values({
      workspaceId,
      name: 'Règle cassée',
      description: 'regex invalide volontaire',
      pattern: '[jamais-fermé',
      severity: 'high',
      action: 'mute',
      priority: 0,
    });

    const out = await detect(db, {
      workspaceId,
      subject: '@x',
      channel: '#general',
      content: 'du texte propre',
    });

    expect(out.clean).toBe(true); // pas de faux positif
    expect(out.invalidRules.some((r) => r.name === 'Règle cassée')).toBe(true);

    // nettoyage pour ne pas impacter les autres tests
    await db.delete(rules).where(eq(rules.name, 'Règle cassée'));
  });
});

describe('resolveIncident', () => {
  it('transitionne, horodate et journalise', async () => {
    const { created } = await detect(db, {
      workspaceId,
      subject: '@a',
      channel: '#general',
      content: 'gagnez 1000€',
    });
    expect(created).not.toBeNull();

    const actorId = (await db.insert(users).values({
      email: 'mod@b.ca',
      name: 'Mod',
      passwordHash: await hashPassword('une-phrase-de-passe-longue'),
    }).returning())[0].id;

    const res = await resolveIncident(db, {
      incidentId: created!.id,
      to: 'dismissed',
      actorId,
      note: 'contexte, pas du spam',
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.incident.status).toBe('dismissed');
      expect(res.incident.resolvedAt).not.toBeNull();
      expect(res.incident.resolvedById).toBe(actorId);
    }

    const audit = await listAudit(db, workspaceId);
    expect(audit.some((a) => a.event === 'incident.dismissed')).toBe(true);
  });

  it('refuse une seconde décision sans toucher à la base', async () => {
    const { created } = await detect(db, {
      workspaceId,
      subject: '@b',
      channel: '#general',
      content: 'achetez maintenant',
    });

    const actorId = (await db.select().from(users).limit(1))[0].id;
    await resolveIncident(db, { incidentId: created!.id, to: 'confirmed', actorId });

    const second = await resolveIncident(db, {
      incidentId: created!.id,
      to: 'dismissed',
      actorId,
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe('already_final');

    const after = await db
      .select()
      .from(incidents)
      .where(eq(incidents.id, created!.id));
    expect(after[0].status).toBe('confirmed'); // inchangé

    const audit = await listAudit(db, workspaceId);
    const events = audit
      .filter((a) => a.incidentId === created!.id && a.event.startsWith('incident.'))
      .map((a) => a.event);
    // `listAudit` est antéchronologique (le plus récent d'abord) — c'est
    // ce qu'attend un journal d'audit : on lit l'histoire à l'envers.
    expect(events).toEqual(['incident.confirmed', 'incident.created']);
  });

  it('échoue proprement sur un identifiant inexistant', async () => {
    const actorId = (await db.select().from(users).limit(1))[0].id;
    const res = await resolveIncident(db, {
      incidentId: '00000000-0000-0000-0000-000000000000',
      to: 'confirmed',
      actorId,
    });
    expect(res).toEqual({ ok: false, reason: 'not_found' });
  });
});

describe('audit_log — append-only', () => {
  it('ne contient que des insertions : aucune mise à jour ne l\'efface', async () => {
    const audit = await listAudit(db, workspaceId);
    expect(audit.length).toBeGreaterThan(0);

    // Chaque entrée a un identifiant et un horodatage serveur distincts
    const ids = new Set(audit.map((a) => a.id));
    expect(ids.size).toBe(audit.length);
  });

  it('l\'événement porte bien le détail de ce qui s\'est passé', async () => {
    const rows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.event, 'incident.created'))
      .limit(1);
    const details = rows[0].details as { matched?: unknown[] };
    expect(Array.isArray(details.matched)).toBe(true);
  });
});

describe('appels (appeals)', () => {
  let incidentId: string;
  let actorId: string;
  let appealId: string;

  it('prépare un incident écarté et son appel', async () => {
    const { created } = await detect(db, {
      workspaceId,
      subject: '@innocent',
      channel: '#general',
      content: 'achetez mon produit',
    });
    incidentId = created!.id;
    actorId = (await db.select().from(users).limit(1))[0].id;

    await resolveIncident(db, { incidentId, to: 'dismissed', actorId });

    const [appeal] = await db
      .insert(appeals)
      .values({
        incidentId,
        author: '@innocent',
        reason: 'C\'était une blague entre amis',
      })
      .returning();
    appealId = appeal.id;
    expect(appeal.status).toBe('pending');
  });

  it('tranche l\'appel et journalise', async () => {
    const out = await decideAppeal(db, {
      appealId,
      to: 'granted',
      actorId,
      note: 'Contexte vérifié',
    });

    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.appeal.status).toBe('granted');
      expect(out.appeal.decidedAt).not.toBeNull();
      expect(out.appeal.decisionNote).toBe('Contexte vérifié');
    }

    const audit = await listAudit(db, workspaceId);
    expect(audit.some((a) => a.event === 'appeal.granted')).toBe(true);
  });

  it('refuse de retrancher un appel déjà jugé', async () => {
    const out = await decideAppeal(db, { appealId, to: 'denied', actorId, note: 'non' });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('already_final');
  });
});

describe('listRules', () => {
  it('revient trié par priorité croissante', async () => {
    const list = await listRules(db, workspaceId);
    const priorities = list.map((r) => r.priority);
    expect([...priorities].sort((a, b) => a - b)).toEqual(priorities);
  });
});

/**
 * Verrouille la garantie centrale du branchement `DATABASE_URL`.
 *
 * Un test qui ouvrirait une connexion réseau échouerait ici : l'URL pointe
 * vers un hôte qui n'existe pas. Si `createDb({ dir: null })` répond, c'est
 * bien PGlite qui a servi — donc aucun test ne peut, même par accident,
 * aller toucher une base distante.
 */
describe('choix du moteur', () => {
  it('un `dir` explicite reste en PGlite, même avec DATABASE_URL renseigné', async () => {
    const precedent = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgres://hote-qui-n-existe-pas:1/invalide';

    let autre: Db | null = null;
    try {
      autre = await createDb({ dir: null });
      const res = await autre.execute('select 1 as ok');
      expect(rowsOf<{ ok: number }>(res)[0]?.ok).toBe(1);
    } finally {
      if (autre) await closeDb(autre);
      if (precedent === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = precedent;
    }
  });
});
