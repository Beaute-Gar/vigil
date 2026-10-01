/**
 * Applique les migrations SQL à la base locale.
 *   npm run db:migrate
 */
import { createDb } from '../src/db';

async function main(): Promise<void> {
  const db = await createDb();
  console.log('✔ migrations appliquées');
  // PGlite garde le handle ouvert : on ferme explicitement.
  await (db as unknown as { $client?: { close?: () => Promise<void> } }).$client?.close?.();
}

main().catch((err) => {
  console.error('✖ échec des migrations', err);
  process.exitCode = 1;
});
