import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

/**
 * Format date as DD/MM/YY
 */
function formatDate(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

/**
 * Get prediction label based on outcome and percentages
 */
function getPredictionLabel(winnerPct, wasUnderdog) {
  if (wasUnderdog) {
    if (winnerPct < 25) return 'Major Upset';
    if (winnerPct < 40) return 'Upset';
    return 'Close Match';
  } else {
    if (winnerPct > 75) return 'Dominant Favorite';
    if (winnerPct > 60) return 'Expected Result';
    return 'Close Match';
  }
}

/**
 * Build the challenge log as plain text for #logs channel
 */
export function buildChallengeLogContent(data) {
  const {
    challengerId,
    defenderId,
    defenderRank,
    winnerId,
    loserId,
    scores,
    setsWinner,
    setsLoser,
    newWinnerRank,
    newLoserRank,
    cooldownExpires,
    predictions,
  } = data;

  const winnerIsChallenger = winnerId === challengerId;

  // Format scores - show set winner's mention, then winner score-loser score
  let scoreLines = '';
  if (scores && scores.length > 0) {
    for (let i = 0; i < scores.length; i++) {
      const set = scores[i];
      const challengerWonSet = set.challenger > set.defender;
      const setWinnerId = challengerWonSet ? challengerId : defenderId;
      const winnerScore = Math.max(set.challenger, set.defender);
      const loserScore = Math.min(set.challenger, set.defender);
      scoreLines += `> • Set ${i + 1} <@${setWinnerId}> ${winnerScore}-${loserScore}\n`;
    }
  }

  // Build prediction text if available
  let predictionText = '';
  if (predictions && predictions.total > 0) {
    const challengerPct = Math.round((predictions.challengerCount / predictions.total) * 100);
    const defenderPct = 100 - challengerPct;

    // Determine if winner was the underdog
    const winnerPct = winnerIsChallenger ? challengerPct : defenderPct;
    const wasUnderdog = winnerPct < 50;
    const label = getPredictionLabel(winnerPct, wasUnderdog);

    predictionText = `\n**Predictions:**\n`;
    predictionText += `> **${label}**\n`;
    predictionText += `> • <@${challengerId}> (${challengerPct}%)\n`;
    predictionText += `> • <@${defenderId}> (${defenderPct}%)\n`;
  }

  // Rank change text
  let rankChangeText;
  if (winnerIsChallenger) {
    rankChangeText = `> • <@${winnerId}> has moved to Rank ${newWinnerRank} ↑\n> • <@${loserId}> has been moved down ↓`;
  } else {
    rankChangeText = `> • <@${winnerId}> defends their position`;
  }

  const content = `## **Challenge Log**

**Challenger:** <@${challengerId}>
**Defender:** <@${defenderId}>
**Rank for:** Rank ${defenderRank}
**Date:** ${formatDate()}

**Scores:**
${scoreLines}${predictionText}
**Winner:** <@${winnerId}>

> **Rank Changes**
${rankChangeText}

> *Cooldown has been applied to both parties, you can challenge them* <t:${Math.floor(cooldownExpires / 1000)}:R>`;

  return content;
}

/**
 * Build the pending score confirmation as plain text
 */
export function buildScoreConfirmationContent(data) {
  const {
    challengerId,
    defenderId,
    winnerId,
    scores,
    setsWinner,
    setsLoser,
  } = data;

  // Format scores
  let scoreLines = '';
  if (scores && scores.length > 0) {
    for (let i = 0; i < scores.length; i++) {
      const set = scores[i];
      scoreLines += `> • Set ${i + 1}: <@${challengerId}> ${set.challenger} - ${set.defender} <@${defenderId}>\n`;
    }
  }

  return `## **Awaiting Defender Confirmation**

<@${defenderId}> - Is this result correct?

**Claimed Winner:** <@${winnerId}> (${setsWinner}-${setsLoser})

**Set Scores:**
${scoreLines}
*Defender: Confirm if correct, Dispute if wrong*`;
}

/**
 * Build dispute alert as plain text for admin channel
 */
export function buildDisputeContent(data) {
  const {
    challengeId,
    challengerId,
    defenderId,
    defenderRank,
    submittedById,
    disputedById,
    claimedWinnerId,
    scores,
  } = data;

  // Format scores
  let scoreLines = '';
  if (scores && scores.length > 0) {
    for (let i = 0; i < scores.length; i++) {
      const set = scores[i];
      scoreLines += `> • Set ${i + 1}: <@${challengerId}> ${set.challenger} - ${set.defender} <@${defenderId}>\n`;
    }
  }

  const submitterClaimed = claimedWinnerId === submittedById ? 'claimed they won' : 'claimed they lost';

  return `## **Disputed Match - Admin Action Required**

**Challenge ID:** #${challengeId}
**Rank at Stake:** #${defenderRank}

**Challenger:** <@${challengerId}>
**Defender:** <@${defenderId}>

**Submitted by:** <@${submittedById}> (${submitterClaimed})
**Disputed by:** <@${disputedById}>

**Claimed Scores:**
${scoreLines}
*Use the buttons below to resolve this dispute*`;
}

/**
 * Build dispute resolution buttons for admin
 */
export function buildDisputeButton(challengeId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`dispute_resolve_${challengeId}`)
      .setLabel('Resolve This Dispute')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`dispute_void_${challengeId}`)
      .setLabel('Void Match')
      .setStyle(ButtonStyle.Secondary),
  );
}
