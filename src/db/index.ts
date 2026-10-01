import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import postgres from 'postgres';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator';
import { schema } from './schema';
import type { PGlite as PGliteInstance } from '@electric-sql/pglite';

/**
 * Type de référence : le client de **production**.
 *
 * `postgres-js` et `pglite` construisent tous deux un `PgDatabase` et
 * exposent la même API de requête — seul le client sous-jacent diffère.
 * Typer sur le chemin déployé signifie que c'est *lui* que TypeScript
 * vérifie réellement ; le chemin local paie une conversion unique,
 * documentée à son endroit.
 */
export type Db = ReturnType<typeof drizzlePostgres<typeof schema>>;

const MIGRATIONS = path.join(process.cwd(), 'drizzle');

type PGliteCtor = new (dataDir?: string) => PGliteInstance;

/**
 * Charge PGlite **à l'exécution**, jamais via le bundler.
 *
 * Turbopack résout `import { PGlite } from '@electric-sql/pglite'` avec les
 * conditions du navigateur : il empaquette le pont système Emscripten et y
 * injecte sa propre classe `URL`. Node rejette ensuite cette instance au
 * moment de `fs.readFile(...)` (`ERR_INVALID_ARG_TYPE` : « Received an
 * instance of URL »), et **toute** requête échoue — alors que le même code
 * tourne parfaitement sous `tsx` ou `node`.
 *
 * `createRequire` contourne l'analyse statique : le paquet est résolu depuis
 * `node_modules` au démarrage, avec la vraie implémentation Node. Vérifiable :
 * `serverExternalPackages` ne suffit pas, ce chargement si.
 */
function loadPGlite(): PGliteCtor {
  const requireFromModule = createRequire(import.meta.url);
  const mod = requireFromModule('@electric-sql/pglite') as { PGlite: PGliteCtor };
  return mod.PGlite;
}

export type CreateDbOptions = {
  /** Dossier PGlite. `null` → mémoire vive (tests). `undefined` → voir `createDb`. */
  dir?: string | null;
  /** Appliquer les migrations SQL à l'ouverture. */
  migrate?: boolean;
};

/**
 * Ouvre une base et optionnellement y applique les migrations.
 *
 * ── Choix du moteur, dans cet ordre ─────────────────────────────────
 *
 *   1. `dir` fourni           → **PGlite**. On demande explicitement un
 *                               dossier local, `null` compris. C'est ce que
 *                               font les tests : la règle garantit qu'**aucun
 *                               test ne peut toucher au réseau**, même si
 *                               `DATABASE_URL` est défini dans l'environnement.
 *
 *   2. `DATABASE_URL` défini  → **Postgres managé** (Vercel / Neon / Supabase).
 *                               S'il est mal renseigné, on échoue *bruyamment* :
 *                               basculer silencieusement sur un fichier local
 *                               côté serveur créerait une base fantôme à chaque
 *                               invocation.
 *
 *   3. sinon                  → **PGlite persistant** (`PGLITE_DIR`,
 *                               sinon `./.data/vigil`).
 */
export async function createDb(opts: CreateDbOptions = {}): Promise<Db> {
  if (opts.dir === undefined && process.env.DATABASE_URL) {
    return createPostgresDb(opts.migrate !== false);
  }
  return createPgliteDb(opts);
}

async function createPostgresDb(shouldMigrate: boolean): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL manquant.');

  const client = postgres(url, {
    // Un pooler en mode transaction (Neon, Supabase) ne sait pas rejouer une
    // requête préparée à chaque round-trip : `prepare: false` fait passer le
    // même code derrière un pooler et derrière un Postgres nu.
    prepare: false,
    max: Number(process.env.PG_POOL_MAX) || 5,
  });

  const db = drizzlePostgres(client, { schema });
  if (shouldMigrate) await migratePostgres(db, { migrationsFolder: MIGRATIONS });
  return db;
}

async function createPgliteDb(opts: CreateDbOptions): Promise<Db> {
  const dir = opts.dir === undefined ? (process.env.PGLITE_DIR ?? './.data/vigil') : opts.dir;

  // Résolu UNE seule fois pour que `mkdirSync` et PGlite visent exactement
  // le même dossier — un chemin relatif laisserait PGlite le résoudre lui.
  const resolvedDir = dir ? path.resolve(dir) : null;

  // PGlite n'a pas le réflexe de créer les parents d'un chemin de fichier :
  // sans cet mkdir, la première ouverture échoue en ENOENT.
  if (resolvedDir) fs.mkdirSync(resolvedDir, { recursive: true });

  const PGlite = loadPGlite();
  const client = new PGlite(resolvedDir ?? undefined);
  const local = drizzlePglite(client, { schema });

  if (opts.migrate !== false) {
    await migratePglite(local, { migrationsFolder: MIGRATIONS });
  }
  // Conversion documentée (voir `Db`) : même `PgDatabase`, client différent.
  return local as unknown as Db;
}

/**
 * Ferme la base — et surtout, **la vraie raison d'exister** : les deux
 * moteurs gardent le processus vivant tant qu'ils ne sont pas fermés.
 * Un script de migration PGlite ne s'arrête pas sans `close()`, un script
 * Postgres laisse un pool de connexions ouvert.
 */
export async function closeDb(db: Db): Promise<void> {
  const client = db.$client as unknown as {
    close?: () => Promise<void>;
    end?: (opts?: unknown) => Promise<void>;
  };
  if (typeof client.close === 'function') await client.close(); // PGlite
  else if (typeof client.end === 'function') await client.end(); // postgres-js
}

/**
 * Normalise la sortie de `db.execute()`.
 *
 * Les deux moteurs ne s'exprient pas pareil : PGlite renvoie un objet
 * `{ rows }`, postgres-js renvoie **directement** le tableau des lignes.
 * Cet adaptateur laisse le même test — et le même code — passer sur les
 * deux, sans dépendre de qui répond.
 */
export function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

/* Singleton par processus : Next.js recrée les modules à chaque HMR,
   on ne rouvre pas (ni ne remigre) la base inutilement. */
const globalForDb = globalThis as unknown as { __vigilDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  if (!globalForDb.__vigilDb) {
    // Pas de migration à l'amorçage : courir des migrations à l'intérieur
    // du serveur fait rater plusieurs instances concurrentes, et dans le
    // bundle de production cette lecture de fichiers échoue. Le schéma est
    // appliqué par `npm run db:migrate` — au build sur Vercel (voir vercel.json).
    globalForDb.__vigilDb = createDb({ migrate: false });
  }
  return globalForDb.__vigilDb;
}

/** Réinitialise le singleton — uniquement pour les tests. */
export function resetDbSingleton(): void {
  delete globalForDb.__vigilDb;
}
