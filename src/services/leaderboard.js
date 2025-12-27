import { config } from '../config.js';
import { botState } from '../database/queries.js';
import { buildLeaderboardContent } from '../embeds/leaderboard.js';

/**
 * Initialize the leaderboard message (create if doesn't exist, or fetch existing)
 */
export async function initializeLeaderboard(client) {
  const channel = client.channels.cache.get(config.channels.leaderboard);

  if (!channel) {
    console.error('Leaderboard channel not found!');
    return;
  }

  const existingMessageId = botState.get('leaderboard_message_id');

  if (existingMessageId) {
    try {
      const message = await channel.messages.fetch(existingMessageId);
      console.log('Found existing leaderboard message');
      await updateLeaderboard(client);
      return message;
    } catch {
      console.log('Existing leaderboard message not found, creating new one');
    }
  }

  // Create new leaderboard message
  const content = buildLeaderboardContent();
  const message = await channel.send({ content });

  botState.set('leaderboard_message_id', message.id);
  console.log('Created new leaderboard message');

  return message;
}

/**
 * Update the leaderboard
 */
export async function updateLeaderboard(client) {
  const channel = client.channels.cache.get(config.channels.leaderboard);
  const messageId = botState.get('leaderboard_message_id');

  if (!channel || !messageId) {
    console.error('Cannot update leaderboard - channel or message not found');
    return;
  }

  try {
    const message = await channel.messages.fetch(messageId);
    const content = buildLeaderboardContent();
    await message.edit({ content, embeds: [] });
  } catch (error) {
    console.error('Error updating leaderboard:', error);
  }
}

/**
 * Schedule leaderboard refresh when cooldowns expire
 */
export function scheduleLeaderboardRefresh(client, expiresAt) {
  const delay = expiresAt - Date.now();
  if (delay > 0) {
    setTimeout(() => {
      updateLeaderboard(client);
    }, delay + 1000); // Add 1 second buffer
  }
}
