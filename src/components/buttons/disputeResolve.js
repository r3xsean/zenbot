import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import { challenges, matchResults } from '../../database/queries.js';
import { config } from '../../config.js';
import { processMatchCompletion } from '../../services/matchCompletion.js';
import { buildChallengeLogContent } from '../../embeds/log.js';

/**
 * Handle the "Resolve This Dispute" button - opens modal with player names
 */
export async function handleDisputeResolve(interaction, challengeId) {
  // Check admin permission
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      content: 'Only administrators can resolve disputes.',
      ephemeral: true,
    });
  }

  const challenge = challenges.getById(challengeId);
  if (!challenge) {
    return interaction.reply({
      content: 'This challenge no longer exists.',
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
    challengerName = `Challenger (${challenge.challenger_id})`;
    defenderName = `Defender (${challenge.defender_id})`;
  }

  const modal = new ModalBuilder()
    .setCustomId(`dispute_modal_${challengeId}`)
    .setTitle('Resolve Dispute - Enter Correct Scores');

  const set1Input = new TextInputBuilder()
    .setCustomId('set1')
    .setLabel(`Set 1: ${challengerName} - ${defenderName}`)
    .setPlaceholder(`e.g., 10-6 means ${challengerName} got 10, ${defenderName} got 6`)
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(10);

  const set2Input = new TextInputBuilder()
    .setCustomId('set2')
    .setLabel(`Set 2: ${challengerName} - ${defenderName}`)
    .setPlaceholder(`e.g., 8-10 means ${challengerName} got 8, ${defenderName} got 10`)
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
 * Handle the "Void Match" button
 */
export async function handleDisputeVoid(interaction, challengeId) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      content: 'Only administrators can void matches.',
      ephemeral: true,
    });
  }

  const challenge = challenges.getById(challengeId);
  if (!challenge) {
    return interaction.reply({
      content: 'This challenge no longer exists.',
      ephemeral: true,
    });
  }

  // Void the match - no rank changes, no cooldowns
  challenges.updateStatus(challengeId, 'voided');

  await interaction.update({
    content:
      `**Match Voided**\n\n` +
      `*Voided by <@${interaction.user.id}>*`,
    embeds: [],
    components: [],
  });

  // Post to logs
  const logsChannel = interaction.client.channels.cache.get(config.channels.logs);
  if (logsChannel) {
    await logsChannel.send(
      `**Match Voided**\n\n` +
      `Challenger: <@${challenge.challenger_id}>\n` +
      `Defender: <@${challenge.defender_id}>\n` +
      `Rank: #${challenge.defender_rank}\n\n` +
      `*Voided by <@${interaction.user.id}>*`
    );
  }

  // Update the original challenge message
  if (challenge.message_id && challenge.channel_id) {
    try {
      const requestChannel = interaction.client.channels.cache.get(challenge.channel_id);
      if (requestChannel) {
        const challengeMessage = await requestChannel.messages.fetch(challenge.message_id);
        await challengeMessage.edit({
          content:
            `**Match Voided**\n\n` +
            `<@${challenge.challenger_id}> vs <@${challenge.defender_id}>\n` +
            `No rank changes applied.`,
          embeds: [],
          components: [],
        });
      }
    } catch (err) {
      console.log('Could not update challenge message:', err.message);
    }
  }

  // Archive the match thread if it exists
  if (challenge.thread_id) {
    try {
      const thread = await interaction.client.channels.fetch(challenge.thread_id);
      if (thread) {
        await thread.send(`**Match Voided.** No rank changes applied. This thread will be archived.`);
        await thread.setArchived(true);
      }
    } catch (err) {
      console.log('Could not archive thread:', err.message);
    }
  }
}

/**
 * Handle the dispute resolution modal submission
 */
export async function handleDisputeModal(interaction, challengeId) {
  const challenge = challenges.getById(challengeId);
  if (!challenge) {
    return interaction.reply({
      content: 'This challenge no longer exists.',
      ephemeral: true,
    });
  }

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

  // Count sets won
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

  // Determine winner
  const challengerWins = challengerSets >= 2;
  const winnerId = challengerWins ? challenge.challenger_id : challenge.defender_id;
  const loserId = challengerWins ? challenge.defender_id : challenge.challenger_id;
  const setsWinner = Math.max(challengerSets, defenderSets);
  const setsLoser = Math.min(challengerSets, defenderSets);

  // Update challenge status
  challenges.updateStatus(challengeId, 'completed');

  // Process match completion (ranks, stats, cooldowns, history, leaderboard)
  const { newWinnerRank, newLoserRank, cooldownUntil } = await processMatchCompletion({
    client: interaction.client,
    challengerId: challenge.challenger_id,
    defenderId: challenge.defender_id,
    defenderRank: challenge.defender_rank,
    winnerId,
    loserId,
    setsWinner,
    setsLoser,
    scores,
    challengeId,
  });

  // Format scores for display
  const scoreLines = scores.map((set, i) => {
    return `Set ${i + 1}: <@${challenge.challenger_id}> ${set.challenger} - ${set.defender} <@${challenge.defender_id}>`;
  }).join('\n');

  // Update the admin dispute message
  await interaction.update({
    content:
      `# **Dispute Resolved**\n_ _\n` +
      `**Winner:** <@${winnerId}> (${setsWinner}-${setsLoser})\n` +
      `**Loser:** <@${loserId}>\n\n` +
      `*Resolved by <@${interaction.user.id}>*`,
    embeds: [],
    components: [],
  });

  // Post to logs
  const logsChannel = interaction.client.channels.cache.get(config.channels.logs);
  if (logsChannel) {
    const logContent = buildChallengeLogContent({
      challengerId: challenge.challenger_id,
      defenderId: challenge.defender_id,
      defenderRank: challenge.defender_rank,
      winnerId,
      loserId,
      scores,
      setsWinner,
      setsLoser,
      newWinnerRank,
      newLoserRank,
      cooldownExpires: cooldownUntil,
    });

    await logsChannel.send({ content: logContent });
  }

  // Update the original challenge message
  if (challenge.message_id && challenge.channel_id) {
    try {
      const requestChannel = interaction.client.channels.cache.get(challenge.channel_id);
      if (requestChannel) {
        const challengeMessage = await requestChannel.messages.fetch(challenge.message_id);
        await challengeMessage.edit({
          content:
            `**Match Complete!** (Dispute Resolved)\n\n` +
            `**Winner:** <@${winnerId}> (${setsWinner}-${setsLoser})\n` +
            `**Loser:** <@${loserId}>\n\n` +
            `${scoreLines}\n\n` +
            `Cooldown expires <t:${Math.floor(cooldownUntil / 1000)}:R>`,
          embeds: [],
          components: [],
        });
      }
    } catch (err) {
      console.log('Could not update challenge message:', err.message);
    }
  }

  // Archive the match thread if it exists
  if (challenge.thread_id) {
    try {
      const thread = await interaction.client.channels.fetch(challenge.thread_id);
      if (thread) {
        await thread.send(`**Dispute Resolved.** <@${winnerId}> wins ${setsWinner}-${setsLoser}. This thread will be archived.`);
        await thread.setArchived(true);
      }
    } catch (err) {
      console.log('Could not archive thread:', err.message);
    }
  }
}
