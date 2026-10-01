# Vigil

> **Trust & Safety console for online communities.**
> Ordered moderation rules, explainable verdicts, an appeal queue, and an append-only audit trail.

[![CI](https://github.com/Beaute-Gar/vigil/actions/workflows/ci.yml/badge.svg)](https://github.com/Beaute-Gar/vigil/actions/workflows/ci.yml)
![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Drizzle-4169E1?logo=postgresql&logoColor=white)
![Tests](https://img.shields.io/badge/tests-85%20passed-brightgreen)

**Live · English below · [Version française](#version-française)**

---

## The problem this solves

Moderation tooling usually answers *"was it flagged?"* and nothing else. That is not enough:

- A rule fires, but nobody can say **which rule, in what order, and why**.
- A moderator changes their mind, and **the history changes with it** — or worse, quietly disappears.
- A broken regular expression takes down the whole detection chain.

Vigil is built around the opposite: **every verdict is explainable, every state change is recorded, and nothing can be un-written.**

### Five design decisions that carry the whole product

| # | Decision | Why it matters |
|---|---|---|
| 1 | **Ascending priority** | The order *is* the contract. Reordering two rules changes exactly what should change — and nothing else. |
| 2 | **All rules are evaluated**, not just the first match | You can answer *"why was this flagged?"* with the full set of matches, not a mute verdict. |
| 3 | **The highest-severity action wins**, never the first match | First-match-wins is dangerous: a `flag` rule at priority 1 could mask a `remove` threat rule at priority 9. The system fails safe. |
| 4 | **A broken rule never breaks the chain** | An invalid regex is isolated and reported in `invalidRules`, never thrown. A broken rule should be *seen* — it should not stop moderation. |
| 5 | **A severity/action floor, enforced on write** | Decision 3 keeps the *most severe* rule's action. So a `critical` rule paired with `flag` would be the system's most important decision — doing nothing. The write path refuses that pair, and the form shows it before you submit. |

Presentation order stays the priority order; **decision** order is severity. Both are defensible in a review.

Rules are **edited, never deleted**: incidents store a `rule_id`, and `ON DELETE SET NULL` would silently turn a flagged message into "flagged by nobody". Deactivating a rule keeps the explanation intact.

---

## What's inside

**Moderation**
- Ordered rules with priority, severity, action, and a per-rule on/off switch
- **Create and edit rules in the console** — with live feedback: the regex is compiled as you type, the severity/action floor is checked before submit, and the preview runs the *actual* rules engine against a sample message
- Detection endpoint returning the full evaluation (deciding rule, all matches, broken rules)
- Incident lifecycle guarded by an explicit state machine — a resolved incident **cannot** be silently reopened
- Appeal queue: only a *dismissed* incident can be appealed, motivation is mandatory, and a judged appeal is final
- Dashboard with real metrics: open/dismissed/confirmed, severity distribution, dismissal rate (false-positive indicator), daily volume

**Audit**
- `audit_log` is **append-only**. No query in this repository updates or deletes it — verifiable by reading the code.
- Every decision, incident creation, rule toggle, and rule edit writes exactly one entry.
- Timestamps are server-side, actors are linked, notes are preserved.

**Accounts**
- `scrypt` password hashing (RFC 7914) via `node:crypto` — no native dependency to break the build
- Comparison is constant-time (`timingSafeEqual`)
- Sessions are opaque tokens; only their **SHA-256** lives in the database
- `HTTP-only`, `SameSite=Lax`, `Secure` cookies — `document.cookie` returns nothing (verified)
- Login returns the same generic error and performs a dummy hash for unknown emails — no account-enumeration oracle

---

## Tech stack

| Layer | Choice | Rationale |
|---|---|---|
| Interface | Next.js 16 (App Router), React 19, TypeScript strict | What Canadian teams ship with daily |
| Styling | Tailwind CSS v4 + a hand-written design system | One accent, severity carried by colour, not decoration |
| Database | **PostgreSQL** via Drizzle ORM | Real relational schema, versioned migrations |
| Local / CI | **PGlite** (PostgreSQL compiled to WASM) | The same Postgres engine locally and in CI, zero services to install |
| Production | **Managed Postgres** through `DATABASE_URL` | Neon / Supabase / Vercel Postgres — `prepare: false`, so the same code runs behind PgBouncer |
| Validation | Zod | One place for request shapes, output types follow |
| Tests | Vitest — **85 tests** | Unit + integration against a real Postgres |
| CI | GitHub Actions | typecheck → lint → test → build |

---

## Getting started

```bash
npm install
npm run db:generate   # regenerate SQL migrations (after editing the schema)
npm run db:migrate    # migrations — Postgres si DATABASE_URL, sinon PGlite local
npm run db:seed       # demo data, produced by the real rules engine
npm run dev           # http://localhost:3000
```

**Demo account:** `demo@vigil.app` / `vigil-demo-2026`

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (Next.js + TypeScript rules) |
| `npm test` | Vitest, single run |
| `npm run test:coverage` | Coverage report |
| `npm run db:generate` | Create migrations from the Drizzle schema |
| `npm run db:migrate` | Apply migrations — Postgres if `DATABASE_URL`, local PGlite otherwise |
| `npm run db:seed` | Reset and load demo data |
| `npm run db:tcp` | Start a real PostgreSQL socket locally (PGlite behind TCP) — see [Deploying](#deploying) |
| `npm run verify` | typecheck + lint + test (what CI runs) |

---

## Architecture

```
src/
├── app/
│   ├── page.tsx                    Landing page
│   ├── login/ register/            Auth screens
│   ├── dashboard/                  Guarded console
│   │   ├── page.tsx                KPIs + message simulator
│   │   ├── incidents/              List + detail with decisions
│   │   ├── rules/                  Ordered rules — create, edit, reorder, on/off
│   │   ├── appeals/                Appeal queue
│   │   └── audit/                  Append-only journal
│   └── api/                        REST endpoints (9)
├── components/                     UI, all client islands isolated
├── db/
│   ├── schema.ts                   8 tables + domain types
│   └── index.ts                    Connection — `DATABASE_URL` → Postgres, sinon PGlite
└── lib/
    ├── rules.ts        ★ the rules engine — pure, no I/O
    ├── moderation.ts   ★ state machines + KPIs — pure, no I/O
    ├── auth.ts         ★ scrypt + sessions — pure, no I/O
    ├── rule-validation.ts  Write-time guards: compilable regex + severity floor
    ├── repository.ts   All reads/writes; the only audit writer
    └── session.ts      Cookie ↔ database bridge
```

★ The three starred modules have **no dependency on Drizzle, Next, or the filesystem.** That is why they are tested exhaustively without infrastructure.

`rule-validation.ts` and the engine deliberately disagree about invalid input, and that is the design: the engine **isolates** a broken regex (it may already be in the database), while the write path **refuses** one (it should never get there).

---

## API

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/auth/register` | Create account + workspace |
| `POST` | `/api/auth/login` | Start session |
| `POST` | `/api/auth/logout` | Destroy session |
| `POST` | `/api/incidents/detect` | Run a message through the rules engine |
| `PATCH` | `/api/incidents/:id` | Dismiss or confirm (state-machine guarded) |
| `POST` | `/api/appeals` | Open an appeal (dismissed incidents only) |
| `PATCH` | `/api/appeals/:id` | Judge an appeal (motivation required) |
| `POST` | `/api/rules` | Create a rule (regex + severity floor enforced) |
| `PATCH` | `/api/rules/:id` | Edit a rule, or toggle it (audited) |

Every mutation endpoint validates with Zod and answers with a precise status: `409` for an illegal transition or a duplicate rule name, `404` for a missing record, `422` for invalid input, `401` when unauthenticated.

`PATCH /api/rules/:id` validates in **two passes**: the fragment on its own, then the *merged* rule. Without the second pass, moving a rule from `low` to `critical` while leaving its action at `flag` would be accepted — the most dangerous rule in the system would silently do nothing.

---

## Testing

**85 tests, 5 files.**

- `rules.test.ts` (engine) — priority ordering, multi-match evaluation, severity-based decision, disabled rules, invalid regex isolation, zero-width regex infinite-loop guard, case-insensitivity
- `rule-editing.test.ts` — the write path: severity/action floor (all four severities), compilable-regex rejection, per-field French errors, and on real Postgres that a rule edit writes **exactly one** audit entry — or none at all when nothing changed
- `moderation.test.ts` — the full transition table (every from/to pair, legal and illegal), appeal states, KPI arithmetic including the divide-by-zero case
- `auth.test.ts` — hash format, salt uniqueness, constant-time verification, corrupted-hash handling, Unicode NFKC normalisation, session token shape
- `repository.test.ts` — **integration on real PostgreSQL**: migrations apply, unique constraints hold at the database level, detection writes incident *and* audit entry, refused transitions leave the row untouched

The integration suite runs on in-memory PGlite, so CI needs **no database service**.

---

## Verified behaviour

Exercised end-to-end against the running application:

- Wrong password → `401` with an identical generic message
- Login → session established, protected route returns `200`
- `document.cookie` is **empty** after login (HTTP-only confirmed)
- Detection → `critical` / `remove` on a threat message
- Decision → badge, audit entry, and resolved metadata all update
- Appeal → created, judged, audited
- Rule toggle → persisted, audited as `rule.enabled`
- Rule creation → `201`, audited as `rule.created`, appearing at the right position in the priority order
- Rule edit → `200`, audited as `rule.updated` with **only the fields that actually changed** (`champs sévérité, action, priorité`); a no-op `PATCH` writes nothing at all
- Rule form → live regex compilation, severity floor blocking submit, and a preview that runs the real engine against a sample message
- **15 guard rails**: double resolution `409`, reopen attempt `409`, missing incident `404`, duplicate appeal `409`, appeal on an open incident `409`, short motivation `422`, duplicate email `409`, weak password `422`, action below the severity floor `422`, uncompilable regex `422`, priority out of bounds `422`, duplicate rule name `409`, empty `PATCH` `422`, merged rule below the floor `422`, unknown rule `404`

---

## Case study: a failure only production could show

The most instructive bug in this repository. Worth reading if you have two minutes.

**Symptom.** Every database query failed in `next dev` and `next start`:

```
TypeError: The "path" argument must be of type string or an instance of
Buffer or URL. Received an instance of URL
```

Meanwhile `npm run db:migrate` and `npm run db:seed` — the *same* `createDb()` — worked perfectly. So the schema was fine, the data was fine, and plain Node was fine. Only Next.js failed, and it failed intermittently: the same server would return `200` on one request and `500` on the next.

**Diagnosis.** Hiding behind Next's `at ignore-listed frames`, so the first step was a throwaway route that re-threw with `Error.stackTraceLimit = 200` and printed `error.cause.stack`:

```
at open (node:internal/fs/promises:1342:10)
at Module.readFile (node:internal/fs/promises:1996:20)
at Object.w (.next/server/chunks/ssr/node_modules_@electric-sql_pglite_dist_0j1fzsq._.js)
```

Two facts fell out of that line:

1. `fs` was rejecting a value **it had been handed** — not a wrong path, a wrongly-*typed* one. Node accepts `string | Buffer | URL`, and the message says it received a `URL`. So the check that failed was `instanceof`: **two different `URL` classes**.
2. The frame was inside a *Turbopack chunk*, not `node_modules`. PGlite was being bundled.

**Root cause.** Turbopack resolved `@electric-sql/pglite` using the **browser** export conditions, so it compiled the Emscripten system bridge — which brings its own `URL` implementation. Node's `fs` compares against `globalThis.URL`, the bundled instance fails `instanceof`, and every file read throws. Because the failure depends on which chunk gets loaded first, it looked intermittent.

`serverExternalPackages: ["@electric-sql/pglite"]` was already set and was **not sufficient** — worth knowing before trusting it.

**Fix.** Load the package at runtime, where it cannot be rewritten:

```ts
// src/db/index.ts
function loadPGlite(): PGliteCtor {
  const requireFromModule = createRequire(import.meta.url);
  return (requireFromModule('@electric-sql/pglite') as { PGlite: PGliteCtor }).PGlite;
}
```

`createRequire` bypasses static analysis entirely: the package resolves from `node_modules` on first use, with the genuine Node implementation. Confirmed by a control script that ran the CJS build under bare `node` and worked every time.

**What made this take longer than it should have:** three wrong hypotheses committed before the stack trace was extracted — a relative-path resolution bug, a concurrent file-lock, and a corrupted `.data` directory. All were plausible, all were wrong, and none of them survived one real stack trace.

---

## Deploying

```bash
# 1. une base managée — Neon / Supabase / Vercel Postgres → copier l'URL

# 2. éprouver le chemin de production SANS compte ni Docker :
#    PGlite parle le protocole PostgreSQL réel, on l'expose en TCP
npm run db:tcp
#    puis, dans un autre terminal :
DATABASE_URL=postgres://127.0.0.1:54329/postgres npm run db:migrate
DATABASE_URL=postgres://127.0.0.1:54329/postgres npm run db:seed
DATABASE_URL=postgres://127.0.0.1:54329/postgres npm run build

# 3. livrer
vercel        # vercel.json exécute « db:migrate && next build »
```

**Pourquoi les migrations au build et pas au démarrage :** les fonctions
serverless démarrent en parallèle — faire migrer chacune revient à courir le
même SQL sur N instances en même temps. Au build, ça tourne **une fois**.

**Le garde-fou :** `db:migrate` **refuse** de s'exécuter sur Vercel sans
`DATABASE_URL`. Un fichier local y est éphémère : la migration paraîtrait
réussie, puis chaque démarrage repartirait d'une base vide. Mieux vaut un
déploiement refusé qu'un déploiement cassé.

**Le harnais TCP est une dépendance de développement**
(`@electric-sql/pglite-socket`) : il n'entre jamais dans le bundle. C'est ce
qui permet de vérifier le chemin déployé — driver `postgres`, TLS,
`prepare: false`, agrégation du pooler — sans Docker et sans compte cloud.

> **Honnêteté :** ce chemin est prouvé de bout en bout en local, mais le
> projet n'est **pas encore déployé** : il faudrait un projet Vercel et une
> base, que je ne crée pas à votre place. Aucune URL en ligne n'est promise.

---

## Limitations & next steps

Honest scope notes:

- **Storage switches on `DATABASE_URL`.** Set → managed Postgres (Neon / Supabase / Vercel Postgres); unset → PGlite on local disk. The branch lives in `src/db/index.ts`, and an explicit `dir` always means PGlite — which is precisely why no test can reach the network. There is **no silent fallback**: with `DATABASE_URL` present but wrong, the app fails loudly instead of writing to an ephemeral file.
- **Not yet deployed.** The managed path is proven end-to-end against a real PostgreSQL socket — migrations, seed, reads and writes all ran over TCP (see [Deploying](#deploying)). What is missing is the account plumbing (a Vercel project + a managed database), so there is still **no live URL to click**.
- **No rate limiting** on auth endpoints — add it before any real deployment.
- **Single-workspace reads.** Registration creates a workspace, but the console currently resolves the shared demo workspace. Multi-tenancy by membership is the next step.
- **No drag-and-drop reordering.** Priority is a plain integer you type; there is no sortable list. The evaluation order stays explicit either way, so this is a ergonomics gap rather than a correctness one.
- **Playwright e2e** is not wired up yet; the interaction checks above were run manually.

---

## Version française

**Vigil est une console de confiance et de sécurité pour communautés en ligne.**

Le problème : un outil de modération répond « a-t-il été signalé ? » mais ne peut pas dire *quelle règle, dans quel ordre, et pourquoi*. Pire, l'historique disparaît quand un modérateur change d'avis.

Cinq décisions portent le produit :

1. **Priorité croissante** — l'ordre est le contrat.
2. **Toutes les règles sont évaluées**, pas seulement la première qui matche.
3. **La sévérité maximale décide**, jamais le premier match : on échoue du côté sûr.
4. **Une regex cassée n'interrompt jamais la chaîne** — elle est isolée et remontée.
5. **Un plancher sévérité → action, appliqué à l'écriture** : une règle `critical` associée à `flag` serait la décision la plus grave du système… qui ne ferait rien. Le serveur la refuse, et le formulaire l'indique avant l'envoi.

Les règles se **modifient, elles ne se suppriment pas** : les incidents conservent un `rule_id`, et `ON DELETE SET NULL` transformerait silencieusement un message signalé en « signalé par personne ».

Le journal `audit_log` est **en écriture seule** : aucune requête du projet ne le met à jour ni ne le supprime. Un incident tranché ne se rouvre pas silencieusement — cela passe par un appel motivé et tranché.

**Stockage :** un seul branchement, `DATABASE_URL`. Renseigné → Postgres managé (Neon / Supabase / Vercel) ; absent → PGlite en local. **Aucun repli silencieux** : une URL fausse fait échouer bruyamment plutôt que d'écrire dans un fichier qui disparaîtrait au prochain démarrage. Et un `dir` explicite veut toujours dire PGlite — c'est ce qui garantit qu'**aucun test ne peut toucher au réseau**.

**Pile :** Next.js 16 · TypeScript strict · Tailwind v4 · PostgreSQL (Drizzle) · PGlite (local/CI) · Postgres managé (`DATABASE_URL`) · Vitest · GitHub Actions.

**Note d'ingénierie :** un défaut réel a été isolé en production uniquement — Turbopack empaquetait PGlite avec les conditions du navigateur, ce qui faisait échouer chaque requête sous Next.js alors que le même code tournait sous `tsx`. Diagnostic complet (et hypothèses ratées) dans la section [Case study](#case-study-a-failure-only-production-could-show).

**Démonstration :** `demo@vigil.app` / `vigil-demo-2026`

---

Built as a full-stack reference project: rules engine, state machines, authentication, migrations, tests, and CI.
