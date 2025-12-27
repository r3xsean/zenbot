import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js';
import { challenges, corrections, players, matchHistory } from '../../database/queries.js';
import { config } from '../../config.js';
import { buildCorrectionApprovalButtons } from '../../embeds/challenge.js';
import { updateLeaderboard } from '../../services/leaderboard.js';

/**
 * Handle correction request button - opens modal
 */
export async function handleCorrectionRequest(interaction, challengeId) {
  const challenge = challenges.getById(challengeId);

  if (!challenge) {
    return interaction.reply({
      content: 'This challenge no longer exists.',
      ephemeral: true,
    });
  }

  // Only the two players can request corrections
  const userId = interaction.user.id;
  if (userId !== challenge.challenger_id && userId !== challenge.defender_id) {
    return interaction.reply({
      content: 'Only the players in this match can request a correction.',
      ephemeral: true,
    });
  }

  // Check if there's already a pending correction
  const pendingCorrection = corrections.getPendingForChallenge(challengeId);
  if (pendingCorrection) {
    return interaction.reply({
      content: 'There\'s already a pending correction request for this match.',
      ephemeral: true,
    });
  }

  // Get usernames for clarity
  let challengerName = 'Challenger';
  let defenderName = 'Defender';

  try {
    const challengerUser = await interaction.client.users.fetch(challenge.challenger_id);
    const defenderUser = await interaction.client.users.fetch(challenge.defender_id);
    challengerName = challengerUser.username;
    defenderName = defenderUser.username;
  } catch (e) {
    // Use defaults
  }

  const modal = new ModalBuilder()
    .setCustomId(`correction_modal_${challengeId}`)
    .setTitle('Request Score Correction');

  const set1Input = new TextInputBuilder()
    .setCustomId('set1')
    .setLabel(`Set 1: ${challengerName} - ${defenderName}`)
    .setPlaceholder('e.g., 10-6')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(10);

  const set2Input = new TextInputBuilder()
    .setCustomId('set2')
    .setLabel(`Set 2: ${challengerName} - ${defenderName}`)
    .setPlaceholder('e.g., 8-10')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(10);

  const set3Input = new TextInputBuilder()
    .setCustomId('set3')
    .setLabel(`Set 3: ${challengerName} - ${defenderName} (if played)`)
    .setPlaceholder('Leave blank if match ended 2-0')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(10);

  modal.addComponents(
    new ActionRowBuilder().addComponents(set1Input),
    new ActionRowBuilder().addComponents(set2Input),
    new ActionRowBuilder().addComponents(set3Input)
  );

  await interaction.showModal(modal);
}

/**
 * Handle correction modal submission
 */
export async function handleCorrectionModal(interaction, challengeId) {
  const challenge = challenges.getById(challengeId);
  if (!challenge) {
    return interaction.reply({
      content: 'This challenge no longer exists.',
      ephemeral: true,
    });
  }

  const userId = interaction.user.id;

  // Parse scores
  const set1 = interaction.fields.getTextInputValue('set1').trim();
  const set2 = interaction.fields.getTextInputValue('set2').trim();
  const set3 = interaction.fields.getTextInputValue('set3')?.trim() || null;

  const parseScore = (scoreStr) => {
    const match = scoreStr.match(/^(\d{1,2})\s*[-–]\s*(\d{1,2})$/);
    if (!match) return null;
    return {
      challenger: parseInt(match[1]),
      defender: parseInt(match[2])
    };
  };

  const score1 = parseScore(set1);
  const score2 = parseScore(set2);
  const score3 = set3 ? parseScore(set3) : null;

  if (!score1 || !score2) {
    return interaction.reply({
      content: 'Invalid score format. Use "10-6" format.',
      ephemeral: true,
    });
  }

  if (set3 && !score3) {
    return interaction.reply({
      content: 'Invalid Set 3 score format.',
      ephemeral: true,
    });
  }

  // Validate and count sets
  const scores = [score1, score2];
  if (score3) scores.push(score3);

  let challengerSets = 0;
  let defenderSets = 0;

  for (const score of scores) {
    if (score.challenger >= 10 && score.challenger > score.defender) {
      challengerSets++;
    } else if (score.defender >= 10 && score.defender > score.challenger) {
      defenderSets++;
    } else {
      return interaction.reply({
        content: `Invalid set score: ${score.challenger}-${score.defender}. Winner must reach 10+ and be ahead.`,
        ephemeral: true,
      });
    }
  }

  if (challengerSets < 2 && defenderSets < 2) {
    return interaction.reply({
      content: 'Invalid result - no one has won 2 sets yet.',
      ephemeral: true,
    });
  }

  // Determine new winner
  const newWinnerId = challengerSets >= 2 ? challenge.challenger_id : challenge.defender_id;
  const otherPlayerId = userId === challenge.challenger_id ? challenge.defender_id : challenge.challenger_id;

  // Create correction request
  const correctionId = corrections.create(challengeId, userId, scores, newWinnerId);

  // Format scores for display
  const scoreLines = scores.map((s, i) => `Set ${i + 1}: ${s.challenger}-${s.defender}`).join(', ');

  // Notify the other player
  const approvalButtons = buildCorrectionApprovalButtons(correctionId);

  await interaction.reply({
    content:
      `**Score Correction Request**\n\n` +
      `<@${userId}> is requesting a score correction for the match against <@${otherPlayerId}>.\n\n` +
      `**Proposed scores:** ${scoreLines}\n` +
      `**Winner would be:** <@${newWinnerId}>\n\n` +
      `<@${otherPlayerId}> - Please approve or reject this correction:`,
    components: [approvalButtons],
  });
}

