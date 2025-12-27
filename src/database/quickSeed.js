import db from './init.js';

/**
 * Quick seed script - pass Discord IDs as arguments
 *
 * Usage: npm run db:quick-seed -- id1 id2 id3 id4 id5
 *
 * Example:
 * npm run db:quick-seed -- 123456789 987654321 111222333
 *
 * This will create:
 * - First ID at rank #1
 * - Second ID at rank #2
 * - etc.
 */

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('\n📋 Quick Seed - Add players to leaderboard\n');
  console.log('Usage: npm run db:quick-seed -- <discord_id_1> <discord_id_2> ...\n');
  console.log('Example:');
  console.log('  npm run db:quick-seed -- 750627134753472603 1040149462955343903 623708863996100609\n');
  console.log('This will set them as Rank #1, #2, #3 respectively.\n');
  console.log('To get a Discord ID:');
  console.log('1. Enable Developer Mode in Discord (Settings → Advanced → Developer Mode)');
  console.log('2. Right-click a user → Copy User ID\n');
  process.exit(0);
}

// Clear existing data
db.prepare('DELETE FROM match_results').run();
db.prepare('DELETE FROM challenges').run();
db.prepare('DELETE FROM players').run();

console.log('Cleared existing data...\n');

// Insert players
const insert = db.prepare(`
  INSERT INTO players (discord_id, rank, cooldown_until, wins, losses)
  VALUES (?, ?, ?, 0, 0)
`);

args.forEach((discordId, index) => {
  const rank = index + 1;
  if (rank <= 10) {
    insert.run(discordId, rank, null);
    console.log(`✅ Rank #${rank}: ${discordId}`);
  } else {
    console.log(`⚠️  Skipped ${discordId} (only ranks 1-10 supported)`);
  }
});

console.log('\n✅ Database seeded!');
console.log('Restart the bot (or it will auto-reload with --watch) to see updates.');
