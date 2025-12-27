import { unlinkSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, '../../data/zenbot.db');

if (existsSync(dbPath)) {
  unlinkSync(dbPath);
  console.log('Database deleted.');
}

// Re-initialize by importing init
await import('./init.js');
console.log('Database reset complete.');
