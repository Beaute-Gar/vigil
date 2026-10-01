/**
 * Règles éditables — deux couches, deux preuves.
 *
 *  - **Unitaire** : le plancher sévérité/action et le rejet des regex
 *    cassées sont de la logique pure. Testées ici, sans base, en
 *    millisecondes : c'est le contrat que l'auteur d'une règle rencontre.
 *
 *  - **Intégration** : la journalisation append-only. On vérifie que la
 *    mutation ET sa ligne d'audit vont ensemble — ou qu'aucune des deux
 *    n'a lieu. C'est l'invariant du projet, il ne se prouve pas en
 *    unitaire.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '@/db';
import {
  createRule,
  getOrCreateWorkspace,
  listAudit,
  updateRule,
} from '@/lib/repository';
import {
  ACTION_RANK,
  actionMeetsFloor,
  SEVERITY_FLOOR,
} from '@/lib/rules';
import { validateRule, validateRulePatch } from '@/lib/rule-validation';

/* ── Données de base réutilisables ────────────────────────────────── */

const VALID = {
  name: 'Liens raccourcis',
  description: 'Détecte les URL raccourcies qui masquent la destination réelle.',
  pattern: '\\b(bit\\.ly|t\\.co|tinyurl)\\b',
  severity: 'high',
  action: 'mute',
  priority: 20,
  enabled: true,
} as const;

/* ══ Couche 1 : validation métier (pur) ═══════════════════════════ */

