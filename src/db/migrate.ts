import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dbPool } from './pool.js';

const migrationDir = fileURLToPath(new URL('../../migrations', import.meta.url));

async function runMigrations() {
  const files = readdirSync(migrationDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(migrationDir, file), 'utf8');
    console.log(`Running migration: ${file}`);
    await dbPool.query(sql);
  }

  console.log(`Applied ${files.length} migration(s).`);
}

runMigrations()
  .then(() => {
    console.log('Migration complete.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
