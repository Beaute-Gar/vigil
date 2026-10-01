import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { schema } from './schema';
import type { PGlite as PGliteInstance } from '@electric-sql/pglite';

export type Db = ReturnType<typeof drizzle<typeof schema>>;

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
  /** Dossier de persistance. `null` → mémoire vive (tests). */
  dir?: string | null;
  /** Appliquer les migrations SQL à l'ouverture. */
  migrate?: boolean;
};

/**
 * Ouvre une base et optionnellement y applique les migrations.
 *
 * - `dir: null`  → base en mémoire, isolée : c'est ce que font les tests.
 * - `dir: 'x'`   → base persistante dans `x`.
 * - non fourni   → `PGLITE_DIR`, sinon `./.data/vigil`.
 */
export async function createDb(opts: CreateDbOptions = {}): Promise<Db> {
  const dir = opts.dir === undefined ? (process.env.PGLITE_DIR ?? './.data/vigil') : opts.dir;

  // Résolu UNE seule fois pour que `mkdirSync` et PGlite visent exactement
  // le même dossier — un chemin relatif laisserait PGlite le résoudre lui.
  const resolvedDir = dir ? path.resolve(dir) : null;

  // PGlite n'a pas le réflexe de créer les parents d'un chemin de fichier :
  // sans cet mkdir, la première ouverture échoue en ENOENT.
  if (resolvedDir) fs.mkdirSync(resolvedDir, { recursive: true });

  const PGlite = loadPGlite();
  const client = new PGlite(resolvedDir ?? undefined);
  const db = drizzle(client, { schema });

  if (opts.migrate !== false) {
    await migrate(db, { migrationsFolder: MIGRATIONS });
  }
  return db;
}

/* Singleton par processus : Next.js recrée les modules à chaque HMR,
   on ne rouvre pas (ni ne remigre) la base inutilement. */
const globalForDb = globalThis as unknown as { __vigilDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  if (!globalForDb.__vigilDb) {
    // Pas de migration à l'amorçage : courir des migrations à l'intérieur
    // du serveur fait rater plusieurs instances concurrentes, et dans le
    // bundle de production cette lecture de fichiers échoue. Le schéma est
    // appliqué par `npm run db:migrate` (voir package.json).
    globalForDb.__vigilDb = createDb({ migrate: false });
  }
  return globalForDb.__vigilDb;
}

/** Réinitialise le singleton — uniquement pour les tests. */
export function resetDbSingleton(): void {
  delete globalForDb.__vigilDb;
}
