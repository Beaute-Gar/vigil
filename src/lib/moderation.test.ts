import { describe, expect, it } from 'vitest';
import {
  APPEAL_TRANSITIONS,
  APPEAL_LABELS,
  INCIDENT_TRANSITIONS,
  STATUS_LABELS,
  canTransition,
  computeKpis,
  decideAppealState,
  resolveIncidentState,
} from '@/lib/moderation';

describe('machine à états des incidents', () => {
  it('autorise les deux issues depuis « ouvert »', () => {
    expect(resolveIncidentState('open', 'dismissed').ok).toBe(true);
    expect(resolveIncidentState('open', 'confirmed').ok).toBe(true);
  });

  it('fige un incident déjà tranché — pas de réouverture silencieuse', () => {
    const r = resolveIncidentState('dismissed', 'confirmed');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('already_final');
  });

  it('refuse une transition vers soi-même', () => {
    const r = resolveIncidentState('open', 'open');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('already_final');
  });

  it('n\'autorise jamais « ouvert » comme cible depuis un état final', () => {
    for (const from of ['dismissed', 'confirmed'] as const) {
      expect(canTransition(INCIDENT_TRANSITIONS, from, 'open')).toBe(false);
    }
  });

  it('ne déclare jamais une transition non déclarée comme légale', () => {
    for (const from of Object.keys(INCIDENT_TRANSITIONS) as (keyof typeof INCIDENT_TRANSITIONS)[]) {
      for (const to of Object.keys(INCIDENT_TRANSITIONS) as (keyof typeof INCIDENT_TRANSITIONS)[]) {
        const declared = INCIDENT_TRANSITIONS[from].includes(to);
        expect(canTransition(INCIDENT_TRANSITIONS, from, to)).toBe(declared);
      }
    }
  });
});

describe('machine à états des appels', () => {
  it('seul un appel en attente peut être tranché', () => {
    expect(decideAppealState('pending', 'granted').ok).toBe(true);
    expect(decideAppealState('pending', 'denied').ok).toBe(true);
    expect(decideAppealState('granted', 'denied').ok).toBe(false);
    expect(decideAppealState('denied', 'granted').ok).toBe(false);
  });

  it('aucun état final ne ramène à pending', () => {
    expect(canTransition(APPEAL_TRANSITIONS, 'granted', 'pending')).toBe(false);
    expect(canTransition(APPEAL_TRANSITIONS, 'denied', 'pending')).toBe(false);
  });
});

describe('libellés', () => {
  it('couvre tous les états sans trous (l\'UI ne doit jamais afficher undefined)', () => {
    for (const s of ['open', 'dismissed', 'confirmed'] as const) {
      expect(STATUS_LABELS[s]).toBeTruthy();
    }
    for (const s of ['pending', 'granted', 'denied'] as const) {
      expect(APPEAL_LABELS[s]).toBeTruthy();
    }
  });
});

describe('computeKpis', () => {
  it('compte correctement chaque état et chaque sévérité', () => {
    const k = computeKpis(
      [
        { status: 'open', severity: 'high' },
        { status: 'open', severity: 'low' },
        { status: 'dismissed', severity: 'medium' },
        { status: 'confirmed', severity: 'critical' },
      ],
      [{ status: 'pending' }],
    );

    expect(k).toMatchObject({
      open: 2,
      dismissed: 1,
      confirmed: 1,
      pendingAppeals: 1,
      bySeverity: { low: 1, medium: 1, high: 1, critical: 1 },
    });
  });

  it('calcule le taux d\'écartement sur les incidents tranchés seulement', () => {
    const k = computeKpis(
      [
        { status: 'dismissed', severity: 'low' },
        { status: 'dismissed', severity: 'low' },
        { status: 'confirmed', severity: 'high' },
        { status: 'open', severity: 'low' }, // ne compte pas au dénominateur
      ],
      [],
    );
    expect(k.dismissalRate).toBe(67); // 2 écartés / 3 tranchés
  });

  it('retourne 0 % et non NaN quand rien n\'est tranché', () => {
    const k = computeKpis([{ status: 'open', severity: 'low' }], []);
    expect(k.dismissalRate).toBe(0);
    expect(Number.isNaN(k.dismissalRate)).toBe(false);
  });

  it('gère le jeu vide', () => {
    const k = computeKpis([], []);
    expect(k).toMatchObject({ open: 0, dismissed: 0, confirmed: 0, pendingAppeals: 0 });
    expect(k.dismissalRate).toBe(0);
  });
});
