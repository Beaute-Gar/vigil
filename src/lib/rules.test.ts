import { describe, expect, it } from 'vitest';
import {
  collectHits,
  compilePattern,
  decide,
  evaluateRules,
  maxSeverity,
  sortByPriority,
  type RuleLike,
} from '@/lib/rules';

let seq = 0;
function rule(partial: Partial<RuleLike> = {}): RuleLike {
  seq += 1;
  return {
    id: partial.id ?? `r${seq}`,
    name: partial.name ?? `règle ${seq}`,
    pattern: partial.pattern ?? 'placeholder',
    severity: partial.severity ?? 'low',
    action: partial.action ?? 'flag',
    priority: partial.priority ?? seq,
    enabled: partial.enabled ?? true,
  };
}

describe('compilePattern', () => {
  it('compile en insensible à la casse et collecte tout', () => {
    const re = test_re();
    expect(re?.flags).toContain('i');
    expect(re?.flags).toContain('g');
  });

  it('refuse une expression invalide au lieu de lever', () => {
    expect(compilePattern('[unclosed')).toBeNull();
    expect(compilePattern('')).toBeNull();
    expect(compilePattern('   ')).toBeNull();
  });
});

function test_re() {
  return compilePattern('spam');
}

describe('collectHits', () => {
  it('retourne toutes les occurrences', () => {
    const re = compilePattern('piou')!;
    expect(collectHits(re, 'piou piou piou')).toHaveLength(3);
  });

  it('ne boucle pas à l\'infini sur une regex de largeur nulle', () => {
    const re = compilePattern('a*')!;
    const hits = collectHits(re, 'bbb');
    expect(hits).toEqual([]);
    expect(hits).toHaveLength(0);
  });

  it('ne boucle pas non plus quand la regex matche partout', () => {
    const re = compilePattern('\\b')!;
    expect(collectHits(re, 'un deux trois').length).toBeLessThan(1000);
  });
});

describe('sortByPriority', () => {
  it('ordonne par priorité croissante, avec repli déterministe', () => {
    const rules = [
      rule({ priority: 9, name: 'z' }),
      rule({ priority: 1, name: 'b' }),
      rule({ priority: 1, name: 'a' }),
    ];
    expect(sortByPriority(rules).map((r) => r.name)).toEqual(['a', 'b', 'z']);
  });

  it('ne mute pas le tableau d\'entrée', () => {
    const rules = [rule({ priority: 9 }), rule({ priority: 1 })];
    const copy = [...rules];
    sortByPriority(rules);
    expect(rules).toEqual(copy);
  });
});

describe('evaluateRules — ordre et couverture', () => {
  it('évalue toutes les règles et les présente par priorité', () => {
    const spam = rule({ name: 'spam', pattern: 'achetez', priority: 1 });
    const threat = rule({ name: 'menace', pattern: 'je vais vous', priority: 9, severity: 'critical', action: 'remove' });

    const out = evaluateRules('achetez vite, je vais vous trouver', [threat, spam]);

    expect(out.matches.map((m) => m.rule.name)).toEqual(['spam', 'menace']);
    expect(out.invalidRules).toEqual([]);
  });

  it('ignore les règles désactivées', () => {
    const off = rule({ pattern: 'secret', enabled: false });
    expect(evaluateRules('un secret', [off]).matches).toHaveLength(0);
  });

  it('retourne un verdict vide quand rien ne matche', () => {
    const out = evaluateRules('bonjour à tous', [rule({ pattern: 'spam' })]);
    expect(out).toMatchObject({ matches: [], severity: null, action: null, decidedBy: null });
  });
});

describe('evaluateRules — décision par sévérité (décision de conception n°3)', () => {
  it('ne prend PAS la première règle qui matche : la plus sévère gagne', () => {
    const spam = rule({ name: 'spam', pattern: 'achetez', priority: 1, severity: 'low', action: 'flag' });
    const threat = rule({ name: 'menace', pattern: 'je vais vous', priority: 9, severity: 'critical', action: 'remove' });

    const out = evaluateRules('achetez vite, je vais vous trouver', [spam, threat]);

    // Présentation = priorité croissante (spam d'abord)
    expect(out.matches[0].rule.name).toBe('spam');
    // Décision = sévérité maximale (menace)
    expect(out.decidedBy?.name).toBe('menace');
    expect(out.action).toBe('remove');
    expect(out.severity).toBe('critical');
  });

  it('découpe déterministe à sévérité égale : la priorité gagne', () => {
    const a = rule({ name: 'a', pattern: 'x', priority: 1, severity: 'high', action: 'warn' });
    const b = rule({ name: 'b', pattern: 'y', priority: 5, severity: 'high', action: 'mute' });

    expect(decide('x y', [a, b]).ruleId).toBe(a.id);
    expect(decide('x y', [b, a]).ruleId).toBe(a.id);
  });
});

describe('evaluateRules — robustesse', () => {
  it('une regex cassée est isolée, pas bloquante', () => {
    const broken = rule({ name: 'cassée', pattern: '[fermé', priority: 1 });
    const ok = rule({ name: 'ok', pattern: 'spam', priority: 2, severity: 'high', action: 'mute' });

    const out = evaluateRules('du spam ici', [broken, ok]);

    expect(out.invalidRules).toHaveLength(1);
    expect(out.invalidRules[0]).toMatchObject({ name: 'cassée' });
    // La règle saine a quand même été appliquée
    expect(out.decidedBy?.name).toBe('ok');
    expect(out.action).toBe('mute');
  });

  it('une règle cassée seule ne lève jamais', () => {
    const broken = rule({ pattern: '((' });
    expect(() => evaluateRules('texte', [broken])).not.toThrow();
    expect(evaluateRules('texte', [broken]).matches).toHaveLength(0);
  });

  it('est insensible à la casse', () => {
    expect(decide('SPAM detected', [rule({ pattern: 'spam' })]).ruleId).toBeTruthy();
    expect(decide('SpAm detected', [rule({ pattern: 'spam' })]).ruleId).toBeTruthy();
  });
});

describe('maxSeverity', () => {
  it('retourne la plus grave', () => {
    expect(maxSeverity(['low', 'critical', 'medium'])).toBe('critical');
    expect(maxSeverity(['low'])).toBe('low');
  });

  it('gère la liste vide', () => {
    expect(maxSeverity([])).toBeNull();
  });
});

describe('decide — forme compacte', () => {
  it('renvoie l\'identifiant de la règle décisionnaire', () => {
    const r = rule({ pattern: 'lien', severity: 'medium', action: 'warn', priority: 3 });
    expect(decide('voici un lien', [r])).toEqual({
      severity: 'medium',
      action: 'warn',
      ruleId: r.id,
    });
  });

  it('renvoie des nulls sur contenu propre', () => {
    expect(decide('tout va bien', [rule({ pattern: 'lien' })])).toEqual({
      severity: null,
      action: null,
      ruleId: null,
    });
  });
});
