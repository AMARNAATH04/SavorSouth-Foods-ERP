import 'dotenv/config';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';
import { createApp } from './app.js';
import { prisma } from './db.js';

const PORT = Number(process.env.PORT || 4000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function isPortOpen(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(500);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(false));
    socket.connect(port, host);
  });
}

async function ensureDatabase() {
  const alreadyListening = await isPortOpen(5432);
  if (alreadyListening || process.env.USE_EMBEDDED_DB === 'false') {
    return null;
  }

  const dataDir = path.resolve(__dirname, '../.pgdata');
  console.log('[DB] Starting embedded PostgreSQL at', dataDir);
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port: 5432,
    persistent: true,
  });
  if (!fs.existsSync(path.join(dataDir, 'PG_VERSION'))) {
    await pg.initialise();
  }
  await pg.start();
  try {
    await pg.createDatabase('savorsouth_erp');
  } catch {
    // Database already exists
  }
  console.log('[DB] Embedded PostgreSQL ready on port 5432');
  return pg;
}

async function start() {
  const embeddedPg = await ensureDatabase();
  const app = createApp();

  const server = app.listen(PORT, () => {
    console.log(`[API] SavorSouth ERP server listening on http://localhost:${PORT}`);
  });

  const shutdown = async () => {
    server.close();
    await prisma.$disconnect();
    if (embeddedPg) {
      await embeddedPg.stop();
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
