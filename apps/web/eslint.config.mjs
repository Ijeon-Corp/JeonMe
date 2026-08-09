import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // playwright-report/ & test-results/ -- gitignored (.gitignore) tapi
  // sebelumnya TIDAK dikecualikan di sini juga: begitu E2E dijalankan
  // sekali secara lokal (npm run test:e2e, reporter HTML default di
  // playwright.config.ts), aset trace viewer besar & terminifikasi di
  // dalamnya ikut ter-scan ESLint dan gagal dengan ribuan error palsu
  // (react-hooks/rules-of-hooks dkk pada kode bundel pihak ketiga).
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'playwright-report/**', 'test-results/**']),
]);

export default eslintConfig;
