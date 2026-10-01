/**
 * Validation d'une règle de modération — Vigil.
 *
 * Deux garde-fous que le moteur ne peut pas poser lui, parce qu'il ne
 * doit JAMAIS rejeter une règle déjà en base (cf. `src/lib/rules.ts`,
 * décision n°4 : une regex cassée est isolée, pas lancée).
 *
 * En revanche, à l'écriture, on refuse ce qui ne devrait pas exister :
 *
 *  1. UNE REGEX QUI NE COMPILE PAS.
 *     `compilePattern` renverrait `null`, la règle serait silencieusement
 *     invisible dans `invalidRules`. Utile en lecture, inadmissible en
 *     création : l'auteur doit le voir tout de suite.
 *
 *  2. UNE ACTION TROP FAIBLE POUR SA SÉVÉRITÉ.
 *     Le moteur décide par sévérité maximale, puis retient l'action de
 *     *cette* règle-là. Une règle `critical` associée à `flag` serait donc
 *     le point de décision le plus grave du système… qui ne ferait rien.
 *     C'est précisément le scénario que la décision n°3 cherche à éviter :
 *     on échoue du côté sûr, y compris au moment de l'écriture.
 */

import { z } from 'zod';
import { ACTIONS, SEVERITIES } from '@/db/schema';
import { actionMeetsFloor, collectHits, compilePattern, SEVERITY_FLOOR } from '@/lib/rules';

/* ── Schéma ───────────────────────────────────────────────────────── */

export const RuleBody = z.object({
  name: z
    .string()
    .trim()
    .min(3, 'Le nom doit faire au moins 3 caractères.')
    .max(60, '60 caractères maximum.'),
  description: z
    .string()
    .trim()
    .min(10, 'La description doit faire au moins 10 caractères.')
    .max(200, '200 caractères maximum.'),
  /** Source d'une RegExp JavaScript — compilée à l'évaluation, pas stockée compilée */
  pattern: z
    .string()
    .trim()
    .min(1, 'Une expression régulière est obligatoire.')
    .max(300, '300 caractères maximum.'),
  severity: z.enum(SEVERITIES),
  action: z.enum(ACTIONS),
  priority: z.number().int().min(1, 'Priorité minimale : 1.').max(999, 'Priorité maximale : 999.'),
  enabled: z.boolean(),
});

export type RuleValues = z.infer<typeof RuleBody>;

/** Mise à jour partielle : le toggle n'envoie que `{ enabled }`. */
export const RulePatch = RuleBody.partial();

/**
 * Messages de repli pour les champs dont Zod parle anglais par défaut.
 * Le reste provient du schéma, déjà rédigé en français.
 */
const ISSUE_FALLBACK: Record<string, string> = {
  severity: 'Sévérité inconnue : low, medium, high ou critical.',
  action: 'Action inconnue : flag, warn, mute, remove ou escalate.',
  priority: 'La priorité doit être un entier entre 1 et 999.',
  enabled: 'État attendu : vrai ou faux.',
};

/**
 * Regroupe les issues Zod par champ — une seule erreur par champ, la
 * première étant la plus précise. Typé structurellement pour ne pas
 * exposer le type d'issue d'une version donnée de Zod.
 */
function issuesToErrors(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? 'form');
    if (errors[key]) continue;
    errors[key] = ISSUE_FALLBACK[key] ?? issue.message;
  }
  return Object.keys(errors).length > 0 ? errors : { form: 'Règle invalide.' };
}

export type RuleValidation =
  | { ok: true; value: RuleValues }
  | { ok: false; errors: Record<string, string> };

export type RulePatchValidation =
  | { ok: true; value: Partial<RuleValues> }
  | { ok: false; errors: Record<string, string> };

/**
 * Valide une **mise à jour partielle** : la forme du fragment seulement.
 *
 * La cohérence sévérité/action n'est pas vérifiable ici — elle dépend de
 * la règle existante. C'est `validateRule` qui la tranche, sur le résultat
 * de la fusion (voir le PATCH).
 */
export function validateRulePatch(input: unknown): RulePatchValidation {
  const parsed = RulePatch.safeParse(input);
  if (!parsed.success) return { ok: false, errors: issuesToErrors(parsed.error.issues) };
  return { ok: true, value: parsed.data };
}

/**
 * Valide une règle **complète** — pas un fragment.
 *
 * Le PATCH fusionne le fragment avec la règle existante avant d'appeler
 * cette fonction : c'est la règle *résultante* qui doit être cohérente,
 * sinon passer une règle de `low` à `critical` sans toucher à l'action
 * créerait exactement l'incohérence qu'on cherche à interdire.
 */
export function validateRule(input: unknown): RuleValidation {
  const parsed = RuleBody.safeParse(input);

  if (!parsed.success) return { ok: false, errors: issuesToErrors(parsed.error.issues) };

  const value = parsed.data;

  if (!compilePattern(value.pattern)) {
    return {
      ok: false,
      errors: {
        pattern:
          'Expression régulière invalide : vérifiez les parenthèses, crochets et barres obliques échappées.',
      },
    };
  }

  if (!actionMeetsFloor(value.severity, value.action)) {
    return {
      ok: false,
      errors: {
        action: `Une règle « ${value.severity} » doit au moins ${SEVERITY_FLOOR[value.severity]} : une sévérité élevée ne peut pas se contenter d’un signalement passif.`,
      },
    };
  }

  return { ok: true, value };
}

/* ── Aperçu côté client (même règle, même moteur) ─────────────────── */

/**
 * Teste une expression contre un échantillon **avec le moteur lui-même**
 * (`compilePattern` + `collectHits`) : l'aperçu promet exactement ce que
 * l'évaluation fera, ni plus ni moins.
 *
 * `null` = expression cassée, à afficher comme telle — jamais à planter.
 */
export function testPattern(pattern: string, sample: string): { hits: string[] } | null {
  const re = compilePattern(pattern);
  if (!re) return null;
  return { hits: collectHits(re, sample) };
}
