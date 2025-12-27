import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} from 'discord.js';
import { players, challenges, matchResults, botState } from '../../database/queries.js';
import { updateLeaderboard, scheduleLeaderboardRefresh } from '../../services/leaderboard.js';
import { refreshAdminPanel } from '../../services/adminPanel.js';
import { config, clearSettingsCache } from '../../config.js';

/**
 * Check if user is admin
 */
function isAdmin(interaction) {
  return interaction.member.permissions.has(PermissionFlagsBits.Administrator);
}

/**
 * Build player options for select menus (ranked players)
 */
function buildRankedPlayerOptions() {
  const rankedPlayers = players.getAllRanked();
  if (rankedPlayers.length === 0) {
    return null;
  }
  return rankedPlayers.map(p => ({
    label: `Rank #${p.rank}`,
    description: `Discord ID: ${p.discord_id}`,
    value: p.discord_id,
  }));
}

/**
 * Handle Set Rank button - shows select menu for existing players or modal for new
 */
export async function handleAdminSetRank(interaction) {
  if (!isAdmin(interaction)) {
    return interaction.reply({ content: 'You need Administrator permissions.', ephemeral: true });
  }

  // Show modal to enter user ID and rank (simplest approach)
  const modal = new ModalBuilder()
    .setCustomId('admin_modal_setrank')
    .setTitle('Set Player Rank');

  const userInput = new TextInputBuilder()
    .setCustomId('user_id')
    .setLabel('Discord User ID')
    .setPlaceholder('Right-click user → Copy User ID')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(17)
    .setMaxLength(20);

  const rankInput = new TextInputBuilder()
    .setCustomId('rank')
    .setLabel('Rank (1-10)')
    .setPlaceholder('e.g., 5')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(2);

  modal.addComponents(
    new ActionRowBuilder().addComponents(userInput),
    new ActionRowBuilder().addComponents(rankInput)
  );

  await interaction.showModal(modal);
}

/**
 * Handle Remove Rank button - shows select menu of ranked players
 */
