import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '../../data');

// Ensure data directory exists
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const dbPath = join(dataDir, 'zenbot.db');
export const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  -- Players table
  CREATE TABLE IF NOT EXISTS players (
    discord_id TEXT PRIMARY KEY,
    rank INTEGER UNIQUE,
    cooldown_until INTEGER,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0
  );

  -- Challenges table
  CREATE TABLE IF NOT EXISTS challenges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    challenger_id TEXT NOT NULL,
    defender_id TEXT NOT NULL,
    defender_rank INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    message_id TEXT,
    channel_id TEXT,
    FOREIGN KEY (challenger_id) REFERENCES players(discord_id),
    FOREIGN KEY (defender_id) REFERENCES players(discord_id)
  );

  -- Match results table
  CREATE TABLE IF NOT EXISTS match_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    challenge_id INTEGER NOT NULL,
    submitted_by TEXT NOT NULL,
    winner_id TEXT NOT NULL,
    loser_id TEXT NOT NULL,
    sets_winner INTEGER NOT NULL,
    sets_loser INTEGER NOT NULL,
    scores TEXT NOT NULL,
    confirmed INTEGER DEFAULT 0,
    disputed INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (challenge_id) REFERENCES challenges(id)
  );

  -- Bot state (for persistent message IDs, etc.)
  CREATE TABLE IF NOT EXISTS bot_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- Match history for form guide and head-to-head tracking
  CREATE TABLE IF NOT EXISTS match_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id TEXT NOT NULL,
    opponent_id TEXT NOT NULL,
    result TEXT NOT NULL,
    was_challenger INTEGER NOT NULL,
    sets_won INTEGER NOT NULL,
    sets_lost INTEGER NOT NULL,
    points_scored INTEGER NOT NULL,
    points_conceded INTEGER NOT NULL,
    was_comeback INTEGER DEFAULT 0,
    was_perfect INTEGER DEFAULT 0,
    rank_before INTEGER,
    rank_after INTEGER,
    match_date INTEGER NOT NULL,
    challenge_id INTEGER,
    FOREIGN KEY (player_id) REFERENCES players(discord_id),
    FOREIGN KEY (opponent_id) REFERENCES players(discord_id)
  );

  -- Predictions table
  CREATE TABLE IF NOT EXISTS predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    challenge_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    predicted_winner_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    correct INTEGER DEFAULT NULL,
    FOREIGN KEY (challenge_id) REFERENCES challenges(id),
    UNIQUE(challenge_id, user_id)
  );

  -- Score corrections table
  CREATE TABLE IF NOT EXISTS score_corrections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    challenge_id INTEGER NOT NULL,
    requested_by TEXT NOT NULL,
    new_scores TEXT NOT NULL,
    new_winner_id TEXT NOT NULL,
    approved_by TEXT DEFAULT NULL,
    status TEXT DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    FOREIGN KEY (challenge_id) REFERENCES challenges(id)
  );

  -- Create indexes for common queries
  CREATE INDEX IF NOT EXISTS idx_players_rank ON players(rank);
  CREATE INDEX IF NOT EXISTS idx_challenges_status ON challenges(status);
  CREATE INDEX IF NOT EXISTS idx_challenges_challenger ON challenges(challenger_id);
  CREATE INDEX IF NOT EXISTS idx_challenges_defender ON challenges(defender_id);
  CREATE INDEX IF NOT EXISTS idx_match_history_player ON match_history(player_id);
  CREATE INDEX IF NOT EXISTS idx_match_history_date ON match_history(match_date);
  CREATE INDEX IF NOT EXISTS idx_predictions_challenge ON predictions(challenge_id);
`);

// Migration: Add new stats columns to players table
const migrations = [
  // Streak tracking
  'ALTER TABLE players ADD COLUMN win_streak INTEGER DEFAULT 0',
  'ALTER TABLE players ADD COLUMN best_win_streak INTEGER DEFAULT 0',
  'ALTER TABLE players ADD COLUMN loss_streak INTEGER DEFAULT 0',
  // Title tracking
  'ALTER TABLE players ADD COLUMN title_defenses INTEGER DEFAULT 0',
  'ALTER TABLE players ADD COLUMN title_takes INTEGER DEFAULT 0',
  // Match type tracking
  'ALTER TABLE players ADD COLUMN perfect_matches INTEGER DEFAULT 0',
  'ALTER TABLE players ADD COLUMN comeback_wins INTEGER DEFAULT 0',
  // Rank tracking
  'ALTER TABLE players ADD COLUMN highest_rank INTEGER DEFAULT NULL',
  'ALTER TABLE players ADD COLUMN rank_since INTEGER DEFAULT NULL',
  // Points tracking
  'ALTER TABLE players ADD COLUMN total_points INTEGER DEFAULT 0',
  'ALTER TABLE players ADD COLUMN total_points_conceded INTEGER DEFAULT 0',
  // Reminder tracking
  'ALTER TABLE challenges ADD COLUMN last_reminder_at INTEGER DEFAULT NULL',
  'ALTER TABLE match_results ADD COLUMN last_reminder_at INTEGER DEFAULT NULL',
  // Thread tracking
  'ALTER TABLE challenges ADD COLUMN thread_id TEXT DEFAULT NULL',
  // DM notifications preference
  'ALTER TABLE players ADD COLUMN dm_notifications INTEGER DEFAULT 0',
  // ELO rating (hidden)
  'ALTER TABLE players ADD COLUMN elo INTEGER DEFAULT 1200',
];

for (const migration of migrations) {
  try {
    db.exec(migration);
  } catch (err) {
    // Column already exists, ignore
    if (!err.message.includes('duplicate column')) {
      console.error('Migration error:', err.message);
    }
  }
}

console.log('Database initialized successfully');

export default db;
