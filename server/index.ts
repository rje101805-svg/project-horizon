import { createGameServer } from './game';
const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535');
const origins = (process.env.CLIENT_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173,https://rje101805-svg.github.io').split(',').map(s => s.trim());
const server = createGameServer(origins);
server.http.listen(port, '0.0.0.0', () => console.log(`Horizon flight server: http://localhost:${port} (30 ticks/s)`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { void server.close().then(() => process.exit(0)); });