export async function handleAdminRemoveRank(interaction) {
  if (!isAdmin(interaction)) {
    return interaction.reply({ content: 'You need Administrator permissions.', ephemeral: true });
  }

  const options = buildRankedPlayerOptions();
  if (!options) {
    return interaction.reply({ content: 'No ranked players to remove.', ephemeral: true });
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId('admin_select_removerank')
    .setPlaceholder('Select player to remove from ladder')
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(select);

  await interaction.reply({
    content: 'Select a player to remove from the ladder:',
    components: [row],
    ephemeral: true,
  });
}

/**
 * Handle Clear Cooldown button - shows select menu of players on cooldown
 */
export async function handleAdminClearCooldown(interaction) {
  if (!isAdmin(interaction)) {
    return interaction.reply({ content: 'You need Administrator permissions.', ephemeral: true });
  }

  // Get players currently on cooldown
  const allPlayers = players.getAllRanked();
  const now = Date.now();
  const onCooldown = allPlayers.filter(p => p.cooldown_until && p.cooldown_until > now);

  if (onCooldown.length === 0) {
    return interaction.reply({ content: 'No players are currently on cooldown.', ephemeral: true });
  }

  const options = onCooldown.map(p => ({
    label: `Rank #${p.rank}`,
    description: `Expires <t:${Math.floor(p.cooldown_until / 1000)}:R>`,
    value: p.discord_id,
  }));

  const select = new StringSelectMenuBuilder()
    .setCustomId('admin_select_clearcooldown')
    .setPlaceholder('Select player to clear cooldown')
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(select);

  await interaction.reply({
    content: 'Select a player to clear their cooldown:',
    components: [row],
    ephemeral: true,
  });
}

/**
 * Handle Refresh button
 */
export async function handleAdminRefresh(interaction) {
  if (!isAdmin(interaction)) {
    return interaction.reply({ content: 'You need Administrator permissions.', ephemeral: true });
  }

  await updateLeaderboard(interaction.client);
  await interaction.reply({ content: 'Leaderboard refreshed!', ephemeral: true });
}

/**
 * Handle Force Result button - select winner then loser
 */
export async function handleAdminForceResult(interaction) {
  if (!isAdmin(interaction)) {
    return interaction.reply({ content: 'You need Administrator permissions.', ephemeral: true });
  }

  const options = buildRankedPlayerOptions();
  if (!options || options.length < 2) {
    return interaction.reply({ content: 'Need at least 2 ranked players to force a result.', ephemeral: true });
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId('admin_select_forceresult_winner')
    .setPlaceholder('Select the WINNER')
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(select);

  await interaction.reply({
    content: '**Step 1/2:** Select the **WINNER** of the match:',
    components: [row],
    ephemeral: true,
  });
}

/**
 * Handle View Pending button - shows pending challenges and results
 */
export async function handleAdminViewPending(interaction) {
  if (!isAdmin(interaction)) {
    return interaction.reply({ content: 'You need Administrator permissions.', ephemeral: true });
  }

  const pendingChallenges = challenges.getPending();
  const acceptedChallenges = challenges.getAccepted();
  const disputedChallenges = challenges.getDisputed();
  const pendingResults = matchResults.getAllPending();

  const embed = new EmbedBuilder()
    .setTitle('Pending Items')
    .setColor(0xFFFF00);

  let description = '';

  if (pendingChallenges.length > 0) {
    description += '**Pending Challenges (awaiting response)**\n';
    for (const c of pendingChallenges) {
      const expires = Math.floor(c.expires_at / 1000);
      description += `- <@${c.challenger_id}> vs <@${c.defender_id}> (Rank #${c.defender_rank}) - Expires <t:${expires}:R>\n`;
    }
    description += '\n';
  }

  if (acceptedChallenges.length > 0) {
    description += '**Matches In Progress**\n';
    for (const c of acceptedChallenges) {
      description += `- <@${c.challenger_id}> vs <@${c.defender_id}> (Rank #${c.defender_rank})\n`;
    }
    description += '\n';
  }

  if (pendingResults.length > 0) {
    description += '**Pending Score Confirmations**\n';
    for (const r of pendingResults) {
      const challenge = challenges.getById(r.challenge_id);
      if (challenge) {
        description += `- <@${r.submitted_by}> submitted vs <@${r.submitted_by === challenge.challenger_id ? challenge.defender_id : challenge.challenger_id}>\n`;
      }
    }
    description += '\n';
  }

  if (disputedChallenges.length > 0) {
    description += '**Disputed Matches**\n';
    for (const c of disputedChallenges) {
      description += `- <@${c.challenger_id}> vs <@${c.defender_id}> (Rank #${c.defender_rank})\n`;
    }
  }

  if (!description) {
    description = 'No pending items.';
  }

  embed.setDescription(description);

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

/**
 * Handle Cancel Challenge button - select a challenge to cancel/void
 */
export async function handleAdminCancelChallenge(interaction) {
  if (!isAdmin(interaction)) {
    return interaction.reply({ content: 'You need Administrator permissions.', ephemeral: true });
  }

  const pendingChallenges = challenges.getPending();
  const acceptedChallenges = challenges.getAccepted();
  const allActive = [...pendingChallenges, ...acceptedChallenges];

  if (allActive.length === 0) {
    return interaction.reply({ content: 'No active challenges to cancel.', ephemeral: true });
  }

  const options = allActive.map(c => ({
    label: `Challenge #${c.id}`,
    description: `Rank #${c.defender_rank} - ${c.status}`,
    value: c.id.toString(),
  }));

  const select = new StringSelectMenuBuilder()
    .setCustomId('admin_select_cancelchallenge')
    .setPlaceholder('Select challenge to cancel')
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(select);

  await interaction.reply({
    content: 'Select a challenge to cancel (no rank changes, no cooldowns):',
    components: [row],
    ephemeral: true,
  });
}

/**
 * Handle Set Cooldown button
 */
export async function handleAdminSetCooldown(interaction) {
  if (!isAdmin(interaction)) {
    return interaction.reply({ content: 'You need Administrator permissions.', ephemeral: true });
  }

  const modal = new ModalBuilder()
    .setCustomId('admin_modal_setcooldown')
    .setTitle('Set Cooldown Duration');

  const hoursInput = new TextInputBuilder()
    .setCustomId('hours')
    .setLabel(`Current: ${config.cooldownHours} hours`)
    .setPlaceholder('Enter hours (e.g., 8, 0.5 for 30 min)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(10);

  modal.addComponents(
    new ActionRowBuilder().addComponents(hoursInput)
  );

  await interaction.showModal(modal);
}

/**
 * Handle Set Response Window button
 */
export async function handleAdminSetResponseWindow(interaction) {
  if (!isAdmin(interaction)) {
    return interaction.reply({ content: 'You need Administrator permissions.', ephemeral: true });
  }

  const modal = new ModalBuilder()
    .setCustomId('admin_modal_setresponsewindow')
    .setTitle('Set Response Window');

  const hoursInput = new TextInputBuilder()
    .setCustomId('hours')
    .setLabel(`Current: ${config.responseWindowHours} hours`)
    .setPlaceholder('Enter hours (e.g., 12, 24)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(10);

  modal.addComponents(
    new ActionRowBuilder().addComponents(hoursInput)
  );

  await interaction.showModal(modal);
}

/**
 * Handle admin modal submissions
 */
export async function handleAdminModal(interaction) {
  const customId = interaction.customId;

  if (customId === 'admin_modal_setrank') {
    const userId = interaction.fields.getTextInputValue('user_id').trim();
    const rank = parseInt(interaction.fields.getTextInputValue('rank').trim());

    // Validate it looks like a Discord ID
    if (!/^\d{17,20}$/.test(userId)) {
      return interaction.reply({ content: 'Invalid user ID. Must be 17-20 digits.', ephemeral: true });
    }

    if (isNaN(rank) || rank < 1 || rank > 10) {
      return interaction.reply({ content: 'Invalid rank. Must be 1-10.', ephemeral: true });
    }

    const existing = players.getByRank(rank);
    if (existing && existing.discord_id !== userId) {
      return interaction.reply({
        content: `Rank #${rank} is already taken by <@${existing.discord_id}>.`,
        ephemeral: true,
      });
    }

    // Clear any existing rank for this player first
    const currentPlayer = players.getById(userId);
    if (currentPlayer?.rank && currentPlayer.rank !== rank) {
      players.upsert(userId, { rank: null });
    }

    players.upsert(userId, { rank });
    await updateLeaderboard(interaction.client);

    return interaction.reply({
      content: `Set <@${userId}> to Rank #${rank}`,
      ephemeral: true,
    });
  }

  if (customId === 'admin_modal_forceresult') {
    const winnerId = interaction.fields.getTextInputValue('winner_id').trim();
    const loserId = interaction.fields.getTextInputValue('loser_id').trim();
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

    // Get player info
    const winnerPlayer = players.getById(winnerId);
    const loserPlayer = players.getById(loserId);

    // Process rank swap if loser was ranked higher
    if (loserPlayer?.rank && (!winnerPlayer?.rank || winnerPlayer.rank > loserPlayer.rank)) {
      players.swapRanks(winnerId, loserId);
    }

    // Apply cooldowns
    const cooldownUntil = Date.now() + config.cooldownMs;
    players.setCooldown(winnerId, cooldownUntil);
    players.setCooldown(loserId, cooldownUntil);

    // Record stats
    players.recordWin(winnerId);
    players.recordLoss(loserId);

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

    return interaction.reply({
      content: `Result recorded: <@${winnerId}> defeats <@${loserId}> (${setsWinner}-${setsLoser})`,
      ephemeral: true,
    });
  }

  if (customId === 'admin_modal_setcooldown') {
    const hoursStr = interaction.fields.getTextInputValue('hours').trim();
    const hours = parseFloat(hoursStr);

    if (isNaN(hours) || hours < 0 || hours > 168) {
      return interaction.reply({
        content: 'Invalid hours. Must be a number between 0 and 168 (1 week).',
        ephemeral: true,
      });
    }

    // Save to database
    botState.set('setting_cooldown_hours', hours.toString());
    clearSettingsCache();

    // Refresh admin panel to show new value
    await refreshAdminPanel(interaction.client);

    const displayTime = hours < 1 ? `${Math.round(hours * 60)} minutes` : `${hours} hours`;

    return interaction.reply({
      content: `Cooldown duration set to **${displayTime}**.`,
      ephemeral: true,
    });
  }

  if (customId === 'admin_modal_setresponsewindow') {
    const hoursStr = interaction.fields.getTextInputValue('hours').trim();
    const hours = parseFloat(hoursStr);

    if (isNaN(hours) || hours < 1 || hours > 168) {
      return interaction.reply({
        content: 'Invalid hours. Must be a number between 1 and 168 (1 week).',
        ephemeral: true,
      });
    }

    // Save to database
    botState.set('setting_response_window_hours', hours.toString());
    clearSettingsCache();

    // Refresh admin panel to show new value
    await refreshAdminPanel(interaction.client);

    return interaction.reply({
      content: `Response window set to **${hours} hours**.`,
      ephemeral: true,
    });
  }
}
