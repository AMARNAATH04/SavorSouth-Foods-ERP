import 'dotenv/config';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.resolve(ROOT, '.pgdata');

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

async function main() {
  let pg: EmbeddedPostgres | null = null;
  if (!(await isPortOpen(5432))) {
    console.log('[Bootstrap] Starting embedded PostgreSQL...');
    pg = new EmbeddedPostgres({
      databaseDir: DATA_DIR,
      user: 'postgres',
      password: 'postgres',
      port: 5432,
      persistent: true,
    });
    if (!fs.existsSync(path.join(DATA_DIR, 'PG_VERSION'))) {
      await pg.initialise();
    }
    await pg.start();
    try {
      await pg.createDatabase('savorsouth_erp');
    } catch {
      // Already exists
    }
  }

  try {
    console.log('[Bootstrap] Generating Prisma client...');
    execSync('npx prisma generate', { cwd: ROOT, stdio: 'inherit' });

    console.log('[Bootstrap] Creating/applying PostgreSQL migrations...');
    execSync('npx prisma migrate dev --name init --skip-seed', {
      cwd: ROOT,
      stdio: 'inherit',
    });

    console.log('[Bootstrap] Seeding SavorSouth ERP database...');
    execSync('npx tsx prisma/seed.ts', { cwd: ROOT, stdio: 'inherit' });

    console.log('[Bootstrap] Complete!');
  } finally {
    if (pg) {
      await pg.stop();
    }
  }
}

main().catch((err) => {
  console.error('[Bootstrap] Failed:', err);
  process.exit(1);
});
