// Carga los datos de demostración en la base "CafeApante_Demo". Uso: npm run db:demo
process.env.SQL_BASE ??= 'CafeApante_Demo';
await import('./demo.js');
