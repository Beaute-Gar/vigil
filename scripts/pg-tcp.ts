/**
 * Postgres TCP de poche — vérifier le chemin production sans rien installer.
 *
 *   npm run db:tcp
 *   DATABASE_URL=postgres://127.0.0.1:54329/postgres npm run db:migrate
 *   DATABASE_URL=postgres://127.0.0.1:54329/postgres npm run db:seed
 *
 * PGlite parle le protocole PostgreSQL **réel** : on peut donc l'exposer en
 * TCP et y faire tourner le code de production tel quel. Le driver `postgres`
 * s'exécute alors exactement comme sur Neon ou Supabase ; seul le serveur
 * change. C'est ce qui permet de tester le chemin déployé sans Docker, sans
 * compte cloud, et de le faire tourner en CI.
 *
 * Dépendance de développement uniquement : rien de tout cela n'entre dans le
 * bundle. `PGlite` est importé ici statiquement parce que `tsx` ne souffre pas
 * du problème de résolution navigateur de Turbopack (voir src/db/index.ts).
 */
import path from 'node:path';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const PORT = Number(process.env.PG_TCP_PORT) || 54329;
const HOST = process.env.PG_TCP_HOST || '127.0.0.1';
const DIR = path.resolve(process.env.PG_TCP_DIR ?? './.data/pg-tcp');
const URL = `postgres://${HOST}:${PORT}/postgres`;

async function main(): Promise<void> {
  // PGlite n'a pas le réflexe de créer les parents d'un chemin (voir src/db/index.ts).
  fs.mkdirSync(DIR, { recursive: true });

  const db = await PGlite.create(DIR);
  const server = new PGLiteSocketServer({ db, port: PORT, host: HOST });
  await server.start();

  console.log('✔ serveur PostgreSQL prêt (PGlite derrière une socket TCP)');
  console.log(`  URL    : ${URL}`);
  console.log(`  données : ${DIR}`);
  console.log('');
  console.log('  Dans un autre terminal :');
  console.log(`    DATABASE_URL=${URL} npm run db:migrate`);
  console.log(`    DATABASE_URL=${URL} npm run db:seed`);
  console.log(`    DATABASE_URL=${URL} npm run build && DATABASE_URL=${URL} npm start`);
  console.log('');

  const stop = async (): Promise<void> => {
    await server.stop();
    await db.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((err) => {
  console.error('✖ échec du serveur TCP', err);
  process.exitCode = 1;
});
