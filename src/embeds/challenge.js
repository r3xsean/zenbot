import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { players, challenges } from '../database/queries.js';
import { config } from '../config.js';

/**
 * Build the challenge panel embed with the "Challenge Someone" button
 */
export function buildChallengePanelEmbed() {
  return new EmbedBuilder()
    .setTitle('Challenge System')
    .setDescription(
      'Ready to fight for a rank?\nClick below to start a challenge.'
    )
    .setColor(0x2F3136)
    .addFields(
      {
        name: 'Rules',
        value:
          '• Unranked can challenge ranks 8, 9, 10\n' +
          '• Rank 10 can challenge 8 or 9\n' +
          '• Rank 9 can only challenge 8\n' +
          '• Ranks 1-8 challenge 1 above',
        inline: true,
      },
      {
        name: 'Format',
        value:
          '> Best of 3 sets\n' +
          '> First to 10 per set\n' +
          '> ⚫ Challenger\n' +
          '> ⚪ Defender',
        inline: true,
      }
    )
    .setFooter({ text: 'ZenBot by r3xsean' });
}

/**
 * Build the action row with challenge buttons
 */
export function buildChallengePanelButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('challenge_start')
      .setLabel('Challenge Someone')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('cooldown_remove')
      .setLabel('Remove My Cooldown')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('dm_notifications_toggle')
      .setLabel('DM Notifications')
      .setStyle(ButtonStyle.Secondary)
  );
}

/**
 * Build a select menu of eligible players to challenge
 * @param {string} challengerId - Discord ID of the challenger
 */
export function buildChallengeSelectMenu(challengerId) {
  const challenger = players.getById(challengerId);
  const leaderboard = players.getLeaderboard();
  const now = Date.now();

  const options = [];

  for (const player of leaderboard) {
    // Skip self
    if (player.discord_id === challengerId) continue;

    // Check if this player can be challenged by the challenger
    const canChallenge = canPlayerChallenge(challenger, player);
    const isOnCooldown = player.cooldown_until && player.cooldown_until > now;
    const hasActiveChallenge = challenges.getActiveForPlayer(player.discord_id).length > 0;

    if (!canChallenge) continue;

    const statusEmoji = isOnCooldown || hasActiveChallenge ? '🔴' : '🟢';
    const statusText = isOnCooldown
      ? '(Cooldown)'
      : hasActiveChallenge
        ? '(In Challenge)'
        : '';

    options.push({
      label: `#${player.rank} ${statusText}`,
      description: isOnCooldown || hasActiveChallenge ? 'Currently unavailable' : 'Available to challenge',
      value: player.discord_id,
      emoji: statusEmoji,
      default: false,
    });
  }

  // Add "Challenge Unranked" option if challenger is unranked
  if (!challenger?.rank) {
    options.push({
      label: 'Challenge Unranked Player',
      description: 'Challenge another unranked player',
      value: 'unranked',
      default: false,
    });
  }

  if (options.length === 0) {
    return null; // No valid targets
  }

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('challenge_select')
      .setPlaceholder('Select who to challenge...')
      .addOptions(options.slice(0, 25)) // Discord max 25 options
  );
}

/**
 * Check if challenger can challenge the target based on rules
 * Rules:
 * - Unranked players can challenge ranks 8, 9, 10
 * - Ranks 1-8 can challenge exactly 1 rank above
 * - Rank 9 can only challenge rank 8
 * - Rank 10 can challenge rank 8 or 9
 */
function canPlayerChallenge(challenger, target) {
  // Target must be ranked
  if (!target.rank) return false;

  // Unranked players can only challenge ranks 8-10
  if (!challenger?.rank) {
    return config.openChallengeRanks.includes(target.rank);
  }

  // Rank 10 can challenge rank 8 or 9
  if (challenger.rank === 10) {
    return target.rank === 8 || target.rank === 9;
  }

  // Rank 9 can only challenge rank 8
  if (challenger.rank === 9) {
    return target.rank === 8;
  }

  // Ranks 1-8 can challenge exactly 1 rank above
  if (challenger.rank >= 1 && challenger.rank <= 8) {
    return target.rank === challenger.rank - 1;
  }

  return false;
}

/**
 * Build the challenge request embed
 */
export function buildChallengeRequestEmbed(challengerId, defenderId, defenderRank, expiresAt) {
  return new EmbedBuilder()
    .setTitle('New Challenge!')
    .setDescription(
      `<@${challengerId}> → <@${defenderId}> (Rank #${defenderRank})\n\n` +
      `Respond by <t:${Math.floor(expiresAt / 1000)}:F>\n` +
      `(<t:${Math.floor(expiresAt / 1000)}:R>)`
    )
    .setColor(0xFFA500)
    .addFields(
      { name: 'Challenger', value: `<@${challengerId}>`, inline: true },
      { name: 'Defender', value: `<@${defenderId}>`, inline: true },
      { name: 'Rank at Stake', value: `#${defenderRank}`, inline: true }
    )
    .setFooter({ text: 'Defender: Accept or decline the challenge' });
}

/**
 * Build accept/decline buttons for a challenge
 */
export function buildChallengeResponseButtons(challengeId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`challenge_accept_${challengeId}`)
      .setLabel('Accept')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`challenge_decline_${challengeId}`)
      .setLabel('Decline')
      .setStyle(ButtonStyle.Danger)
  );
}

/**
 * Build the "match in progress" embed
 */
export function buildMatchInProgressEmbed(challengerId, defenderId, challengeId) {
  return new EmbedBuilder()
    .setTitle('Match In Progress')
    .setDescription(
      `<@${challengerId}> vs <@${defenderId}>\n\n` +
      `Play your match in Roblox, then submit the result here.`
    )
    .setColor(0x00FF00);
}

/**
 * Build the submit result button
 */
export function buildSubmitResultButton(challengeId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`score_submit_${challengeId}`)
      .setLabel('Submit Result')
      .setStyle(ButtonStyle.Primary)
  );
}

/**
 * Build prediction buttons for spectators
 */
export function buildPredictionButtons(challengeId, challengerId, defenderId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`predict_${challengeId}_${challengerId}`)
      .setLabel('Predict Challenger')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`predict_${challengeId}_${defenderId}`)
      .setLabel('Predict Defender')
      .setStyle(ButtonStyle.Secondary)
  );
}

/**
 * Build correction request button for completed matches
 */
export function buildCorrectionButton(challengeId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`correction_request_${challengeId}`)
      .setLabel('Request Score Correction')
      .setStyle(ButtonStyle.Secondary)
  );
}

/**
 * Build correction approval buttons
 */
export function buildCorrectionApprovalButtons(correctionId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`correction_approve_${correctionId}`)
      .setLabel('Approve')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`correction_reject_${correctionId}`)
      .setLabel('Reject')
      .setStyle(ButtonStyle.Danger)
  );
}
