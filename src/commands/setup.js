import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { botState } from '../database/queries.js';

export const setupCommand = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Set up ZenBot channels for this server')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

/**
 * Channel configuration steps
 */
const SETUP_STEPS = [
  {
    key: 'leaderboard',
    name: 'Leaderboard Channel',
    description: 'Where the live leaderboard will be displayed',
  },
  {
    key: 'challengePanel',
    name: 'Challenge Panel Channel',
    description: 'Where the "Challenge Someone" button will be',
  },
  {
    key: 'request',
    name: 'Challenge Requests Channel',
    description: 'Where active challenge messages will appear',
  },
  {
    key: 'logs',
    name: 'Match Logs Channel',
    description: 'Where completed match results are logged',
  },
  {
    key: 'admin',
    name: 'Admin Controls Channel',
    description: 'Where the admin control panel will be',
  },
  {
    key: 'disputes',
    name: 'Disputes Channel',
    description: 'Where disputed matches appear for admin review',
  },
];

/**
 * Get current channel config from database
 */
export function getChannelConfig() {
  const config = {};
  for (const step of SETUP_STEPS) {
    const value = botState.get(`channel_${step.key}`);
    if (value) {
      config[step.key] = value;
    }
  }
  return config;
}

/**
 * Check if bot is fully configured
 */
export function isConfigured() {
  const config = getChannelConfig();
  return SETUP_STEPS.every(step => config[step.key]);
}

/**
 * Build the setup welcome embed
 */
function buildSetupEmbed(currentConfig) {
  const lines = SETUP_STEPS.map(step => {
    const channelId = currentConfig[step.key];
    const status = channelId ? `<#${channelId}>` : 'Not set';
    return `**${step.name}:** ${status}`;
  });

  const allSet = SETUP_STEPS.every(step => currentConfig[step.key]);

  return new EmbedBuilder()
    .setTitle('ZenBot Setup')
    .setDescription(
      allSet
        ? 'All channels configured! Click **Finish Setup** to initialize the bot.'
        : 'Configure each channel below. Click a button to set that channel.'
    )
    .addFields({ name: 'Channel Configuration', value: lines.join('\n') })
    .setColor(allSet ? 0x00FF00 : 0xFFFF00)
    .setFooter({ text: 'Tip: Create dedicated channels for each purpose' });
}

/**
 * Build channel setup buttons
 */
function buildSetupButtons(currentConfig) {
  const rows = [];

  // First row: Leaderboard, Challenge Panel, Requests
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('setup_channel_leaderboard')
      .setLabel('Leaderboard')
      .setStyle(currentConfig.leaderboard ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('setup_channel_challengePanel')
      .setLabel('Challenge Panel')
      .setStyle(currentConfig.challengePanel ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('setup_channel_request')
      .setLabel('Requests')
      .setStyle(currentConfig.request ? ButtonStyle.Success : ButtonStyle.Primary),
  );

  // Second row: Logs, Admin, Disputes
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('setup_channel_logs')
      .setLabel('Logs')
      .setStyle(currentConfig.logs ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('setup_channel_admin')
      .setLabel('Admin')
      .setStyle(currentConfig.admin ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('setup_channel_disputes')
      .setLabel('Disputes')
      .setStyle(currentConfig.disputes ? ButtonStyle.Success : ButtonStyle.Primary),
  );

  rows.push(row1, row2);

  // Third row: Finish button (only if all configured)
  const allSet = SETUP_STEPS.every(step => currentConfig[step.key]);
  if (allSet) {
    const row3 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('setup_finish')
        .setLabel('Finish Setup')
        .setStyle(ButtonStyle.Success),
    );
    rows.push(row3);
  }

  return rows;
}

/**
 * Handle the /setup command
 */
export async function handleSetupCommand(interaction) {
  const currentConfig = getChannelConfig();
  const embed = buildSetupEmbed(currentConfig);
  const buttons = buildSetupButtons(currentConfig);

  await interaction.reply({
    embeds: [embed],
    components: buttons,
    ephemeral: true,
  });
}

/**
 * Handle setup channel button clicks
 */
export async function handleSetupChannelButton(interaction, channelKey) {
  const step = SETUP_STEPS.find(s => s.key === channelKey);
  if (!step) return;

  const select = new ChannelSelectMenuBuilder()
    .setCustomId(`setup_select_${channelKey}`)
    .setPlaceholder(`Select ${step.name}`)
    .setChannelTypes(ChannelType.GuildText);

  const row = new ActionRowBuilder().addComponents(select);

  await interaction.reply({
    content: `**Select the ${step.name}**\n${step.description}`,
    components: [row],
    ephemeral: true,
  });
}

/**
 * Handle channel selection
 */
export async function handleSetupChannelSelect(interaction, channelKey) {
  const channelId = interaction.values[0];

  // Save to database
  botState.set(`channel_${channelKey}`, channelId);

  const step = SETUP_STEPS.find(s => s.key === channelKey);

  // Show updated setup panel
  const currentConfig = getChannelConfig();
  const embed = buildSetupEmbed(currentConfig);
  const buttons = buildSetupButtons(currentConfig);

  await interaction.update({
    content: `**${step.name}** set to <#${channelId}>!\n\nContinue configuring:`,
    embeds: [embed],
    components: buttons,
  });
}

/**
 * Handle finish setup button
 */
export async function handleSetupFinish(interaction) {
  await interaction.update({
    content: 'Initializing ZenBot...',
    embeds: [],
    components: [],
  });

  try {
    // Clear channel cache so new config is used
    const { clearChannelCache } = await import('../config.js');
    clearChannelCache();

    // Import and initialize services
    const { initializeLeaderboard } = await import('../services/leaderboard.js');
    const { initializeChallengePanel } = await import('../services/challengePanel.js');
    const { initializeAdminPanel } = await import('../services/adminPanel.js');
    const { startExpirationChecker } = await import('../services/expiration.js');

    await initializeLeaderboard(interaction.client);
    await initializeChallengePanel(interaction.client);
    await initializeAdminPanel(interaction.client);

    // Start background tasks
    startExpirationChecker(interaction.client);

    await interaction.editReply({
      content:
        '**ZenBot Setup Complete!**\n\n' +
        '• Leaderboard initialized\n' +
        '• Challenge panel ready\n' +
        '• Admin controls active\n\n' +
        'Use the admin panel to set ranks manually.',
    });
  } catch (error) {
    console.error('Setup error:', error);
    await interaction.editReply({
      content: `Setup failed: ${error.message}\n\nMake sure the bot has permission to send messages in all configured channels.`,
    });
  }
}
