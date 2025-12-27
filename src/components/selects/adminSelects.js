import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
} from 'discord.js';
import { players, challenges, matchHistory } from '../../database/queries.js';
import { updateLeaderboard, scheduleLeaderboardRefresh } from '../../services/leaderboard.js';
import { config } from '../../config.js';

/**
 * Check if user is admin
 */
function isAdmin(interaction) {
  return interaction.member.permissions.has(PermissionFlagsBits.Administrator);
}

/**
 * Handle remove rank select
 */
export async function handleAdminSelectRemoveRank(interaction) {
  if (!isAdmin(interaction)) {
    return interaction.reply({ content: 'You need Administrator permissions.', ephemeral: true });
  }

  const userId = interaction.values[0];
  const player = players.getById(userId);

  if (!player || !player.rank) {
    return interaction.update({
      content: `<@${userId}> is not on the leaderboard.`,
      components: [],
    });
  }

  const oldRank = player.rank;

  // Remove rank and shift everyone below up
  players.removeRankAndShiftUp(userId);
  await updateLeaderboard(interaction.client);

  await interaction.update({
    content: `Removed <@${userId}> from Rank #${oldRank}. Players below have been moved up.`,
    components: [],
  });
}

/**
 * Handle clear cooldown select
 */
export async function handleAdminSelectClearCooldown(interaction) {
  if (!isAdmin(interaction)) {
    return interaction.reply({ content: 'You need Administrator permissions.', ephemeral: true });
  }

  const userId = interaction.values[0];

  players.upsert(userId, {});
  players.setCooldown(userId, null);
  await updateLeaderboard(interaction.client);

  await interaction.update({
    content: `Cleared cooldown for <@${userId}>`,
    components: [],
  });
}

/**
 * Handle force result winner select - show loser selection
 */
