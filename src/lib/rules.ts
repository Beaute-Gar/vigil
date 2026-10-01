/**
 * Moteur de règles de modération — Vigil.
 *
 * Port conceptuel des 13 protections de DJOUSSE GUARD : des règles
 * évaluées dans un ordre explicite et déterministe.
 *
 * ── Décisions de conception (et pourquoi) ───────────────────────────
 *
 * 1. PRIORITÉ CROISSANTE.
 *    `priority` plus bas = consulté en premier. L'ordre est le contrat :
 *    un modérateur qui réordonne deux règles sait exactement ce qui change.
 *
 * 2. TOUTES les règles sont évaluées, pas seulement la première.
 *    On veut l'explication complète d'un signalement (« pourquoi ça a
 *    été signalé ? »), pas un verdict muet.
 *
 * 3. L'ACTION DÉCIDÉE est celle de la règle la PLUS SÉVÈRE, pas la
 *    première qui matche.
 *    Premier-match-wins serait dangereux : une règle « spam » (flag)
 *    en priorité 1 masquerait une règle « menace » (remove) en priorité 9.
 *    On échoue du côté sûr. L'ordre de *présentation* reste la priorité,
 *    l'ordre de *décision* reste la sévérité : explicable et sûr.
 *
 * 4. Une regex invalide n'interrompt JAMAIS l'évaluation.
 *    Elle est isolée et remontée dans `invalidRules` : une règle cassée
 *    doit se voir, pas faire tomber la chaîne de modération.
 */

import { ACTIONS, SEVERITIES, type Action, type Severity } from '@/db/schema';

/* ── Types ────────────────────────────────────────────────────────── */

/** Découpe minimum d'une règle — indépendante du stockage. */
export type RuleLike = {
  id: string;
  name: string;
  pattern: string;
  severity: Severity;
  action: Action;
  priority: number;
  enabled: boolean;
};

export type RuleMatch = {
  rule: RuleLike;
  /** Fragments du texte ayant déclenché la règle */
  hits: string[];
};

export type Evaluation = {
  /** Tous les matches, ordonnés par priorité croissante (d'abord la plus haute priorité) */
  matches: RuleMatch[];
  /** La sévérité la plus élevée parmi les matches, sinon null */
  severity: Severity | null;
  /** L'action décidée — celle de la règle la plus sévère, sinon null */
  action: Action | null;
  /** La règle qui a décidé de l'action */
  decidedBy: RuleLike | null;
  /** Identifiants de règles dont le pattern est invalide — jamais bloquant */
  invalidRules: { id: string; name: string; reason: string }[];
};

/* ── Classements ──────────────────────────────────────────────────── */

/** Rang de sévérité : plus haut = plus grave. */
const SEVERITY_RANK: Record<Severity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

export function severityRank(s: Severity): number {
  return SEVERITY_RANK[s];
}

export function compareSeverity(a: Severity, b: Severity): number {
  return SEVERITY_RANK[a] - SEVERITY_RANK[b];
}

/** Tri défensif : n'accepte que des sévérités connues, sinon `low`. */
export function maxSeverity(list: Severity[]): Severity | null {
  if (list.length === 0) return null;
  return list.reduce((acc, s) => (compareSeverity(s, acc) > 0 ? s : acc));
}

export function sortByPriority(rules: RuleLike[]): RuleLike[] {
  return [...rules].sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
}

export function isKnownAction(v: string): v is Action {
  return (ACTIONS as readonly string[]).includes(v);
}

export function isKnownSeverity(v: string): v is Severity {
  return (SEVERITIES as readonly string[]).includes(v);
}

/* ── Invariant de modèle : sévérité ↔ action ──────────────────────── */

/** Rang coercitif d'une action : plus haut = plus interventionniste. */
export const ACTION_RANK: Record<Action, number> = {
  flag: 0,
  warn: 1,
  mute: 2,
  remove: 3,
  escalate: 4,
};

