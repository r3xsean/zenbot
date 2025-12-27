import { SlashCommandBuilder } from 'discord.js';
import { buildProfileEmbed } from '../embeds/profile.js';

export const profileCommand = new SlashCommandBuilder()
  .setName('profile')
  .setDescription('View a player\'s profile and statistics')
  .addUserOption(option =>
    option.setName('user')
      .setDescription('The user to view (defaults to yourself)')
      .setRequired(false));

export async function handleProfileCommand(interaction) {
  const targetUser = interaction.options.getUser('user') || interaction.user;

  // Try to get the member for better display name
  let member = null;
  try {
    member = await interaction.guild.members.fetch(targetUser.id);
  } catch {
    // Member not in guild, use user object
  }

  const embed = buildProfileEmbed(targetUser.id, member || targetUser);

  await interaction.reply({
    embeds: [embed],
    ephemeral: false, // Public so everyone can see
  });
}
