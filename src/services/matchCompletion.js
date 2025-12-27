import { players, matchHistory } from '../database/queries.js';
import { config } from '../config.js';
import { updateLeaderboard, scheduleLeaderboardRefresh } from './leaderboard.js';

/**
 * Calculate match statistics from scores
 */
function calculateMatchStats(scores, challengerId, defenderId, winnerId) {
  let challengerPoints = 0;
  let defenderPoints = 0;

  for (const set of scores) {
    challengerPoints += set.challenger;
    defenderPoints += set.defender;
  }

  const winnerIsChallenger = winnerId === challengerId;

  // Check if it was a perfect match (2-0)
  const setsWon = scores.filter(s =>
    (winnerIsChallenger && s.challenger > s.defender) ||
    (!winnerIsChallenger && s.defender > s.challenger)
  ).length;
  const setsLost = scores.length - setsWon;
  const isPerfect = setsLost === 0;

  // Check if it was a comeback (lost set 1 but won overall)
  const set1 = scores[0];
  const winnerLostSet1 = (winnerIsChallenger && set1.challenger < set1.defender) ||
                         (!winnerIsChallenger && set1.defender < set1.challenger);
  const isComeback = winnerLostSet1;

  return {
    challengerPoints,
    defenderPoints,
    isPerfect,
    isComeback,
    setsWon,
    setsLost,
    winnerIsChallenger,
  };
}

/**
 * Process a completed match - handles all rank changes, stats, cooldowns, and history
 *
 * @param {Object} options
 * @param {Object} options.client - Discord client
 * @param {string} options.challengerId - Challenger's Discord ID
 * @param {string} options.defenderId - Defender's Discord ID
 * @param {number} options.defenderRank - Defender's rank at time of challenge
 * @param {string} options.winnerId - Winner's Discord ID
 * @param {string} options.loserId - Loser's Discord ID
 * @param {number} options.setsWinner - Sets won by winner
 * @param {number} options.setsLoser - Sets won by loser
 * @param {Array} options.scores - Array of { challenger: number, defender: number }
 * @param {number} [options.challengeId] - Challenge ID for linking history
 * @param {boolean} [options.isForfeit=false] - Whether this was a forfeit (no scores)
 * @param {boolean} [options.skipCooldown=false] - Whether to skip applying cooldowns
 *
 * @returns {Object} { newWinnerRank, newLoserRank, cooldownUntil }
 */
