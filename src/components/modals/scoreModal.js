import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { challenges, matchResults } from '../../database/queries.js';
import { buildScoreConfirmationContent } from '../../embeds/log.js';

/**
 * Handle the score submission modal
 */
export async function handleScoreModal(interaction, challengeId) {
  const challenge = challenges.getById(challengeId);

  if (!challenge || challenge.status !== 'accepted') {
    return interaction.reply({
      content: 'This match is no longer active.',
      ephemeral: true,
    });
  }

  const submitterId = interaction.user.id;
  const opponentId = submitterId === challenge.challenger_id
    ? challenge.defender_id
    : challenge.challenger_id;

  // Parse inputs - format is "YOUR score - THEIR score"
  const set1 = interaction.fields.getTextInputValue('set1').trim();
  const set2 = interaction.fields.getTextInputValue('set2').trim();
  const set3 = interaction.fields.getTextInputValue('set3')?.trim() || null;

  // Parse score helper
  const parseScore = (scoreStr) => {
    const match = scoreStr.match(/^(\d{1,2})\s*[-–]\s*(\d{1,2})$/);
    if (!match) return null;
    return {
      submitter: parseInt(match[1]),  // YOUR score (submitter)
      opponent: parseInt(match[2])    // THEIR score (opponent)
    };
  };

  const score1 = parseScore(set1);
  const score2 = parseScore(set2);
  const score3 = set3 ? parseScore(set3) : null;

  if (!score1 || !score2) {
    return interaction.reply({
      content: 'Invalid score format. Use "10-6" format (your score first, then their score).',
      ephemeral: true,
    });
  }

  if (set3 && !score3) {
    return interaction.reply({
      content: 'Invalid Set 3 score format. Use "10-6" format or leave blank.',
      ephemeral: true,
    });
  }

  // Count sets won by each player
  const scores = [score1, score2];
  if (score3) scores.push(score3);

  let submitterSetsWon = 0;
  let opponentSetsWon = 0;

  for (const score of scores) {
    // A set is won by reaching 10+ and being ahead
    if (score.submitter >= 10 && score.submitter > score.opponent) {
      submitterSetsWon++;
    } else if (score.opponent >= 10 && score.opponent > score.submitter) {
      opponentSetsWon++;
    } else {
      return interaction.reply({
        content: `Invalid set score: ${score.submitter}-${score.opponent}. Winner must reach 10+ and be ahead.`,
        ephemeral: true,
      });
    }
  }

  // Validate someone won best of 3
  if (submitterSetsWon < 2 && opponentSetsWon < 2) {
    return interaction.reply({
      content: 'Invalid result - no one has won 2 sets yet. Did you forget Set 3?',
      ephemeral: true,
    });
  }

  if (submitterSetsWon >= 2 && opponentSetsWon >= 2) {
    return interaction.reply({
      content: 'Invalid result - both players can\'t win 2+ sets in best of 3.',
      ephemeral: true,
    });
  }

  // Determine winner
  const submitterWon = submitterSetsWon >= 2;
  const winnerId = submitterWon ? submitterId : opponentId;
  const loserId = submitterWon ? opponentId : submitterId;
  const setsWinner = Math.max(submitterSetsWon, opponentSetsWon);
  const setsLoser = Math.min(submitterSetsWon, opponentSetsWon);

  // Format scores for storage (always challenger vs defender format)
  const submitterIsChallenger = submitterId === challenge.challenger_id;
  const formattedScores = scores.map(s => {
    if (submitterIsChallenger) {
      return { challenger: s.submitter, defender: s.opponent };
    } else {
      return { challenger: s.opponent, defender: s.submitter };
    }
  });

  // Check if there's already a pending result
  const existing = matchResults.getPendingForChallenge(challengeId);
  if (existing) {
    const waitingFor = existing.submitted_by === submitterId ? opponentId : submitterId;
    return interaction.reply({
      content: `A result was already submitted! Waiting for <@${waitingFor}> to confirm or dispute it.`,
      ephemeral: true,
    });
  }

  // Save the result (pending confirmation)
  const resultId = matchResults.submit(
    challengeId,
    submitterId,
    winnerId,
    loserId,
    setsWinner,
    setsLoser,
    formattedScores
  );

  // Build confirmation content
  const confirmContent = buildScoreConfirmationContent({
    challengerId: challenge.challenger_id,
    defenderId: challenge.defender_id,
    winnerId,
    scores: formattedScores,
    setsWinner,
    setsLoser,
  });

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`score_confirm_${resultId}`)
      .setLabel('Confirm')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`score_dispute_${resultId}`)
      .setLabel('Dispute')
      .setStyle(ButtonStyle.Danger)
  );

  // Update the original challenge message instead of sending new one
  if (challenge.message_id && challenge.channel_id) {
    try {
      const requestChannel = interaction.client.channels.cache.get(challenge.channel_id);
      if (requestChannel) {
        const challengeMessage = await requestChannel.messages.fetch(challenge.message_id);
        await challengeMessage.edit({
          content: confirmContent,
          embeds: [],
          components: [buttons],
        });
      }
    } catch (err) {
      console.error('Could not update challenge message:', err);
    }
  }

  // Ping defender in the thread
  if (challenge.thread_id) {
    try {
      const thread = await interaction.client.channels.fetch(challenge.thread_id);
      if (thread) {
        await thread.send(
          `<@${challenge.defender_id}> - The result has been submitted! ` +
          `Please go to <#${challenge.channel_id}> to **confirm** or **dispute** it.`
        );
      }
    } catch (err) {
      console.log('Could not send thread notification:', err.message);
    }
  }

  // Quick acknowledgment to the challenger
  await interaction.reply({
    content: `Score submitted! Waiting for <@${challenge.defender_id}> to confirm.`,
    ephemeral: true,
  });
}
