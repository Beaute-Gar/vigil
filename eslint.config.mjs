import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Diagnostics ponctuels `_check_*` : scripts jetables exécutés à la
    // main pour inspecter env/base, jamais importés ni déployés.
    "scripts/_check_*",
  ]),
]);

export default eslintConfig;
