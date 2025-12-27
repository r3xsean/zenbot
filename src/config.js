import 'dotenv/config';
import { botState } from './database/queries.js';

// Channel keys that can be configured
const CHANNEL_KEYS = ['leaderboard', 'challengePanel', 'request', 'logs', 'admin', 'disputes'];

// Cached channel config
let cachedChannels = null;

// Cached settings
let cachedSettings = null;

/**
 * Get channel configuration from database (with .env fallback)
 */
function loadChannels() {
  const channels = {};

  for (const key of CHANNEL_KEYS) {
    // Try database first
    const dbValue = botState.get(`channel_${key}`);
    if (dbValue) {
      channels[key] = dbValue;
      continue;
    }

    // Fall back to .env
    const envKey = `CHANNEL_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`;
    channels[key] = process.env[envKey] || null;
  }

  return channels;
}

/**
 * Load settings from database (with .env fallback)
 */
function loadSettings() {
  const cooldownHours = botState.get('setting_cooldown_hours');
  const responseWindowHours = botState.get('setting_response_window_hours');

  return {
    cooldownHours: cooldownHours ? parseFloat(cooldownHours) : (parseInt(process.env.COOLDOWN_HOURS) || 8),
    responseWindowHours: responseWindowHours ? parseFloat(responseWindowHours) : (parseInt(process.env.RESPONSE_WINDOW_HOURS) || 12),
    reminderIntervalMinutes: parseInt(process.env.REMINDER_INTERVAL_MINUTES) || 30,
  };
}

/**
 * Clear channel cache (call after setup changes)
 */
export function clearChannelCache() {
  cachedChannels = null;
}

/**
 * Clear settings cache (call after settings changes)
 */
export function clearSettingsCache() {
  cachedSettings = null;
}

export const config = {
  // Discord
  token: process.env.DISCORD_TOKEN,

  // Channels - accessed via getter to allow lazy loading from DB
  get channels() {
    if (!cachedChannels) {
      cachedChannels = loadChannels();
    }
    return cachedChannels;
  },

  // Bot Settings - accessed via getters to allow dynamic updates
  get cooldownHours() {
    if (!cachedSettings) {
      cachedSettings = loadSettings();
    }
    return cachedSettings.cooldownHours;
  },

  get responseWindowHours() {
    if (!cachedSettings) {
      cachedSettings = loadSettings();
    }
    return cachedSettings.responseWindowHours;
  },

  get reminderIntervalMinutes() {
    if (!cachedSettings) {
      cachedSettings = loadSettings();
    }
    return cachedSettings.reminderIntervalMinutes;
  },

  // Derived values (in milliseconds)
  get cooldownMs() {
    return this.cooldownHours * 60 * 60 * 1000;
  },
  get responseWindowMs() {
    return this.responseWindowHours * 60 * 60 * 1000;
  },
  get reminderIntervalMs() {
    return this.reminderIntervalMinutes * 60 * 1000;
  },

  // Game rules
  maxRank: 10,
  openChallengeRanks: [8, 9, 10], // Anyone can challenge these
  setsToWin: 2,
  pointsPerSet: 10,
};

// Only validate token on startup (channels are configured via /setup)
if (!config.token) {
  console.error('Missing required config: DISCORD_TOKEN');
  process.exit(1);
}
