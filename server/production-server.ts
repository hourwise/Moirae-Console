import { createMoiraeProductionServer } from './production-host';

const port = parsePort(process.env.PORT ?? '4173');
const host = process.env.HOST ?? '0.0.0.0';
const server = createMoiraeProductionServer();

server.listen(port, host, () => {
  console.log(`Moirae Console listening on http://${host}:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close(() => process.exit(0));
  });
}

function parsePort(value: string): number {
  if (!/^\d+$/.test(value)) throw new Error('PORT must be a valid TCP port number');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error('PORT must be between 1 and 65535');
  }
  return parsed;
}
