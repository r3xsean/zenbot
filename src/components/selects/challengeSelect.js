import { ActionRowBuilder, UserSelectMenuBuilder } from 'discord.js';
import { players, challenges } from '../../database/queries.js';
import { config } from '../../config.js';
import { buildChallengeResponseButtons } from '../../embeds/challenge.js';

/**
 * Send DM notification to defender if they have it enabled
 */
async function sendChallengeDm(client, defenderId, challengerId, rankAtStake, requestChannelId) {
  if (!players.wantsDmNotifications(defenderId)) return;

  try {
    const defender = await client.users.fetch(defenderId);
    const challenger = await client.users.fetch(challengerId);

    const rankText = rankAtStake > 0 ? `for Rank #${rankAtStake}` : '(Unranked Match)';

    await defender.send(
      `**You've been challenged!**\n\n` +
      `${challenger.username} has challenged you ${rankText}.\n` +
      `You have ${config.responseWindowHours} hours to respond.\n\n` +
      `Head to <#${requestChannelId}> to accept or decline.`
    );
  } catch (err) {
    console.log('Could not send challenge DM:', err.message);
  }
}

/**
 * Handle the challenge target selection
 */
export async function handleChallengeSelect(interaction) {
  const challengerId = interaction.user.id;
  const selectedValue = interaction.values[0];

  // Check if "Challenge Unranked" was selected
  if (selectedValue === 'unranked') {
    return handleUnrankedSelection(interaction);
  }

  const defenderId = selectedValue;

  // Get defender info
  const defender = players.getById(defenderId);

  if (!defender || !defender.rank) {
    return interaction.reply({
      content: 'This player is no longer ranked.',
      ephemeral: true,
    });
  }

  // Check if challenger is already in a challenge
  const challengerActive = challenges.getActiveForPlayer(challengerId);
  if (challengerActive.length > 0) {
    return interaction.reply({
      content: `You already have an active challenge. Complete it before starting a new one.`,
      ephemeral: true,
    });
  }

  // Check if challenger is on cooldown
  if (players.isOnCooldown(challengerId)) {
    const challenger = players.getById(challengerId);
    return interaction.reply({
      content: `You are on cooldown. You can challenge again <t:${Math.floor(challenger.cooldown_until / 1000)}:R>`,
      ephemeral: true,
    });
  }

  // Check if defender is on cooldown
  if (players.isOnCooldown(defenderId)) {
    return interaction.reply({
      content: `<@${defenderId}> is on cooldown. Try again later.`,
      ephemeral: true,
    });
  }

  // Check if defender already has an active challenge (first come first serve)
  const defenderActive = challenges.getActiveForPlayer(defenderId);
  if (defenderActive.length > 0) {
    return interaction.reply({
      content: `<@${defenderId}> is already waiting on another challenge. Try again once their current match is finished.`,
      ephemeral: true,
    });
  }

  // Ensure challenger exists in DB
  players.upsert(challengerId, {});

  // Create the challenge
  const expiresAt = Date.now() + config.responseWindowMs;
  const challengeId = challenges.create(
    challengerId,
    defenderId,
    defender.rank,
    expiresAt
  );

  // Get the request channel and send the challenge
  const requestChannel = interaction.client.channels.cache.get(config.channels.request);

  if (!requestChannel) {
    return interaction.reply({
      content: 'Error: Request channel not found.',
      ephemeral: true,
    });
  }

  // Build challenge message as plain text
  const challengeContent = `## **New Challenge!**

**Challenger:** <@${challengerId}>
**Defender:** <@${defenderId}>
**Rank at Stake:** #${defender.rank}

Respond by <t:${Math.floor(expiresAt / 1000)}:F> (<t:${Math.floor(expiresAt / 1000)}:R>)

*Defender: Accept or decline the challenge*`;

  const buttons = buildChallengeResponseButtons(challengeId);

  const message = await requestChannel.send({
    content: `<@${defenderId}>, you've been challenged!\n\n${challengeContent}`,
    components: [buttons],
  });

  // Store message ID for later updates
  challenges.updateMessageId(challengeId, message.id, requestChannel.id);

  // Create a thread for the players to discuss
  try {
    const challengerMember = await interaction.guild.members.fetch(challengerId);
    const defenderMember = await interaction.guild.members.fetch(defenderId);
    const challengerName = challengerMember.displayName;
    const defenderName = defenderMember.displayName;

    const thread = await message.startThread({
      name: `${challengerName} vs ${defenderName}`,
      autoArchiveDuration: 1440, // 24 hours
      reason: `Match discussion for challenge #${challengeId}`,
    });

    // Store thread ID
    challenges.updateThreadId(challengeId, thread.id);

    // Welcome message in thread
    await thread.send(
      `**Match Thread**\n\n` +
      `<@${challengerId}> has challenged <@${defenderId}> for Rank #${defender.rank}.\n\n` +
      `Use this thread to coordinate your match!`
    );
  } catch (err) {
    console.log('Could not create thread:', err.message);
  }

  // Send DM notification if enabled
  await sendChallengeDm(interaction.client, defenderId, challengerId, defender.rank, requestChannel.id);

  // Acknowledge to challenger
  await interaction.update({
    content: `Challenge sent to <@${defenderId}>! They have ${config.responseWindowHours} hours to respond.\n\nCheck ${requestChannel} for updates.`,
    components: [],
  });
}

/**
 * Handle "Challenge Unranked" selection - show user picker
 */