/**
 * Handle correction approval
 */
export async function handleCorrectionApprove(interaction, correctionId) {
  const correction = corrections.getById(correctionId);

  if (!correction) {
    return interaction.reply({
      content: 'This correction request no longer exists.',
      ephemeral: true,
    });
  }

  if (correction.status !== 'pending') {
    return interaction.reply({
      content: 'This correction has already been processed.',
      ephemeral: true,
    });
  }

  const challenge = challenges.getById(correction.challenge_id);
  if (!challenge) {
    return interaction.reply({
      content: 'The challenge no longer exists.',
      ephemeral: true,
    });
  }

  const userId = interaction.user.id;

  // Only the OTHER player can approve (not the requester)
  if (userId === correction.requested_by) {
    return interaction.reply({
      content: 'You can\'t approve your own correction request.',
      ephemeral: true,
    });
  }

  // Must be one of the two players
  if (userId !== challenge.challenger_id && userId !== challenge.defender_id) {
    return interaction.reply({
      content: 'Only the other player in this match can approve corrections.',
      ephemeral: true,
    });
  }

  // Approve the correction
  corrections.approve(correctionId, userId);

  // Note: Full stat recalculation would be complex (need to undo old stats, apply new)
  // For simplicity, just log the correction - admins can manually adjust if needed
  const newScores = JSON.parse(correction.new_scores);
  const scoreLines = newScores.map((s, i) => `Set ${i + 1}: ${s.challenger}-${s.defender}`).join(', ');

  // Post to logs
  const logsChannel = interaction.client.channels.cache.get(config.channels.logs);
  if (logsChannel) {
    await logsChannel.send(
      `**Score Correction Approved**\n\n` +
      `Match: <@${challenge.challenger_id}> vs <@${challenge.defender_id}>\n` +
      `**Corrected scores:** ${scoreLines}\n` +
      `**Winner:** <@${correction.new_winner_id}>\n\n` +
      `*Requested by <@${correction.requested_by}>, approved by <@${userId}>*\n` +
      `*Note: Stats may need manual adjustment by an admin if the winner changed.*`
    );
  }

  await interaction.update({
    content:
      `**Correction Approved**\n\n` +
      `The score has been corrected to: ${scoreLines}\n` +
      `Winner: <@${correction.new_winner_id}>\n\n` +
      `*Both players agreed to this correction.*`,
    components: [],
  });
}

/**
 * Handle correction rejection
 */
export async function handleCorrectionReject(interaction, correctionId) {
  const correction = corrections.getById(correctionId);

  if (!correction) {
    return interaction.reply({
      content: 'This correction request no longer exists.',
      ephemeral: true,
    });
  }

  if (correction.status !== 'pending') {
    return interaction.reply({
      content: 'This correction has already been processed.',
      ephemeral: true,
    });
  }

  const challenge = challenges.getById(correction.challenge_id);
  if (!challenge) {
    return interaction.reply({
      content: 'The challenge no longer exists.',
      ephemeral: true,
    });
  }

  const userId = interaction.user.id;

  // Only the OTHER player can reject
  if (userId === correction.requested_by) {
    return interaction.reply({
      content: 'You can\'t reject your own correction request. Just wait for the other player.',
      ephemeral: true,
    });
  }

  // Must be one of the two players
  if (userId !== challenge.challenger_id && userId !== challenge.defender_id) {
    return interaction.reply({
      content: 'Only the other player in this match can reject corrections.',
      ephemeral: true,
    });
  }

  corrections.reject(correctionId);

  await interaction.update({
    content:
      `**Correction Rejected**\n\n` +
      `<@${userId}> rejected the score correction request.\n` +
      `The original result stands. If there's a dispute, contact an admin.`,
    components: [],
  });
}
