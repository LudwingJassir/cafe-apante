// Abre el sistema con la base de demostración, sin tocar la base real.
// Uso: npm run demo   (antes, una sola vez: npm run db:demo)
process.env.SQL_BASE ??= 'CafeApante_Demo';
process.env.PUERTO ??= '3210';
await import('./index.js');
