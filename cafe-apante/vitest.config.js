import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['shared/**/*.test.js', 'server/**/*.test.js'],
    environment: 'node',
    // Las pruebas de integración nunca tocan la base real del negocio.
    env: { SQL_BASE: 'CafeApante_Pruebas' },
    testTimeout: 20000,
  },
});
