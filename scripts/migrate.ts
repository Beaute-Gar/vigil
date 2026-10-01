/**
 * Applique les migrations SQL à la base.
 *   npm run db:migrate            → Postgres si DATABASE_URL, sinon PGlite local
 *   DATABASE_URL=... npm run db:migrate
 */
import { closeDb, createDb } from '../src/db';

async function main(): Promise<void> {
  // Sur Vercel, un fichier local est éphémère : la migration paraîtrait
  // réussie, puis chaque démarrage repartirait d'une base vide. On préfère
  // refuser un déploiement à le livrer cassé.
  if (process.env.VERCEL && !process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL manquant sur Vercel — incohérent. ' +
      'La migration viserait un fichier local éphémère : définissez ' +
      'DATABASE_URL (Neon / Supabase / Vercel Postgres) dans le projet Vercel.',
    );
  }

  const cible = process.env.DATABASE_URL ? 'Postgres (DATABASE_URL)' : 'PGlite (local)';
  console.log(`→ cible : ${cible}`);

  const db = await createDb();
  console.log('✔ migrations appliquées');
  await closeDb(db);
}

main().catch((err) => {
  console.error('✖ échec des migrations', err);
  process.exitCode = 1;
});
