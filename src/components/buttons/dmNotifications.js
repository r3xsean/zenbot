import { players } from '../../database/queries.js';

/**
 * Handle the "DM Notifications" toggle button
 */
export async function handleDmNotificationsToggle(interaction) {
  const userId = interaction.user.id;

  // Toggle the preference
  const enabled = players.toggleDmNotifications(userId);

  await interaction.reply({
    content: enabled
      ? 'DM notifications **enabled**. You will receive a DM when someone challenges you.'
      : 'DM notifications **disabled**. You will no longer receive DMs for challenges.',
    ephemeral: true,
  });
}
