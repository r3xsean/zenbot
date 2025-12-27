import { players } from '../../database/queries.js';

/**
 * Handle the "Remove My Cooldown" button click
 */
export async function handleCooldownRemove(interaction) {
  const userId = interaction.user.id;
  const player = players.getById(userId);

  // Check if user has an active cooldown
  if (!player?.cooldown_until || player.cooldown_until <= Date.now()) {
    return interaction.reply({
      content: "You're not on cooldown.",
      ephemeral: true,
    });
  }

  // Remove the cooldown
  players.setCooldown(userId, null);

  await interaction.reply({
    content: 'Cooldown removed. You can now be challenged.',
    ephemeral: true,
  });
}