/**
 * Action minimale admise pour chaque sévérité.
 *
 * Le moteur décide par sévérité maximale, puis retient l'action de
 * *cette* règle-là. Une règle `critical` associée à `flag` serait donc
 * le point de décision le plus grave du système… qui ne ferait rien.
 *
 * D'où un **plancher** : on échoue du côté sûr jusque dans l'écriture.
 * Ce n'est pas une correspondance unique — `critical` admet `remove`
 * *et* `escalate` (Menaces → remove, Hameçonnage → escalate en base),
 * car supprimer un contenu et le porter à un humain sont deux réponses
 * légitimes, pas deux degrés d'une même échelle.
 */
export const SEVERITY_FLOOR: Record<Severity, Action> = {
  low: 'flag',
  medium: 'warn',
  high: 'mute',
  critical: 'remove',
};

export function actionMeetsFloor(severity: Severity, action: Action): boolean {
  return ACTION_RANK[action] >= ACTION_RANK[SEVERITY_FLOOR[severity]];
}

/* ── Compilation & extraction ─────────────────────────────────────── */

/**
 * Compile une source en RegExp insensible à la casse.
 * `null` = pattern cassé (à remonter, jamais à faire échouer le process).
 *
 * Le flag `g` est ajouté pour collecter toutes les occurrences ;
 * `i` car la modération ne doit pas dépendre de la casse.
 */
export function compilePattern(source: string): RegExp | null {
  if (!source.trim()) return null;
  try {
    return new RegExp(source, 'gi');
  } catch {
    return null;
  }
}

/**
 * Extrait les fragments appariés, avec une protection contre les
 * regex zéro-largeur (`a*` renvoie '' et ferait tourner la boucle à l'infini).
 */
export function collectHits(re: RegExp, text: string): string[] {
  const hits: string[] = [];
  let m: RegExpExecArray | null;
  let guard = 0;

  re.lastIndex = 0;
  while ((m = re.exec(text)) !== null) {
    if (m[0] === '') {
      re.lastIndex += 1; // regex zéro-largeur : on avance manuellement
      continue;
    }
    hits.push(m[0]);
    if (++guard >= 1000) break; // plafond de sécurité
  }
  return hits;
}

/* ── Évaluation ───────────────────────────────────────────────────── */

/**
 * Évalue un contenu contre un jeu de règles.
 *
 * Aucune mutation d'entrée, aucun accès réseau, aucun accès base :
 * fonction pure, donc testable sans infrastructure.
 */
export function evaluateRules(content: string, rules: RuleLike[]): Evaluation {
  const invalidRules: Evaluation['invalidRules'] = [];
  const matches: RuleMatch[] = [];

  for (const rule of sortByPriority(rules)) {
    if (!rule.enabled) continue;

    const re = compilePattern(rule.pattern);
    if (!re) {
      invalidRules.push({
        id: rule.id,
        name: rule.name,
        reason: `expression régulière invalide : ${rule.pattern}`,
      });
      continue;
    }

    const hits = collectHits(re, content);
    if (hits.length > 0) matches.push({ rule, hits });
  }

  if (matches.length === 0) {
    return { matches, severity: null, action: null, decidedBy: null, invalidRules };
  }

  // Décision par sévérité maximale (cf. décision de conception n°3),
  // tie-break déterministe sur la priorité puis le nom.
  const decidedBy = matches.reduce((worst, m) => {
    const cmp = compareSeverity(m.rule.severity, worst.rule.severity);
    if (cmp > 0) return m;
    if (cmp < 0) return worst;
    if (m.rule.priority < worst.rule.priority) return m;
    if (m.rule.priority > worst.rule.priority) return worst;
    return m.rule.name.localeCompare(worst.rule.name) < 0 ? m : worst;
  });

  return {
    matches,
    severity: decidedBy.rule.severity,
    action: decidedBy.rule.action,
    decidedBy: decidedBy.rule,
    invalidRules,
  };
}

/**
 * Même chose, mais ne retourne que le verdict — la forme utilisée par
 * l'API et l'UI quand on n'a pas besoin de l'explication complète.
 */
export function decide(
  content: string,
  rules: RuleLike[],
): { severity: Severity | null; action: Action | null; ruleId: string | null } {
  const e = evaluateRules(content, rules);
  return {
    severity: e.severity,
    action: e.action,
    ruleId: e.decidedBy?.id ?? null,
  };
}