describe('validateRule', () => {
  it('accepte une règle cohérente', () => {
    const result = validateRule(VALID);
    expect(result.ok).toBe(true);
  });

  it('refuse une expression qui ne compile pas', () => {
    const result = validateRule({ ...VALID, pattern: '[(unclosed' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('non atteignable');
    expect(result.errors.pattern).toContain('invalide');
  });

  it('refuse une expression vide', () => {
    const result = validateRule({ ...VALID, pattern: '   ' });
    expect(result.ok).toBe(false);
  });

  it('borne le nom et la description', () => {
    const court = validateRule({ ...VALID, name: 'ab' });
    expect(court.ok).toBe(false);

    // 6 caractères < minimum de 10
    const trop = validateRule({ ...VALID, description: 'Court.' });
    expect(trop.ok).toBe(false);

    expect(validateRule({ ...VALID, description: 'Dix car.' }).ok).toBe(false);
  });

  it('borne la priorité à [1, 999]', () => {
    expect(validateRule({ ...VALID, priority: 0 }).ok).toBe(false);
    expect(validateRule({ ...VALID, priority: 1000 }).ok).toBe(false);
    expect(validateRule({ ...VALID, priority: 1 }).ok).toBe(true);
    expect(validateRule({ ...VALID, priority: 999 }).ok).toBe(true);
  });

  it('retourne les erreurs PAR CHAMP, en français', () => {
    const result = validateRule({ ...VALID, name: 'ab', priority: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('non atteignable');
    expect(result.errors.name).toBe('Le nom doit faire au moins 3 caractères.');
    expect(result.errors.priority).toBeDefined();
    expect(result.errors.pattern).toBeUndefined();
  });

  it('traduit les valeurs d’énumération inconnues', () => {
    const result = validateRule({ ...VALID, severity: 'apocalyptique' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('non atteignable');
    expect(result.errors.severity).toMatch(/^Sévérité inconnue/);
  });
});

describe('plancher sévérité → action', () => {
  it('couvre chaque sévérité', () => {
    expect(Object.keys(SEVERITY_FLOOR).sort()).toEqual(
      ['critical', 'high', 'low', 'medium'],
    );
    expect(ACTION_RANK.flag).toBeLessThan(ACTION_RANK.warn);
    expect(ACTION_RANK.mute).toBeLessThan(ACTION_RANK.remove);
  });

  it('interdit une action sous le plancher', () => {
    expect(actionMeetsFloor('critical', 'flag')).toBe(false);
    expect(actionMeetsFloor('critical', 'warn')).toBe(false);
    expect(actionMeetsFloor('critical', 'mute')).toBe(false);
    expect(actionMeetsFloor('high', 'warn')).toBe(false);
    expect(actionMeetsFloor('medium', 'flag')).toBe(false);
  });

  it('admet le plancher et tout ce qui le dépasse', () => {
    expect(actionMeetsFloor('critical', 'remove')).toBe(true);
    expect(actionMeetsFloor('critical', 'escalate')).toBe(true);
    expect(actionMeetsFloor('high', 'mute')).toBe(true);
    expect(actionMeetsFloor('high', 'escalate')).toBe(true);
    expect(actionMeetsFloor('low', 'flag')).toBe(true);
    expect(actionMeetsFloor('low', 'escalate')).toBe(true);
  });

  it('fait échouer la validation quand l’action est trop faible', () => {
    const result = validateRule({ ...VALID, severity: 'critical', action: 'flag' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('non atteignable');
    expect(result.errors.action).toContain('critical');
    expect(result.errors.action).toContain('remove');
  });

  it('accepte les deux réponses légitimes de `critical`', () => {
    // Menaces → remove, Hameçonnage → escalate : aucun n'est « plus juste ».
    expect(validateRule({ ...VALID, severity: 'critical', action: 'remove' }).ok).toBe(true);
    expect(validateRule({ ...VALID, severity: 'critical', action: 'escalate' }).ok).toBe(true);
  });
});

describe('validateRulePatch (fragment partiel)', () => {
  it('accepte le minimum du bouton de bascule', () => {
    const result = validateRulePatch({ enabled: false });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('non atteignable');
    expect(result.value).toEqual({ enabled: false });
  });

  it('n’exige aucun champ', () => {
    expect(validateRulePatch({}).ok).toBe(true);
  });

  it('ne vérifie PAS la cohérence sévérité/action', () => {
    // À ce stade on ne connaît pas la règle existante : c'est la fusion,
    // validée ensuite par `validateRule`, qui tranche.
    const result = validateRulePatch({ severity: 'critical', action: 'flag' });
    expect(result.ok).toBe(true);
  });

  it('rejette les fragments mal formés', () => {
    expect(validateRulePatch({ priority: 'douze' }).ok).toBe(false);
    expect(validateRulePatch({ enabled: 'oui' }).ok).toBe(false);
    expect(validateRulePatch(null).ok).toBe(false);
  });
});

/* ══ Couche 2 : persistance + journal append-only ══════════════════ */

describe('écriture des règles', () => {
  let db: Db;
  let workspaceId: string;
  const actor = { id: '', email: 'mod@vigil.app' };

  beforeAll(async () => {
    db = await createDb({ dir: null });
    const ws = await getOrCreateWorkspace(db, 'Espace règles');
    workspaceId = ws.id;
  });

  afterAll(async () => {
    // PGlite en mémoire n'a rien à persister
  });

  async function events(): Promise<string[]> {
    const rows = await listAudit(db, workspaceId);
    return rows.map((r) => r.event);
  }

  it('crée une règle et journalise `rule.created` dans la même opération', async () => {
    const outcome = await createRule(db, {
      workspaceId,
      value: { ...VALID },
      actor,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error('non atteignable');
    expect(outcome.rule.name).toBe(VALID.name);

    const rows = await listAudit(db, workspaceId);
    const entry = rows.find((r) => r.event === 'rule.created');
    expect(entry).toBeDefined();
    expect(entry?.details).toMatchObject({
      rule: VALID.name,
      severity: 'high',
      action: 'mute',
      priority: 20,
      by: actor.email,
    });
  });

  it('refuse un doublon et n’écrit AUCUNE ligne de journal', async () => {
    const before = (await events()).length;

    const outcome = await createRule(db, {
      workspaceId,
      value: { ...VALID, priority: 40 },
      actor,
    });

    expect(outcome).toEqual({ ok: false, reason: 'duplicate-name' });
    expect(await events()).toHaveLength(before);
  });

  it('ne modifie rien — et ne journalise rien — si la règle est inchangée', async () => {
    const created = await createRule(db, {
      workspaceId,
      value: {
        ...VALID,
        name: 'Hors sujet',
        description: 'Détecte les messages hors sujet répétés et insistants.',
        pattern: '\\bhors[- ]sujet\\b',
        severity: 'low',
        action: 'flag',
        priority: 30,
      },
      actor,
    });
    if (!created.ok) throw new Error('création impossible');

    const before = (await events()).length;

    const outcome = await updateRule(db, {
      ruleId: created.rule.id,
      value: { enabled: created.rule.enabled }, // même valeur que la base
      actor,
    });

    expect(outcome.ok).toBe(true);
    expect(await events()).toHaveLength(before);
  });

  it('journalise `rule.updated` avec les champs réellement modifiés', async () => {
    const created = await createRule(db, {
      workspaceId,
      value: {
        ...VALID,
        name: 'Insultes',
        description: 'Détecte les insultes directes adressées à un membre.',
        pattern: '\\b(idiot|imbécile)\\b',
        severity: 'high',
        action: 'mute',
        priority: 50,
      },
      actor,
    });
    if (!created.ok) throw new Error('création impossible');

    await updateRule(db, {
      ruleId: created.rule.id,
      value: { name: 'Insultes graves', priority: 55 },
      actor,
    });

    const rows = await listAudit(db, workspaceId);
    const updated = rows.find((r) => r.event === 'rule.updated');
    expect(updated).toBeDefined();
    expect(updated?.details).toMatchObject({
      rule: 'Insultes graves',
      priority: 55,
      changed: ['nom', 'priorité'],
      by: actor.email,
    });
  });

  it('garde l’activation comme événement distinct, jamais absorbé par `rule.updated`', async () => {
    const created = await createRule(db, {
      workspaceId,
      value: {
        ...VALID,
        name: 'Hameçonnage',
        description: 'Détecte l’hameçonnage : vol d’identifiants par usurpation.',
        pattern: '\\b(identifiant|mot de passe|vérifiez votre compte)\\b',
        severity: 'critical',
        action: 'escalate',
        priority: 95,
      },
      actor,
    });
    if (!created.ok) throw new Error('création impossible');

    const outcome = await updateRule(db, {
      ruleId: created.rule.id,
      value: { enabled: false },
      actor,
    });
    expect(outcome.ok).toBe(true);

    const rows = await listAudit(db, workspaceId);
    const toggle = rows.find((r) => r.event === 'rule.disabled');
    expect(toggle).toBeDefined();
    expect(toggle?.details).toMatchObject({ rule: 'Hameçonnage', by: actor.email });
    // Une bascule pure ne produit qu'UNE ligne, et ce n'est pas `rule.updated`.
    expect(rows.filter((r) => r.event === 'rule.updated' && r.details.rule === 'Hameçonnage')).toHaveLength(0);
  });

  it('journalise les deux événements quand on change tout en une fois', async () => {
    const created = await createRule(db, {
      workspaceId,
      value: {
        ...VALID,
        name: 'Spam commercial',
        description: 'Détecte les messages promotionnels non sollicités en masse.',
        pattern: '\\b(promo|unique|achetez maintenant)\\b',
        severity: 'low',
        action: 'flag',
        priority: 10,
      },
      actor,
    });
    if (!created.ok) throw new Error('création impossible');

    const before = (await events()).length;

    await updateRule(db, {
      ruleId: created.rule.id,
      value: { enabled: false, priority: 12 },
      actor,
    });

    // `listAudit` est en ordre DESC : les lignes fraîches sont en tête.
    const rows = await listAudit(db, workspaceId);
    const fresh = rows.slice(0, rows.length - before).map((r) => r.event);

    expect(fresh).toHaveLength(2);
    expect(fresh).toContain('rule.disabled');
    expect(fresh).toContain('rule.updated');
    expect(await events()).toHaveLength(before + 2);
  });

  it('échoue proprement sur une règle inconnue', async () => {
    const outcome = await updateRule(db, {
      ruleId: '00000000-0000-4000-8000-000000000000',
      value: { enabled: false },
      actor,
    });
    expect(outcome).toEqual({ ok: false });
  });
});
