import { Client, GatewayIntentBits, Events, REST, Routes } from 'discord.js';
import { config } from './config.js';
import './database/init.js'; // Initialize database on startup
import { handleInteraction } from './handlers/interactionHandler.js';
import { initializeLeaderboard } from './services/leaderboard.js';
import { initializeChallengePanel } from './services/challengePanel.js';
import { initializeAdminPanel } from './services/adminPanel.js';
import { startExpirationChecker } from './services/expiration.js';
import { adminCommands } from './commands/admin.js';
import { setupCommand, isConfigured } from './commands/setup.js';
import { profileCommand } from './commands/profile.js';
import { h2hCommand } from './commands/h2h.js';
import { historyCommand } from './commands/history.js';

// Create Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
  ],
});

// Register slash commands
async function registerCommands(clientId, guildIds) {
  const rest = new REST().setToken(config.token);

  // Combine all commands
  const allCommands = [setupCommand, profileCommand, h2hCommand, historyCommand, ...adminCommands];
  const commandsJson = allCommands.map(cmd => cmd.toJSON());

  try {
    console.log('Registering slash commands...');

    // Register to all guilds the bot is in
    for (const guildId of guildIds) {
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commandsJson }
      );
      console.log(`  Registered commands for guild ${guildId}`);
    }

    console.log('Slash commands registered!');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
}

// Ready event
client.once(Events.ClientReady, async (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  console.log(`Serving ${c.guilds.cache.size} guild(s)`);

  // Register slash commands
  const guildIds = c.guilds.cache.map(g => g.id);
  await registerCommands(c.user.id, guildIds);

  // Check if bot is configured
  if (!isConfigured()) {
    console.log('');
    console.log('========================================');
    console.log('  ZenBot needs to be configured!');
    console.log('  Run /setup in your Discord server');
    console.log('========================================');
    console.log('');
  } else {
    // Initialize persistent messages
    console.log('Initializing panels...');
    await initializeLeaderboard(client);
    await initializeChallengePanel(client);
    await initializeAdminPanel(client);

    // Start background tasks
    startExpirationChecker(client);

    console.log('ZenBot is ready!');
  }
});

// Interaction handler
client.on(Events.InteractionCreate, handleInteraction);

// Error handling
client.on(Events.Error, (error) => {
  console.error('Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

// Login
client.login(config.token);
