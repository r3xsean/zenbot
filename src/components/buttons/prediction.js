import { challenges, predictions } from '../../database/queries.js';

/**
 * Handle prediction button clicks
 */
export async function handlePrediction(interaction, challengeId, predictedWinnerId) {
  const challenge = challenges.getById(challengeId);

  if (!challenge) {
    return interaction.reply({
      content: 'This challenge no longer exists.',
      ephemeral: true,
    });
  }

  // Can't predict on completed/cancelled challenges
  if (challenge.status !== 'accepted') {
    return interaction.reply({
      content: 'Predictions are closed for this match.',
      ephemeral: true,
    });
  }

  const userId = interaction.user.id;

  // Players can't predict their own match
  if (userId === challenge.challenger_id || userId === challenge.defender_id) {
    return interaction.reply({
      content: 'You can\'t predict on your own match!',
      ephemeral: true,
    });
  }

  // Check if user already predicted
  const existingPrediction = predictions.getUserPrediction(challengeId, userId);
  const isChanging = existingPrediction && existingPrediction.predicted_winner_id !== predictedWinnerId;

  // Save prediction
  predictions.upsert(challengeId, userId, predictedWinnerId);

  // Get prediction counts
  const allPredictions = predictions.getForChallenge(challengeId);
  const challengerPredictions = allPredictions.filter(p => p.predicted_winner_id === challenge.challenger_id).length;
  const defenderPredictions = allPredictions.filter(p => p.predicted_winner_id === challenge.defender_id).length;

  const response = isChanging
    ? `Changed your prediction to <@${predictedWinnerId}>!`
    : `You predicted <@${predictedWinnerId}> will win!`;

  await interaction.reply({
    content: `${response}\n\nCurrent predictions: **${challengerPredictions}** for challenger, **${defenderPredictions}** for defender`,
    ephemeral: true,
  });
}
