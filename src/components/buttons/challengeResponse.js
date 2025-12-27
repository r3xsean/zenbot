import { challenges } from '../../database/queries.js';
import { config } from '../../config.js';
import { buildSubmitResultButton } from '../../embeds/challenge.js';
import { processMatchCompletion } from '../../services/matchCompletion.js';

// Prediction reaction emojis
const PREDICTION_CHALLENGER = '⚫'; // Black for challenger
const PREDICTION_DEFENDER = '⚪';   // White for defender

/**
 * Handle challenge accept button
 */
export async function handleChallengeAccept(interaction, challengeId) {
  const challenge = challenges.getById(challengeId);

  if (!challenge) {
    return interaction.reply({
      content: 'This challenge no longer exists.',
      ephemeral: true,
    });
  }

  // Only defender can accept
  if (interaction.user.id !== challenge.defender_id) {
    return interaction.reply({
      content: 'Only the defender can accept this challenge.',
      ephemeral: true,
    });
  }

  if (challenge.status !== 'pending') {
    return interaction.reply({
      content: 'This challenge is no longer pending.',
      ephemeral: true,
    });
  }

  // Update challenge status
  challenges.updateStatus(challengeId, 'accepted');

  const submitButton = buildSubmitResultButton(challengeId);

  // Update the same message to show match in progress
  const content = `## **Match In Progress**

**Challenger ${PREDICTION_CHALLENGER}** <@${challenge.challenger_id}>
**Defender ${PREDICTION_DEFENDER}** <@${challenge.defender_id}>
**Rank at Stake:** #${challenge.defender_rank}

Play your match in Roblox!
When done, <@${challenge.challenger_id}> submits the result, then <@${challenge.defender_id}> confirms it.

**Predict the winner:**`;

  await interaction.update({
    content,
    embeds: [],
    components: [submitButton],
  });

  // Add prediction reactions to the message
  try {
    const message = await interaction.message.fetch();
    await message.react(PREDICTION_CHALLENGER);
    await message.react(PREDICTION_DEFENDER);
  } catch (err) {
    console.log('Could not add prediction reactions:', err.message);
  }
}

/**
 * Handle challenge decline button
 */
export async function handleChallengeDecline(interaction, challengeId) {
  const challenge = challenges.getById(challengeId);

  if (!challenge) {
    return interaction.reply({
      content: 'This challenge no longer exists.',
      ephemeral: true,
    });
  }

  // Only defender can decline
  if (interaction.user.id !== challenge.defender_id) {
    return interaction.reply({
      content: 'Only the defender can decline this challenge.',
      ephemeral: true,
    });
  }

  if (challenge.status !== 'pending') {
    return interaction.reply({
      content: 'This challenge is no longer pending.',
      ephemeral: true,
    });
  }

  // Decline = forfeit, challenger wins
  challenges.updateStatus(challengeId, 'forfeited');

  // Process match completion (forfeit - no scores, no cooldowns)
  await processMatchCompletion({
    client: interaction.client,
    challengerId: challenge.challenger_id,
    defenderId: challenge.defender_id,
    defenderRank: challenge.defender_rank,
    winnerId: challenge.challenger_id,
    loserId: challenge.defender_id,
    setsWinner: 2,
    setsLoser: 0,
    scores: null,
    challengeId: challenge.id,
    isForfeit: true,
    skipCooldown: true,
  });

  // Post to logs
  const logsChannel = interaction.client.channels.cache.get(config.channels.logs);
  if (logsChannel) {
    await logsChannel.send(
      `> ## **Forfeit**\n>\n` +
      `> <@${challenge.defender_id}> declined the challenge from <@${challenge.challenger_id}>.\n` +
      `> <@${challenge.challenger_id}> claims Rank #${challenge.defender_rank} by forfeit.\n>\n` +
      `> *No cooldown applied.*`
    );
  }

  // Archive the match thread if it exists
  if (challenge.thread_id) {
    try {
      const thread = await interaction.client.channels.fetch(challenge.thread_id);
      if (thread) {
        await thread.send(`**Challenge Forfeited.** <@${challenge.challenger_id}> wins by forfeit. This thread will be archived.`);
        await thread.setArchived(true);
      }
    } catch (err) {
      console.log('Could not archive thread:', err.message);
    }
  }

  await interaction.update({
    content:
      `**Challenge Forfeited**\n\n` +
      `<@${challenge.defender_id}> declined the challenge.\n` +
      `<@${challenge.challenger_id}> wins by forfeit and takes Rank #${challenge.defender_rank}!`,
    embeds: [],
    components: [],
  });
}
