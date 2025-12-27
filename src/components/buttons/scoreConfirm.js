import { challenges, matchResults } from '../../database/queries.js';
import { config } from '../../config.js';
import { buildChallengeLogContent, buildDisputeContent, buildDisputeButton } from '../../embeds/log.js';
import { buildCorrectionButton } from '../../embeds/challenge.js';
import { processMatchCompletion } from '../../services/matchCompletion.js';

// Prediction reaction emojis (must match challengeResponse.js)
const PREDICTION_CHALLENGER = '⚫';
const PREDICTION_DEFENDER = '⚪';

/**
 * Handle score confirmation
 */
export async function handleScoreConfirm(interaction, resultId) {
  const result = matchResults.getById(resultId);

  if (!result) {
    return interaction.reply({
      content: 'This result no longer exists.',
      ephemeral: true,
    });
  }

  const challenge = challenges.getById(result.challenge_id);

  if (!challenge) {
    return interaction.reply({
      content: 'The challenge no longer exists.',
      ephemeral: true,
    });
  }

  // Only the defender can confirm
  const userId = interaction.user.id;

  if (userId === challenge.challenger_id) {
    return interaction.reply({
      content: `You submitted this result. Waiting for <@${challenge.defender_id}> to confirm.`,
      ephemeral: true,
    });
  }

  if (userId !== challenge.defender_id) {
    return interaction.reply({
      content: 'Only the defender can confirm the result.',
      ephemeral: true,
    });
  }

  if (result.confirmed) {
    return interaction.reply({
      content: 'This result has already been confirmed.',
      ephemeral: true,
    });
  }

  if (result.disputed) {
    return interaction.reply({
      content: 'This result has been disputed.',
      ephemeral: true,
    });
  }

  // Confirm the result
  matchResults.confirm(resultId);
  challenges.updateStatus(challenge.id, 'completed');

  // Parse scores
  const scores = JSON.parse(result.scores);

  // Process match completion (ranks, stats, cooldowns, history, leaderboard)
  const { newWinnerRank, newLoserRank, cooldownUntil } = await processMatchCompletion({
    client: interaction.client,
    challengerId: challenge.challenger_id,
    defenderId: challenge.defender_id,
    defenderRank: challenge.defender_rank,
    winnerId: result.winner_id,
    loserId: result.loser_id,
    setsWinner: result.sets_winner,
    setsLoser: result.sets_loser,
    scores,
    challengeId: challenge.id,
  });

  // Count prediction reactions from the message
  let predictionData = null;
  try {
    const message = interaction.message;
    const challengerReaction = message.reactions.cache.get(PREDICTION_CHALLENGER);
    const defenderReaction = message.reactions.cache.get(PREDICTION_DEFENDER);

    // Count users (subtract 1 for bot's own reaction)
    const challengerCount = challengerReaction ? Math.max(0, challengerReaction.count - 1) : 0;
    const defenderCount = defenderReaction ? Math.max(0, defenderReaction.count - 1) : 0;
    const total = challengerCount + defenderCount;

    if (total > 0) {
      predictionData = {
        challengerCount,
        defenderCount,
        total,
      };
    }
  } catch (e) {
    // Couldn't count reactions, skip predictions
  }

  // Post to logs channel
  const logsChannel = interaction.client.channels.cache.get(config.channels.logs);

  if (logsChannel) {
    const logContent = buildChallengeLogContent({
      challengerId: challenge.challenger_id,
      defenderId: challenge.defender_id,
      defenderRank: challenge.defender_rank,
      winnerId: result.winner_id,
      loserId: result.loser_id,
      scores,
      setsWinner: result.sets_winner,
      setsLoser: result.sets_loser,
      newWinnerRank,
      newLoserRank,
      cooldownExpires: cooldownUntil,
      predictions: predictionData,
    });

    await logsChannel.send({ content: logContent });
  }

  // Archive the match thread if it exists
  if (challenge.thread_id) {
    try {
      const thread = await interaction.client.channels.fetch(challenge.thread_id);
      if (thread) {
        await thread.send(`**Match Complete!** This thread will be archived.`);
        await thread.setArchived(true);
      }
    } catch (err) {
      console.log('Could not archive thread:', err.message);
    }
  }

  // Format scores for display
  const scoreLines = scores.map((set, i) => {
    return `Set ${i + 1}: <@${challenge.challenger_id}> ${set.challenger} - ${set.defender} <@${challenge.defender_id}>`;
  }).join('\n');

  // Build correction button for the completed match
  const correctionButton = buildCorrectionButton(challenge.id);

  // Update the challenge message
  await interaction.update({
    content:
      `**Match Complete!**\n\n` +
      `**Winner:** <@${result.winner_id}> (${result.sets_winner}-${result.sets_loser})\n` +
      `**Loser:** <@${result.loser_id}>\n\n` +
      `${scoreLines}\n\n` +
      `Cooldown expires <t:${Math.floor(cooldownUntil / 1000)}:R>`,
    embeds: [],
    components: [correctionButton],
  });
}

/**
 * Handle score dispute
 */
export async function handleScoreDispute(interaction, resultId) {
  const result = matchResults.getById(resultId);

  if (!result) {
    return interaction.reply({
      content: 'This result no longer exists.',
      ephemeral: true,
    });
  }

  const challenge = challenges.getById(result.challenge_id);

  if (!challenge) {
    return interaction.reply({
      content: 'The challenge no longer exists.',
      ephemeral: true,
    });
  }

  // Only the defender can dispute
  const userId = interaction.user.id;

  if (userId === challenge.challenger_id) {
    return interaction.reply({
      content: 'You submitted this result. If it\'s wrong, ask the defender to dispute it.',
      ephemeral: true,
    });
  }

  if (userId !== challenge.defender_id) {
    return interaction.reply({
      content: 'Only the defender can dispute the result.',
      ephemeral: true,
    });
  }

  if (result.confirmed || result.disputed) {
    return interaction.reply({
      content: 'This result has already been processed.',
      ephemeral: true,
    });
  }

  // Mark as disputed
  matchResults.dispute(resultId);
  challenges.updateStatus(challenge.id, 'disputed');

  // Alert admins in disputes channel
  const disputesChannel = interaction.client.channels.cache.get(config.channels.disputes);

  if (disputesChannel) {
    const scores = JSON.parse(result.scores);
    const disputeContent = buildDisputeContent({
      challengeId: challenge.id,
      resultId: resultId,
      challengerId: challenge.challenger_id,
      defenderId: challenge.defender_id,
      defenderRank: challenge.defender_rank,
      submittedById: result.submitted_by,
      disputedById: userId,
      claimedWinnerId: result.winner_id,
      claimedLoserId: result.loser_id,
      scores,
    });

    const button = buildDisputeButton(challenge.id);

    await disputesChannel.send({
      content: disputeContent,
      components: [button],
    });
  }

  await interaction.update({
    content:
      `**Result Disputed**\n\n` +
      `<@${userId}> has disputed the submitted result.\n` +
      `An admin will review and resolve this.`,
    embeds: [],
    components: [],
  });
}
