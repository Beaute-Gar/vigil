import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    // PGlite lit/écrit un dossier local — aucune base à démarrer.
    url: process.env.PGLITE_DIR ?? './.data/vigil',
  },
});