export async function processMatchCompletion(options) {
  const {
    client,
    challengerId,
    defenderId,
    defenderRank,
    winnerId,
    loserId,
    setsWinner,
    setsLoser,
    scores,
    challengeId,
    isForfeit = false,
    skipCooldown = false,
  } = options;

  const winnerIsChallenger = winnerId === challengerId;

  // Ensure both players exist in database
  players.upsert(challengerId, {});
  players.upsert(defenderId, {});

  // Get current player data before changes
  const winnerBefore = players.getById(winnerId);
  const loserBefore = players.getById(loserId);

  // Apply cooldowns (unless skipped for forfeits)
  let cooldownUntil = null;
  if (!skipCooldown) {
    cooldownUntil = Date.now() + config.cooldownMs;
    players.setCooldown(challengerId, cooldownUntil);
    players.setCooldown(defenderId, cooldownUntil);
  }

  // Process rank swap if challenger wins
  let newWinnerRank, newLoserRank;

  if (winnerIsChallenger) {
    players.swapRanks(winnerId, loserId);
    newWinnerRank = defenderRank;
    newLoserRank = defenderRank + 1;
  } else {
    newWinnerRank = defenderRank;
    newLoserRank = loserBefore?.rank || null;
  }

  // Record basic win/loss
  players.recordWin(winnerId);
  players.recordLoss(loserId);

  // Record extended stats (only for non-forfeit matches with scores)
  if (!isForfeit && scores && scores.length > 0) {
    const stats = calculateMatchStats(scores, challengerId, defenderId, winnerId);

    // Winner stats
    players.updateWinStreak(winnerId);
    const winnerScored = winnerIsChallenger ? stats.challengerPoints : stats.defenderPoints;
    const winnerConceded = winnerIsChallenger ? stats.defenderPoints : stats.challengerPoints;
    players.addPoints(winnerId, winnerScored, winnerConceded);

    if (stats.isPerfect) {
      players.recordPerfectMatch(winnerId);
    }
    if (stats.isComeback) {
      players.recordComebackWin(winnerId);
    }
    if (winnerIsChallenger) {
      players.recordTitleTake(winnerId);
      players.updateRankTracking(winnerId, newWinnerRank);
    } else {
      players.recordTitleDefense(winnerId);
    }

    // Loser stats
    players.updateLossStreak(loserId);
    const loserScored = winnerIsChallenger ? stats.defenderPoints : stats.challengerPoints;
    const loserConceded = winnerIsChallenger ? stats.challengerPoints : stats.defenderPoints;
    players.addPoints(loserId, loserScored, loserConceded);

    if (winnerIsChallenger) {
      players.updateRankTracking(loserId, newLoserRank);
    }

    // Record match history for both players
    matchHistory.record({
      playerId: winnerId,
      opponentId: loserId,
      result: 'W',
      wasChallenger: winnerId === challengerId,
      setsWon: setsWinner,
      setsLost: setsLoser,
      pointsScored: winnerScored,
      pointsConceded: winnerConceded,
      wasComeback: stats.isComeback,
      wasPerfect: stats.isPerfect,
      rankBefore: winnerBefore?.rank || null,
      rankAfter: newWinnerRank,
      challengeId,
    });

    matchHistory.record({
      playerId: loserId,
      opponentId: winnerId,
      result: 'L',
      wasChallenger: loserId === challengerId,
      setsWon: setsLoser,
      setsLost: setsWinner,
      pointsScored: loserScored,
      pointsConceded: winnerConceded,
      wasComeback: false,
      wasPerfect: false,
      rankBefore: loserBefore?.rank || null,
      rankAfter: newLoserRank,
      challengeId,
    });
  } else {
    // Forfeit - still record basic match history
    matchHistory.record({
      playerId: winnerId,
      opponentId: loserId,
      result: 'W',
      wasChallenger: winnerId === challengerId,
      setsWon: setsWinner,
      setsLost: setsLoser,
      pointsScored: 0,
      pointsConceded: 0,
      wasComeback: false,
      wasPerfect: false,
      rankBefore: winnerBefore?.rank || null,
      rankAfter: newWinnerRank,
      challengeId,
    });

    matchHistory.record({
      playerId: loserId,
      opponentId: winnerId,
      result: 'L',
      wasChallenger: loserId === challengerId,
      setsWon: setsLoser,
      setsLost: setsWinner,
      pointsScored: 0,
      pointsConceded: 0,
      wasComeback: false,
      wasPerfect: false,
      rankBefore: loserBefore?.rank || null,
      rankAfter: newLoserRank,
      challengeId,
    });

    // Still update streaks for forfeits
    players.updateWinStreak(winnerId);
    players.updateLossStreak(loserId);

    if (winnerIsChallenger) {
      players.recordTitleTake(winnerId);
      players.updateRankTracking(winnerId, newWinnerRank);
      players.updateRankTracking(loserId, newLoserRank);
    }
  }

  // Update ELO ratings
  players.updateElo(winnerId, loserId);

  // Update leaderboard
  await updateLeaderboard(client);

  // Schedule leaderboard refresh when cooldown expires (only if cooldown applied)
  if (cooldownUntil) {
    scheduleLeaderboardRefresh(client, cooldownUntil);
  }

  return {
    newWinnerRank,
    newLoserRank,
    cooldownUntil,
    winnerIsChallenger,
  };
}
