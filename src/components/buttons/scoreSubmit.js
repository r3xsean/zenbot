import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js';
import { challenges } from '../../database/queries.js';

/**
 * Handle the "Submit Result" button click - opens the score modal
 */
export async function handleScoreSubmit(interaction, challengeId) {
  const challenge = challenges.getById(challengeId);

  if (!challenge) {
    return interaction.reply({
      content: 'This challenge no longer exists.',
      ephemeral: true,
    });
  }

  // Only the challenger can submit
  const userId = interaction.user.id;
  if (userId !== challenge.challenger_id) {
    if (userId === challenge.defender_id) {
      return interaction.reply({
        content: `Only the challenger (<@${challenge.challenger_id}>) can submit the result. You'll confirm it after they submit.`,
        ephemeral: true,
      });
    }
    return interaction.reply({
      content: 'Only the match participants can submit results.',
      ephemeral: true,
    });
  }

  if (challenge.status !== 'accepted') {
    return interaction.reply({
      content: 'This match is not in progress.',
      ephemeral: true,
    });
  }

  // Build the modal - scores are always YOUR score first, OPPONENT score second
  const modal = new ModalBuilder()
    .setCustomId(`score_modal_${challengeId}`)
    .setTitle('Submit Match Result');

  const set1Input = new TextInputBuilder()
    .setCustomId('set1')
    .setLabel('Set 1: YOUR score - THEIR score')
    .setPlaceholder('Example: 10-6 (you scored 10, they scored 6)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(10);

  const set2Input = new TextInputBuilder()
    .setCustomId('set2')
    .setLabel('Set 2: YOUR score - THEIR score')
    .setPlaceholder('Example: 8-10 (you scored 8, they scored 10)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(10);

  const set3Input = new TextInputBuilder()
    .setCustomId('set3')
    .setLabel('Set 3: YOUR score - THEIR score (if played)')
    .setPlaceholder('Leave blank if match ended 2-0')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(10);

  modal.addComponents(
    new ActionRowBuilder().addComponents(set1Input),
    new ActionRowBuilder().addComponents(set2Input),
    new ActionRowBuilder().addComponents(set3Input)
  );

  await interaction.showModal(modal);
}