async function handleUnrankedSelection(interaction) {
  const challengerId = interaction.user.id;

  // Check if challenger is on cooldown
  if (players.isOnCooldown(challengerId)) {
    const challenger = players.getById(challengerId);
    return interaction.reply({
      content: `You are on cooldown. You can challenge again <t:${Math.floor(challenger.cooldown_until / 1000)}:R>`,
      ephemeral: true,
    });
  }

  // Check if challenger has active challenge
  const challengerActive = challenges.getActiveForPlayer(challengerId);
  if (challengerActive.length > 0) {
    return interaction.reply({
      content: 'You already have an active challenge. Complete it before starting a new one.',
      ephemeral: true,
    });
  }

  // Show user select menu
  const userSelect = new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId('challenge_unranked_select')
      .setPlaceholder('Select an unranked player to challenge...')
      .setMinValues(1)
      .setMaxValues(1)
  );

  await interaction.update({
    content: '**Select an unranked player to challenge:**',
    components: [userSelect],
  });
}

/**
 * Handle unranked user selection
 */
export async function handleUnrankedUserSelect(interaction) {
  const challengerId = interaction.user.id;
  const defenderId = interaction.values[0];

  // Can't challenge yourself
  if (challengerId === defenderId) {
    return interaction.reply({
      content: "You can't challenge yourself.",
      ephemeral: true,
    });
  }

  // Can't challenge a bot
  const defenderUser = await interaction.client.users.fetch(defenderId);
  if (defenderUser.bot) {
    return interaction.reply({
      content: "You can't challenge a bot.",
      ephemeral: true,
    });
  }

  // Check if challenger is unranked
  const challenger = players.getById(challengerId);
  if (challenger?.rank) {
    return interaction.reply({
      content: 'You are ranked. Use the regular challenge option to challenge ranked players.',
      ephemeral: true,
    });
  }

  // Check if defender is unranked
  const defender = players.getById(defenderId);
  if (defender?.rank) {
    return interaction.reply({
      content: 'That player is ranked. Use the regular challenge option instead.',
      ephemeral: true,
    });
  }

  // Check cooldowns
  if (players.isOnCooldown(challengerId)) {
    return interaction.reply({
      content: `You are on cooldown. You can challenge again <t:${Math.floor(challenger.cooldown_until / 1000)}:R>`,
      ephemeral: true,
    });
  }

  if (defender && players.isOnCooldown(defenderId)) {
    return interaction.reply({
      content: `<@${defenderId}> is on cooldown. Try again later.`,
      ephemeral: true,
    });
  }

  // Check active challenges
  const challengerActive = challenges.getActiveForPlayer(challengerId);
  if (challengerActive.length > 0) {
    return interaction.reply({
      content: 'You already have an active challenge.',
      ephemeral: true,
    });
  }

  const defenderActive = challenges.getActiveForPlayer(defenderId);
  if (defenderActive.length > 0) {
    return interaction.reply({
      content: `<@${defenderId}> already has an active challenge.`,
      ephemeral: true,
    });
  }

  // Ensure both players exist in DB
  players.upsert(challengerId, {});
  players.upsert(defenderId, {});

  // Create the challenge (defender_rank = 0 for unranked matches)
  const expiresAt = Date.now() + config.responseWindowMs;
  const challengeId = challenges.create(
    challengerId,
    defenderId,
    0, // No rank at stake
    expiresAt
  );

  // Get the request channel and send the challenge
  const requestChannel = interaction.client.channels.cache.get(config.channels.request);

  if (!requestChannel) {
    return interaction.reply({
      content: 'Error: Request channel not found.',
      ephemeral: true,
    });
  }

  // Build challenge message
  const challengeContent = `## **New Challenge!**

**Challenger:** <@${challengerId}>
**Defender:** <@${defenderId}>
**Type:** Unranked Match

Respond by <t:${Math.floor(expiresAt / 1000)}:F> (<t:${Math.floor(expiresAt / 1000)}:R>)

*Defender: Accept or decline the challenge*`;

  const buttons = buildChallengeResponseButtons(challengeId);

  const message = await requestChannel.send({
    content: `<@${defenderId}>, you've been challenged!\n\n${challengeContent}`,
    components: [buttons],
  });

  // Store message ID
  challenges.updateMessageId(challengeId, message.id, requestChannel.id);

  // Create thread
  try {
    const challengerMember = await interaction.guild.members.fetch(challengerId);
    const defenderMember = await interaction.guild.members.fetch(defenderId);
    const challengerName = challengerMember.displayName;
    const defenderName = defenderMember.displayName;

    const thread = await message.startThread({
      name: `${challengerName} vs ${defenderName}`,
      autoArchiveDuration: 1440,
      reason: `Match discussion for challenge #${challengeId}`,
    });

    challenges.updateThreadId(challengeId, thread.id);

    await thread.send(
      `**Match Thread**\n\n` +
      `<@${challengerId}> has challenged <@${defenderId}> to an unranked match.\n\n` +
      `Use this thread to coordinate your match!`
    );
  } catch (err) {
    console.log('Could not create thread:', err.message);
  }

  // Send DM notification if enabled
  await sendChallengeDm(interaction.client, defenderId, challengerId, 0, requestChannel.id);

  // Acknowledge to challenger
  await interaction.update({
    content: `Challenge sent to <@${defenderId}>! They have ${config.responseWindowHours} hours to respond.\n\nCheck ${requestChannel} for updates.`,
    components: [],
  });
}
