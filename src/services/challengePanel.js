import { config } from '../config.js';
import { botState } from '../database/queries.js';
import { buildChallengePanelEmbed, buildChallengePanelButton } from '../embeds/challenge.js';

/**
 * Initialize the challenge panel message
 */
export async function initializeChallengePanel(client) {
  const channel = client.channels.cache.get(config.channels.challengePanel);

  if (!channel) {
    console.error('Challenge panel channel not found!');
    return;
  }

  const existingMessageId = botState.get('challenge_panel_message_id');

  if (existingMessageId) {
    try {
      const message = await channel.messages.fetch(existingMessageId);
      console.log('Found existing challenge panel message');
      return message;
    } catch {
      console.log('Existing challenge panel message not found, creating new one');
    }
  }

  // Create new challenge panel
  const embed = buildChallengePanelEmbed();
  const button = buildChallengePanelButton();

  const message = await channel.send({
    embeds: [embed],
    components: [button],
  });

  botState.set('challenge_panel_message_id', message.id);
  console.log('Created new challenge panel message');

  return message;
}
