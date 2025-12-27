import { players, challenges } from '../../database/queries.js';
import { buildChallengeSelectMenu } from '../../embeds/challenge.js';

/**
 * Handle the "Challenge Someone" button click
 */
export async function handleChallengeStart(interaction) {
  const userId = interaction.user.id;

  // Check if user is on cooldown
  if (players.isOnCooldown(userId)) {
    const player = players.getById(userId);
    return interaction.reply({
      content: `You're on cooldown! You can challenge again <t:${Math.floor(player.cooldown_until / 1000)}:R>.`,
      ephemeral: true,
    });
  }

  // Check if user already has an active challenge
  const activeChallenge = challenges.getActiveForPlayer(userId);
  if (activeChallenge.length > 0) {
    return interaction.reply({
      content: 'You already have an active challenge. Complete or cancel it first.',
      ephemeral: true,
    });
  }

  // Build the select menu with eligible targets
  const selectMenu = buildChallengeSelectMenu(userId);

  if (!selectMenu) {
    return interaction.reply({
      content: 'No players are available to challenge right now. Everyone may be on cooldown or in a match.',
      ephemeral: true,
    });
  }

  await interaction.reply({
    content: '**Select who you want to challenge:**',
    components: [selectMenu],
    ephemeral: true,
  });
}
