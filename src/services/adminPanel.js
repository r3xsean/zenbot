import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { config } from '../config.js';
import { botState } from '../database/queries.js';

/**
 * Format hours for display
 */
function formatHours(hours) {
  if (hours < 1) {
    return `${Math.round(hours * 60)} minutes`;
  }
  if (hours === 1) {
    return '1 hour';
  }
  return `${hours} hours`;
}

/**
 * Build the admin panel embed
 */
function buildAdminPanelEmbed() {
  return new EmbedBuilder()
    .setTitle('Admin Controls')
    .setColor(0x2F3136)
    .addFields(
      {
        name: 'Player Management',
        value: 'Set Rank, Remove Rank, Clear Cooldown',
        inline: true,
      },
      {
        name: 'Match Management',
        value: 'Force Result, Cancel Challenge, View Pending',
        inline: true,
      },
      {
        name: 'Current Settings',
        value: `Cooldown: **${formatHours(config.cooldownHours)}**\nResponse Window: **${formatHours(config.responseWindowHours)}**`,
        inline: false,
      }
    )
    .setFooter({ text: 'Only administrators can use these controls' });
}

/**
 * Build the admin panel buttons
 */
function buildAdminPanelButtons() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('admin_setrank')
      .setLabel('Set Rank')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('admin_removerank')
      .setLabel('Remove Rank')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('admin_clearcooldown')
      .setLabel('Clear Cooldown')
      .setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('admin_forceresult')
      .setLabel('Force Result')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('admin_cancelchallenge')
      .setLabel('Cancel Challenge')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('admin_viewpending')
      .setLabel('View Pending')
      .setStyle(ButtonStyle.Secondary)
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('admin_setcooldown')
      .setLabel('Set Cooldown')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('admin_setresponsewindow')
      .setLabel('Set Response Window')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('admin_refresh')
      .setLabel('Refresh')
      .setStyle(ButtonStyle.Secondary)
  );

  return [row1, row2, row3];
}

/**
 * Initialize the admin panel message
 */
export async function initializeAdminPanel(client) {
  const channel = client.channels.cache.get(config.channels.admin);

  if (!channel) {
    console.log('Admin channel not configured, skipping admin panel');
    return;
  }

  const existingMessageId = botState.get('admin_panel_message_id');

  if (existingMessageId) {
    try {
      const message = await channel.messages.fetch(existingMessageId);
      // Update the message with latest buttons
      await message.edit({
        embeds: [buildAdminPanelEmbed()],
        components: buildAdminPanelButtons(),
      });
      console.log('Updated existing admin panel message');
      return message;
    } catch {
      console.log('Existing admin panel message not found, creating new one');
    }
  }

  // Create new admin panel
  const embed = buildAdminPanelEmbed();
  const buttons = buildAdminPanelButtons();

  const message = await channel.send({
    embeds: [embed],
    components: buttons,
  });

  botState.set('admin_panel_message_id', message.id);
  console.log('Created new admin panel message');

  return message;
}

/**
 * Refresh the admin panel (call after settings change)
 */
export async function refreshAdminPanel(client) {
  const channel = client.channels.cache.get(config.channels.admin);
  const messageId = botState.get('admin_panel_message_id');

  if (!channel || !messageId) return;

  try {
    const message = await channel.messages.fetch(messageId);
    await message.edit({
      embeds: [buildAdminPanelEmbed()],
      components: buildAdminPanelButtons(),
    });
  } catch (err) {
    console.log('Could not refresh admin panel:', err.message);
  }
}