export async function handleAdminSelectForceResultWinner(interaction) {
  if (!isAdmin(interaction)) {
    return interaction.reply({ content: 'You need Administrator permissions.', ephemeral: true });
  }

  const winnerId = interaction.values[0];

  // Get other ranked players (excluding winner)
  const rankedPlayers = players.getAllRanked();
  const options = rankedPlayers
    .filter(p => p.discord_id !== winnerId)
    .map(p => ({
      label: `Rank #${p.rank}`,
      description: `Discord ID: ${p.discord_id}`,
      value: p.discord_id,
    }));

  if (options.length === 0) {
    return interaction.update({
      content: 'No other ranked players to select as loser.',
      components: [],
    });
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(`admin_select_forceresult_loser_${winnerId}`)
    .setPlaceholder('Select the LOSER')
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(select);

  await interaction.update({
    content: `**Step 2/2:** Winner: <@${winnerId}>\n\nNow select the **LOSER**:`,
    components: [row],
  });
}

/**
 * Handle force result loser select - show score modal
 */
export async function handleAdminSelectForceResultLoser(interaction, winnerId) {
  if (!isAdmin(interaction)) {
    return interaction.reply({ content: 'You need Administrator permissions.', ephemeral: true });
  }

  const loserId = interaction.values[0];

  // Get usernames
  let winnerName = 'Winner';
  let loserName = 'Loser';
  try {
    const winnerUser = await interaction.client.users.fetch(winnerId);
    const loserUser = await interaction.client.users.fetch(loserId);
    winnerName = winnerUser.username;
    loserName = loserUser.username;
  } catch {
    // Use IDs as fallback
  }

  const modal = new ModalBuilder()
    .setCustomId(`admin_modal_forceresult_final_${winnerId}_${loserId}`)
    .setTitle('Enter Match Score');

  const scoreInput = new TextInputBuilder()
    .setCustomId('score')
    .setLabel(`${winnerName} vs ${loserName} - Sets won`)
    .setPlaceholder('Enter 2-0 or 2-1 (winner sets - loser sets)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(5);

  modal.addComponents(
    new ActionRowBuilder().addComponents(scoreInput)
  );

  await interaction.showModal(modal);
}

/**
 * Handle force result final modal
 */
export async function handleAdminForceResultFinalModal(interaction, winnerId, loserId) {
  const scoreStr = interaction.fields.getTextInputValue('score').trim();

  const scoreMatch = scoreStr.match(/^(\d)-(\d)$/);
  if (!scoreMatch) {
    return interaction.reply({ content: 'Invalid score format. Use "2-0" or "2-1".', ephemeral: true });
  }

  const setsWinner = parseInt(scoreMatch[1]);
  const setsLoser = parseInt(scoreMatch[2]);

  if (setsWinner !== 2 || setsLoser > 1) {
    return interaction.reply({ content: 'Winner must have 2 sets. Use "2-0" or "2-1".', ephemeral: true });
  }

  // Ensure both exist
  players.upsert(winnerId, {});
  players.upsert(loserId, {});

  // Get player info before changes
  const winnerBefore = players.getById(winnerId);
  const loserBefore = players.getById(loserId);

  // Process rank swap if loser was ranked higher
  let newWinnerRank = winnerBefore?.rank;
  let newLoserRank = loserBefore?.rank;

  if (loserBefore?.rank && (!winnerBefore?.rank || winnerBefore.rank > loserBefore.rank)) {
    players.swapRanks(winnerId, loserId);
    newWinnerRank = loserBefore.rank;
    newLoserRank = loserBefore.rank + 1;
  }

  // Apply cooldowns
  const cooldownUntil = Date.now() + config.cooldownMs;
  players.setCooldown(winnerId, cooldownUntil);
  players.setCooldown(loserId, cooldownUntil);

  // Record stats
  players.recordWin(winnerId);
  players.recordLoss(loserId);
  players.updateWinStreak(winnerId);
  players.updateLossStreak(loserId);

  // Record match history (admin forced, no challenge context)
  matchHistory.record({
    playerId: winnerId,
    opponentId: loserId,
    result: 'W',
    wasChallenger: false, // Unknown in admin context
    setsWon: setsWinner,
    setsLost: setsLoser,
    pointsScored: 0,
    pointsConceded: 0,
    wasComeback: false,
    wasPerfect: setsLoser === 0,
    rankBefore: winnerBefore?.rank || null,
    rankAfter: newWinnerRank,
    challengeId: null,
  });

  matchHistory.record({
    playerId: loserId,
    opponentId: winnerId,
    result: 'L',
    wasChallenger: false,
    setsWon: setsLoser,
    setsLost: setsWinner,
    pointsScored: 0,
    pointsConceded: 0,
    wasComeback: false,
    wasPerfect: false,
    rankBefore: loserBefore?.rank || null,
    rankAfter: newLoserRank,
    challengeId: null,
  });

  await updateLeaderboard(interaction.client);

  // Schedule leaderboard refresh when cooldown expires
  scheduleLeaderboardRefresh(interaction.client, cooldownUntil);

  // Post to logs
  const logsChannel = interaction.client.channels.cache.get(config.channels.logs);
  if (logsChannel) {
    await logsChannel.send(
      `**Admin Force Result**\n\n` +
      `**Winner:** <@${winnerId}>\n` +
      `**Loser:** <@${loserId}>\n` +
      `**Score:** ${setsWinner}-${setsLoser}\n` +
      `**By:** <@${interaction.user.id}>`
    );
  }

  await interaction.reply({
    content: `Result recorded: <@${winnerId}> defeats <@${loserId}> (${setsWinner}-${setsLoser})`,
    ephemeral: true,
  });
}

/**
 * Handle cancel challenge select
 */
export async function handleAdminSelectCancelChallenge(interaction) {
  if (!isAdmin(interaction)) {
    return interaction.reply({ content: 'You need Administrator permissions.', ephemeral: true });
  }

  const challengeId = parseInt(interaction.values[0]);
  const challenge = challenges.getById(challengeId);

  if (!challenge) {
    return interaction.update({
      content: 'Challenge not found.',
      components: [],
    });
  }

  // Cancel the challenge
  challenges.updateStatus(challengeId, 'cancelled');

  // Update the original challenge message
  if (challenge.message_id && challenge.channel_id) {
    try {
      const channel = interaction.client.channels.cache.get(challenge.channel_id);
      if (channel) {
        const message = await channel.messages.fetch(challenge.message_id);
        await message.edit({
          content:
            `**Challenge Cancelled**\n\n` +
            `<@${challenge.challenger_id}> vs <@${challenge.defender_id}>\n` +
            `*Cancelled by admin*`,
          embeds: [],
          components: [],
        });
      }
    } catch (err) {
      console.log('Could not update challenge message:', err.message);
    }
  }

  // Post to logs
  const logsChannel = interaction.client.channels.cache.get(config.channels.logs);
  if (logsChannel) {
    await logsChannel.send(
      `**Challenge Cancelled**\n\n` +
      `<@${challenge.challenger_id}> vs <@${challenge.defender_id}>\n` +
      `Rank: #${challenge.defender_rank}\n` +
      `*Cancelled by <@${interaction.user.id}>*`
    );
  }

  await interaction.update({
    content: `Cancelled challenge #${challengeId}`,
    components: [],
  });
}
