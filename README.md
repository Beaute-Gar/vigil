# Vigil

> **Trust & Safety console for online communities.**
> Ordered moderation rules, explainable verdicts, an appeal queue, and an append-only audit trail.

[![CI](https://github.com/Beaute-Gar/vigil/actions/workflows/ci.yml/badge.svg)](https://github.com/Beaute-Gar/vigil/actions/workflows/ci.yml)
![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Drizzle-4169E1?logo=postgresql&logoColor=white)
![Tests](https://img.shields.io/badge/tests-61%20passed-brightgreen)

**Live · English below · [Version française](#version-française)**

---

## The problem this solves

Moderation tooling usually answers *"was it flagged?"* and nothing else. That is not enough:

- A rule fires, but nobody can say **which rule, in what order, and why**.
- A moderator changes their mind, and **the history changes with it** — or worse, quietly disappears.
- A broken regular expression takes down the whole detection chain.

Vigil is built around the opposite: **every verdict is explainable, every state change is recorded, and nothing can be un-written.**

### Four design decisions that carry the whole product

| # | Decision | Why it matters |
|---|---|---|
| 1 | **Ascending priority** | The order *is* the contract. Reordering two rules changes exactly what should change — and nothing else. |
| 2 | **All rules are evaluated**, not just the first match | You can answer *"why was this flagged?"* with the full set of matches, not a mute verdict. |
| 3 | **The highest-severity action wins**, never the first match | First-match-wins is dangerous: a `flag` rule at priority 1 could mask a `remove` threat rule at priority 9. The system fails safe. |
| 4 | **A broken rule never breaks the chain** | An invalid regex is isolated and reported in `invalidRules`, never thrown. A broken rule should be *seen* — it should not stop moderation. |

Presentation order stays the priority order; **decision** order is severity. Both are defensible in a review.

---

## What's inside

**Moderation**
- Ordered rules with priority, severity, action, and a per-rule on/off switch
- Detection endpoint returning the full evaluation (deciding rule, all matches, broken rules)
- Incident lifecycle guarded by an explicit state machine — a resolved incident **cannot** be silently reopened
- Appeal queue: only a *dismissed* incident can be appealed, motivation is mandatory, and a judged appeal is final
- Dashboard with real metrics: open/dismissed/confirmed, severity distribution, dismissal rate (false-positive indicator), daily volume

**Audit**
- `audit_log` is **append-only**. No query in this repository updates or deletes it — verifiable by reading the code.
- Every decision, incident creation, and rule toggle writes exactly one entry.
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
| Validation | Zod | One place for request shapes, output types follow |
| Tests | Vitest — **61 tests** | Unit + integration against a real Postgres |
| CI | GitHub Actions | typecheck → lint → test → build |

---

## Getting started

```bash
npm install
npm run db:generate   # regenerate SQL migrations (after editing the schema)
npm run db:migrate    # apply migrations to the local PGlite database
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
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Reset and load demo data |
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
│   │   ├── rules/                  Ordered rules, on/off switches
│   │   ├── appeals/                Appeal queue
│   │   └── audit/                  Append-only journal
│   └── api/                        REST endpoints (8)
├── components/                     UI, all client islands isolated
├── db/
│   ├── schema.ts                   8 tables + domain types
│   └── index.ts                    Connection (PGlite chargée à l'exécution)
└── lib/
    ├── rules.ts        ★ the rules engine — pure, no I/O
    ├── moderation.ts   ★ state machines + KPIs — pure, no I/O
    ├── auth.ts         ★ scrypt + sessions — pure, no I/O
    ├── repository.ts   All reads/writes; the only audit writer
    └── session.ts      Cookie ↔ database bridge
```

★ The three starred modules have **no dependency on Drizzle, Next, or the filesystem.** That is why they are tested exhaustively without infrastructure.

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
| `PATCH` | `/api/rules/:id` | Enable / disable a rule (audited) |

Every mutation endpoint validates with Zod and answers with a precise status: `409` for an illegal transition, `404` for a missing record, `422` for invalid input, `401` when unauthenticated.

---

## Testing

**61 tests, 4 files.**

- `rules.test.ts` — priority ordering, multi-match evaluation, severity-based decision, disabled rules, invalid regex isolation, zero-width regex infinite-loop guard, case-insensitivity
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
- **8 guard rails**: double resolution `409`, reopen attempt `409`, missing incident `404`, duplicate appeal `409`, appeal on an open incident `409`, short motivation `422`, duplicate email `409`, weak password `422`

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

## Limitations & next steps

Honest scope notes:

- **Storage is PGlite-backed.** The schema is standard PostgreSQL and the SQL is portable, but the app opens PGlite directly — there is no `DATABASE_URL` branch yet. Pointing it at Neon / Vercel Postgres is the next piece of work, not a config switch.
- **The database is file-backed on local disk.** It is not suitable for serverless/edge runtimes as-is; the Node.js runtime is declared on every route for that reason.
- **Single-workspace reads.** Registration creates a workspace, but the console currently resolves the shared demo workspace. Multi-tenancy by membership is the next step.
- **Rule editing is a toggle.** Creating and re-prioritising rules needs a `POST`/`PATCH` form.
- **No rate limiting** on auth endpoints — add it before any real deployment.
- **Playwright e2e** is not wired up yet; the interaction checks above were run manually.

---

## Version française

**Vigil est une console de confiance et de sécurité pour communautés en ligne.**

Le problème : un outil de modération répond « a-t-il été signalé ? » mais ne peut pas dire *quelle règle, dans quel ordre, et pourquoi*. Pire, l'historique disparaît quand un modérateur change d'avis.

Quatre décisions portent le produit :

1. **Priorité croissante** — l'ordre est le contrat.
2. **Toutes les règles sont évaluées**, pas seulement la première qui matche.
3. **La sévérité maximale décide**, jamais le premier match : on échoue du côté sûr.
4. **Une regex cassée n'interrompt jamais la chaîne** — elle est isolée et remontée.

Le journal `audit_log` est **en écriture seule** : aucune requête du projet ne le met à jour ni ne le supprime. Un incident tranché ne se rouvre pas silencieusement — cela passe par un appel motivé et tranché.

**Pile :** Next.js 16 · TypeScript strict · Tailwind v4 · PostgreSQL (Drizzle) · PGlite · Vitest · GitHub Actions.

**Note d'ingénierie :** un défaut réel a été isolé en production uniquement — Turbopack empaquetait PGlite avec les conditions du navigateur, ce qui faisait échouer chaque requête sous Next.js alors que le même code tournait sous `tsx`. Diagnostic complet (et hypothèses ratées) dans la section [Case study](#case-study-a-failure-only-production-could-show).

**Démonstration :** `demo@vigil.app` / `vigil-demo-2026`

---

Built as a full-stack reference project: rules engine, state machines, authentication, migrations, tests, and CI.
