import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite est chargé à l'exécution via `createRequire` (voir src/db/index.ts)
  // : le déclarer comme paquet externe est la déclaration d'intention, le
  // chargement dynamique est ce qui garantit le comportement attendu.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
