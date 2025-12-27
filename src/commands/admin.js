import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { players, challenges } from '../database/queries.js';

export const adminCommands = [
  // View player info - convenient with @mention
  new SlashCommandBuilder()
    .setName('playerinfo')
    .setDescription('View a player\'s info')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to view')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
];

export async function handleAdminCommand(interaction) {
  const { commandName } = interaction;

  switch (commandName) {
    case 'playerinfo':
      return handlePlayerInfo(interaction);
  }
}

async function handlePlayerInfo(interaction) {
  const user = interaction.options.getUser('user');
  const player = players.getById(user.id);

  if (!player) {
    return interaction.reply({
      content: `<@${user.id}> has no data in the system.`,
      ephemeral: true,
    });
  }

  const cooldownText = player.cooldown_until && player.cooldown_until > Date.now()
    ? `<t:${Math.floor(player.cooldown_until / 1000)}:R>`
    : 'None';

  const activeChallenges = challenges.getActiveForPlayer(user.id);

  await interaction.reply({
    content:
      `**Player Info: <@${user.id}>**\n\n` +
      `**Rank:** ${player.rank ? `#${player.rank}` : 'Unranked'}\n` +
      `**Wins:** ${player.wins}\n` +
      `**Losses:** ${player.losses}\n` +
      `**Cooldown:** ${cooldownText}\n` +
      `**Active Challenges:** ${activeChallenges.length}`,
    ephemeral: true,
  });
}
