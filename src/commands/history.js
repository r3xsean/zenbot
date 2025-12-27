import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { matchHistory, matchResults } from '../database/queries.js';

export const historyCommand = new SlashCommandBuilder()
  .setName('history')
  .setDescription('View match history for a player')
  .addUserOption(option =>
    option.setName('user')
      .setDescription('The user to view (defaults to yourself)')
      .setRequired(false));

/**
 * Format date as DD/MM/YY
 */
function formatDate(timestamp) {
  const date = new Date(timestamp);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

/**
 * Get title context string
 */
function getTitleContext(match) {
  if (match.result === 'W') {
    return match.was_challenger ? 'Title Take' : 'Title Defense';
  } else {
    return match.was_challenger ? 'Failed Challenge' : 'Title Lost';
  }
}

/**
 * Get rank change string
 */
function getRankChange(match) {
  if (match.rank_before && match.rank_after && match.rank_before !== match.rank_after) {
    return `#${match.rank_before} → #${match.rank_after}`;
  } else if (!match.rank_before && match.rank_after) {
    return `Took #${match.rank_after}`;
  }
  return null;
}

/**
 * Build match page embed
 */
function buildMatchEmbed(match, scores, pageNum, totalPages, targetUserId) {
  const isWin = match.result === 'W';
  const roleEmoji = match.was_challenger ? '⚫' : '⚪';
  const roleText = match.was_challenger ? 'Challenger' : 'Defender';

  const embed = new EmbedBuilder()
    .setTitle(`Match History (${pageNum}/${totalPages})`)
    .setColor(0x2F3136); // Neutral dark gray

  // Description with opponent and result
  let description = `**vs** <@${match.opponent_id}>\n`;
  description += `**Date:** ${formatDate(match.match_date)}\n`;
  description += `**Role:** ${roleEmoji} ${roleText}\n`;
  description += `**Result:** ${isWin ? 'WIN' : 'LOSS'} (${match.sets_won}-${match.sets_lost})`;

  embed.setDescription(description);

  // Set scores
  let scoresText = '';
  if (scores && scores.length > 0) {
    for (let i = 0; i < scores.length; i++) {
      const set = scores[i];
      const targetIsChallenger = match.was_challenger;
      const targetScore = targetIsChallenger ? set.challenger : set.defender;
      const opponentScore = targetIsChallenger ? set.defender : set.challenger;
      scoresText += `Set ${i + 1}: ${targetScore}-${opponentScore}\n`;
    }
  } else {
    scoresText = '*Forfeit - no sets played*';
  }

  embed.addFields({
    name: 'Scores',
    value: scoresText,
    inline: true,
  });

  // Title context and rank change
  const titleContext = getTitleContext(match);
  const rankChange = getRankChange(match);
  let contextText = titleContext;
  if (rankChange) {
    contextText += `\n${rankChange}`;
  }

  embed.addFields({
    name: 'Outcome',
    value: contextText,
    inline: true,
  });

  // Footer with legend
  embed.setFooter({ text: '⚫ Challenger | ⚪ Defender' });

  return embed;
}

/**
 * Build navigation buttons
 */
function buildNavigationButtons(targetUserId, currentPage, totalPages) {
  const row = new ActionRowBuilder();

  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`history_prev_${targetUserId}_${currentPage}`)
      .setLabel('Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage <= 1),
    new ButtonBuilder()
      .setCustomId(`history_next_${targetUserId}_${currentPage}`)
      .setLabel('Next')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage >= totalPages)
  );

  return row;
}

/**
 * Get match with scores
 */
function getMatchWithScores(match) {
  let scores = null;

  if (match.challenge_id) {
    const result = matchResults.getByChallenge?.(match.challenge_id);
    if (result?.scores) {
      try {
        scores = JSON.parse(result.scores);
      } catch (e) {
        // Invalid JSON, skip
      }
    }
  }

  return { match, scores };
}

export async function handleHistoryCommand(interaction) {
  const targetUser = interaction.options.getUser('user') || interaction.user;
  const targetUserId = targetUser.id;

  // Get last 5 matches
  const matches = matchHistory.getRecent(targetUserId, 5);

  if (matches.length === 0) {
    return interaction.reply({
      content: `<@${targetUserId}> has no match history yet.`,
      ephemeral: true,
    });
  }

  // Get the first match with scores
  const { match, scores } = getMatchWithScores(matches[0]);
  const embed = buildMatchEmbed(match, scores, 1, matches.length, targetUserId);
  const buttons = buildNavigationButtons(targetUserId, 1, matches.length);

  await interaction.reply({
    embeds: [embed],
    components: matches.length > 1 ? [buttons] : [],
    ephemeral: true,
  });
}

/**
 * Handle history navigation button
 */
export async function handleHistoryNavigation(interaction, targetUserId, currentPage, direction) {
  const newPage = direction === 'next' ? currentPage + 1 : currentPage - 1;

  // Get matches
  const matches = matchHistory.getRecent(targetUserId, 5);

  if (matches.length === 0 || newPage < 1 || newPage > matches.length) {
    return interaction.reply({
      content: 'This history is no longer available.',
      ephemeral: true,
    });
  }

  const { match, scores } = getMatchWithScores(matches[newPage - 1]);
  const embed = buildMatchEmbed(match, scores, newPage, matches.length, targetUserId);
  const buttons = buildNavigationButtons(targetUserId, newPage, matches.length);

  await interaction.update({
    embeds: [embed],
    components: [buttons],
  });
}
