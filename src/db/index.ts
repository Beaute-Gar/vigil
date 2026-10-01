import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { schema } from './schema';

export type Db = ReturnType<typeof drizzle<typeof schema>>;

const MIGRATIONS = path.join(process.cwd(), 'drizzle');

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

  // PGlite n'a pas le réflexe de créer les parents d'un chemin de fichier :
  // sans cet mkdir, la première ouverture échoue en ENOENT.
  if (dir) fs.mkdirSync(path.resolve(dir), { recursive: true });

  const client = new PGlite(dir ?? undefined);
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
    globalForDb.__vigilDb = createDb();
  }
  return globalForDb.__vigilDb;
}

/** Réinitialise le singleton — uniquement pour les tests. */
export function resetDbSingleton(): void {
  delete globalForDb.__vigilDb;
}
