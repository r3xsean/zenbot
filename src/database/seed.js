import db from './init.js';

/**
 * Seed the database with example players for testing
 *
 * Usage: npm run db:seed
 *
 * You'll need to replace these Discord IDs with real ones from your server.
 * To get a Discord ID: Enable Developer Mode in Discord settings,
 * then right-click a user and click "Copy User ID"
 */

// Example players - REPLACE THESE with real Discord user IDs from your server
const examplePlayers = [
  // Format: { discord_id, rank, cooldown_until (null = available) }
  { discord_id: 'REPLACE_WITH_USER_1_ID', rank: 1, cooldown_until: null },
  { discord_id: 'REPLACE_WITH_USER_2_ID', rank: 2, cooldown_until: null },
  { discord_id: 'REPLACE_WITH_USER_3_ID', rank: 3, cooldown_until: null },
  { discord_id: 'REPLACE_WITH_USER_4_ID', rank: 4, cooldown_until: null },
  { discord_id: 'REPLACE_WITH_USER_5_ID', rank: 5, cooldown_until: null },
  // Ranks 6-10 left empty for testing - anyone can challenge for these
];

// Check if IDs have been replaced
const hasPlaceholders = examplePlayers.some(p => p.discord_id.startsWith('REPLACE_'));

if (hasPlaceholders) {
  console.log('\n⚠️  SETUP REQUIRED\n');
  console.log('Please edit src/database/seed.js and replace the placeholder Discord IDs');
  console.log('with real user IDs from your server.\n');
  console.log('To get a Discord ID:');
  console.log('1. Enable Developer Mode in Discord (Settings → Advanced → Developer Mode)');
  console.log('2. Right-click a user → Copy User ID\n');
  process.exit(1);
}

// Clear existing players
db.prepare('DELETE FROM players').run();
db.prepare('DELETE FROM challenges').run();
db.prepare('DELETE FROM match_results').run();

console.log('Cleared existing data...');

// Insert players
const insert = db.prepare(`
  INSERT INTO players (discord_id, rank, cooldown_until, wins, losses)
  VALUES (?, ?, ?, 0, 0)
`);

for (const player of examplePlayers) {
  insert.run(player.discord_id, player.rank, player.cooldown_until);
  console.log(`Added player ${player.discord_id} at rank #${player.rank}`);
}

console.log('\n✅ Database seeded successfully!');
console.log(`Added ${examplePlayers.length} players to the leaderboard.`);
console.log('\nRestart the bot to see the updated leaderboard.');
