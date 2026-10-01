import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    // Les tests couvrent le moteur de règles, l'auth et la base :
    // aucun DOM requis, l'environnement Node va plus vite.
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // PGlite démarre un vrai PostgreSQL en WASM : on laisse la main.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/db/**'],
      reporter: ['text-summary', 'html'],
    },
  },
});
