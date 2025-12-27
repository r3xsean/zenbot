import db from './init.js';

// ============ PLAYERS ============

export const players = {
  // Get all ranked players ordered by rank
  getLeaderboard() {
    return db.prepare(`
      SELECT * FROM players
      WHERE rank IS NOT NULL
      ORDER BY rank ASC
    `).all();
  },

  // Alias for getLeaderboard
  getAllRanked() {
    return this.getLeaderboard();
  },

  // Get a single player by Discord ID
  getById(discordId) {
    return db.prepare('SELECT * FROM players WHERE discord_id = ?').get(discordId);
  },

  // Get player by rank
  getByRank(rank) {
    return db.prepare('SELECT * FROM players WHERE rank = ?').get(rank);
  },

  // Create or update player
  upsert(discordId, data = {}) {
    const existing = this.getById(discordId);
    if (existing) {
      // If rank is being set/changed, also set rank_since
      if (data.rank !== undefined && data.rank !== existing.rank) {
        data.rank_since = Date.now();
        // Update highest rank if applicable
        if (data.rank !== null) {
          const currentHighest = existing.highest_rank;
          if (!currentHighest || data.rank < currentHighest) {
            data.highest_rank = data.rank;
          }
        }
      }

      const updates = [];
      const values = [];
      for (const [key, value] of Object.entries(data)) {
        updates.push(`${key} = ?`);
        values.push(value);
      }
      if (updates.length > 0) {
        values.push(discordId);
        db.prepare(`UPDATE players SET ${updates.join(', ')} WHERE discord_id = ?`).run(...values);
      }
    } else {
      // New player - set rank_since if they're getting a rank
      const rankSince = data.rank ? Date.now() : null;
      const highestRank = data.rank || null;

      db.prepare(`
        INSERT INTO players (discord_id, rank, cooldown_until, wins, losses, rank_since, highest_rank)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        discordId,
        data.rank ?? null,
        data.cooldown_until ?? null,
        data.wins ?? 0,
        data.losses ?? 0,
        rankSince,
        highestRank
      );
    }
    return this.getById(discordId);
  },

  // Set cooldown for a player
  setCooldown(discordId, until) {
    db.prepare('UPDATE players SET cooldown_until = ? WHERE discord_id = ?').run(until, discordId);
  },

  // Check if player is on cooldown
  isOnCooldown(discordId) {
    const player = this.getById(discordId);
    if (!player || !player.cooldown_until) return false;
    return player.cooldown_until > Date.now();
  },

  // Swap ranks between two players (used after a match)
  swapRanks(winnerId, loserId) {
    const winner = this.getById(winnerId);
    const loser = this.getById(loserId);

    if (!loser?.rank) return; // Loser must be ranked

    const now = Date.now();

    const transaction = db.transaction(() => {
      if (winner?.rank && winner.rank < loser.rank) {
        // Winner already ranked higher, no swap needed (defender won)
        return;
      }

      // Winner takes loser's rank
      const targetRank = loser.rank;

      if (winner?.rank) {
        // Both ranked - swap ranks and update rank_since
        db.prepare('UPDATE players SET rank = -1 WHERE discord_id = ?').run(winnerId);
        db.prepare('UPDATE players SET rank = ?, rank_since = ? WHERE discord_id = ?').run(winner.rank, now, loserId);
        db.prepare('UPDATE players SET rank = ?, rank_since = ? WHERE discord_id = ?').run(targetRank, now, winnerId);
      } else {
        // Winner unranked - push everyone down and update their rank_since
        db.prepare(`
          UPDATE players
          SET rank = rank + 1, rank_since = ?
          WHERE rank >= ? AND rank <= 10
        `).run(now, targetRank);

        // Remove anyone pushed past rank 10 (they lose their rank)
        db.prepare('UPDATE players SET rank = NULL, rank_since = NULL WHERE rank > 10').run();

        // Give winner the target rank
        this.upsert(winnerId, { rank: targetRank });
      }
    });

    transaction();
  },

  // Increment wins/losses
  recordWin(discordId) {
    this.upsert(discordId, {});
    db.prepare('UPDATE players SET wins = wins + 1 WHERE discord_id = ?').run(discordId);
  },

  recordLoss(discordId) {
    this.upsert(discordId, {});
    db.prepare('UPDATE players SET losses = losses + 1 WHERE discord_id = ?').run(discordId);
  },

  // Update win streak (call after a win)
  updateWinStreak(discordId) {
    const player = this.getById(discordId);
    if (!player) return;

    const newStreak = (player.win_streak || 0) + 1;
    const bestStreak = Math.max(player.best_win_streak || 0, newStreak);

    db.prepare(`
      UPDATE players
      SET win_streak = ?, best_win_streak = ?, loss_streak = 0
      WHERE discord_id = ?
    `).run(newStreak, bestStreak, discordId);
  },

  // Update loss streak (call after a loss)
  updateLossStreak(discordId) {
    db.prepare(`
      UPDATE players
      SET loss_streak = loss_streak + 1, win_streak = 0
      WHERE discord_id = ?
    `).run(discordId);
  },

  // Record a title defense (defender won)
  recordTitleDefense(discordId) {
    db.prepare('UPDATE players SET title_defenses = title_defenses + 1 WHERE discord_id = ?').run(discordId);
  },

  // Record a title take (challenger won)
  recordTitleTake(discordId) {
    db.prepare('UPDATE players SET title_takes = title_takes + 1 WHERE discord_id = ?').run(discordId);
  },

  // Record a perfect match (2-0 win)
  recordPerfectMatch(discordId) {
    db.prepare('UPDATE players SET perfect_matches = perfect_matches + 1 WHERE discord_id = ?').run(discordId);
  },

  // Record a comeback win (won after losing set 1)
  recordComebackWin(discordId) {
    db.prepare('UPDATE players SET comeback_wins = comeback_wins + 1 WHERE discord_id = ?').run(discordId);
  },

  // Add points to total
  addPoints(discordId, scored, conceded) {
    db.prepare(`
      UPDATE players
      SET total_points = total_points + ?,
          total_points_conceded = total_points_conceded + ?
      WHERE discord_id = ?
    `).run(scored, conceded, discordId);
  },

  // Update rank tracking (call when rank changes)
  updateRankTracking(discordId, newRank) {
    const player = this.getById(discordId);
    const now = Date.now();

    // Update highest rank if this is better (lower number = better)
    const currentHighest = player?.highest_rank;
    const newHighest = (!currentHighest || newRank < currentHighest) ? newRank : currentHighest;

    db.prepare(`
      UPDATE players
      SET rank_since = ?, highest_rank = ?
      WHERE discord_id = ?
    `).run(now, newHighest, discordId);
  },

  // Get days at current rank
  getDaysAtRank(discordId) {
    const player = this.getById(discordId);
    if (!player?.rank_since) return 0;
    return Math.floor((Date.now() - player.rank_since) / (1000 * 60 * 60 * 24));
  },

  // Remove a player's rank and shift everyone below them up
  removeRankAndShiftUp(discordId) {
    const player = this.getById(discordId);
    if (!player?.rank) return;

    const removedRank = player.rank;

    const transaction = db.transaction(() => {
      // Remove this player's rank
      db.prepare('UPDATE players SET rank = NULL, rank_since = NULL WHERE discord_id = ?').run(discordId);

      // Shift everyone below up by 1
      db.prepare(`
        UPDATE players
        SET rank = rank - 1
        WHERE rank > ?
      `).run(removedRank);
    });

    transaction();
  },

  // Toggle DM notifications preference
  toggleDmNotifications(discordId) {
    this.upsert(discordId, {});
    const player = this.getById(discordId);
    const newValue = player.dm_notifications ? 0 : 1;
    db.prepare('UPDATE players SET dm_notifications = ? WHERE discord_id = ?').run(newValue, discordId);
    return newValue === 1;
  },

  // Check if player wants DM notifications
  wantsDmNotifications(discordId) {
    const player = this.getById(discordId);
    return player?.dm_notifications === 1;
  },

  // Get player's ELO rating
  getElo(discordId) {
    const player = this.getById(discordId);
    return player?.elo || 1200;
  },

  // Update ELO ratings after a match
  updateElo(winnerId, loserId) {
    const K = 32; // K-factor for rating adjustments

    const winnerElo = this.getElo(winnerId);
    const loserElo = this.getElo(loserId);

    // Calculate expected scores
    const expectedWinner = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
    const expectedLoser = 1 / (1 + Math.pow(10, (winnerElo - loserElo) / 400));

    // Calculate new ratings
    const newWinnerElo = Math.round(winnerElo + K * (1 - expectedWinner));
    const newLoserElo = Math.round(loserElo + K * (0 - expectedLoser));

    // Ensure ELO doesn't go below 100
    const finalWinnerElo = Math.max(100, newWinnerElo);
    const finalLoserElo = Math.max(100, newLoserElo);

    // Ensure players exist in DB
    this.upsert(winnerId, {});
    this.upsert(loserId, {});

    // Update ratings
    db.prepare('UPDATE players SET elo = ? WHERE discord_id = ?').run(finalWinnerElo, winnerId);
    db.prepare('UPDATE players SET elo = ? WHERE discord_id = ?').run(finalLoserElo, loserId);

    return {
      winnerOld: winnerElo,
      winnerNew: finalWinnerElo,
      loserOld: loserElo,
      loserNew: finalLoserElo,
    };
  },
};

// ============ CHALLENGES ============

export const challenges = {
  // Create a new challenge
  create(challengerId, defenderId, defenderRank, expiresAt, messageId = null, channelId = null) {
    const result = db.prepare(`
      INSERT INTO challenges (challenger_id, defender_id, defender_rank, created_at, expires_at, message_id, channel_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(challengerId, defenderId, defenderRank, Date.now(), expiresAt, messageId, channelId);
    return result.lastInsertRowid;
  },

  // Get challenge by ID
  getById(id) {
    return db.prepare('SELECT * FROM challenges WHERE id = ?').get(id);
  },

  // Get pending challenge for a defender
  getPendingForDefender(defenderId) {
    return db.prepare(`
      SELECT * FROM challenges
      WHERE defender_id = ? AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 1
    `).get(defenderId);
  },

  // Get active challenge between two players
  getActiveBetween(player1Id, player2Id) {
    return db.prepare(`
      SELECT * FROM challenges
      WHERE status IN ('pending', 'accepted')
      AND ((challenger_id = ? AND defender_id = ?) OR (challenger_id = ? AND defender_id = ?))
    `).get(player1Id, player2Id, player2Id, player1Id);
  },

  // Update challenge status
  updateStatus(id, status) {
    db.prepare('UPDATE challenges SET status = ? WHERE id = ?').run(status, id);
  },

  // Update message ID (for editing the challenge message later)
  updateMessageId(id, messageId, channelId) {
    db.prepare('UPDATE challenges SET message_id = ?, channel_id = ? WHERE id = ?').run(messageId, channelId, id);
  },

  // Update thread ID
  updateThreadId(id, threadId) {
    db.prepare('UPDATE challenges SET thread_id = ? WHERE id = ?').run(threadId, id);
  },

  // Get all expired pending challenges
  getExpired() {
    return db.prepare(`
      SELECT * FROM challenges
      WHERE status = 'pending' AND expires_at < ?
    `).all(Date.now());
  },

  // Get active challenges for a player (as challenger or defender)
  getActiveForPlayer(discordId) {
    return db.prepare(`
      SELECT * FROM challenges
      WHERE status IN ('pending', 'accepted')
      AND (challenger_id = ? OR defender_id = ?)
    `).all(discordId, discordId);
  },

  // Get all pending challenges
  getPending() {
    return db.prepare(`
      SELECT * FROM challenges
      WHERE status = 'pending'
      ORDER BY created_at DESC
    `).all();
  },

  // Get all accepted (in-progress) challenges
  getAccepted() {
    return db.prepare(`
      SELECT * FROM challenges
      WHERE status = 'accepted'
      ORDER BY created_at DESC
    `).all();
  },

  // Get all disputed challenges
  getDisputed() {
    return db.prepare(`
      SELECT * FROM challenges
      WHERE status = 'disputed'
      ORDER BY created_at DESC
    `).all();
  },

  // Get accepted challenges needing reminder (for score submission)
  // Excludes challenges that already have a pending result submitted
  getNeedingScoreReminder(reminderIntervalMs) {
    const now = Date.now();
    const threshold = now - reminderIntervalMs;
    return db.prepare(`
      SELECT c.* FROM challenges c
      WHERE c.status = 'accepted'
      AND (c.last_reminder_at IS NULL OR c.last_reminder_at < ?)
      AND NOT EXISTS (
        SELECT 1 FROM match_results mr
        WHERE mr.challenge_id = c.id
        AND mr.confirmed = 0 AND mr.disputed = 0
      )
    `).all(threshold);
  },

  // Get disputed challenges needing admin reminder
  getNeedingDisputeReminder(reminderIntervalMs) {
    const now = Date.now();
    const threshold = now - reminderIntervalMs;
    return db.prepare(`
      SELECT * FROM challenges
      WHERE status = 'disputed'
      AND (last_reminder_at IS NULL OR last_reminder_at < ?)
    `).all(threshold);
  },

  // Update reminder timestamp
  updateReminderTime(id) {
    db.prepare('UPDATE challenges SET last_reminder_at = ? WHERE id = ?').run(Date.now(), id);
  },
};

// ============ MATCH RESULTS ============

export const matchResults = {
  // Submit a match result (pending confirmation)
  submit(challengeId, submittedBy, winnerId, loserId, setsWinner, setsLoser, scores) {
    const result = db.prepare(`
      INSERT INTO match_results (challenge_id, submitted_by, winner_id, loser_id, sets_winner, sets_loser, scores, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(challengeId, submittedBy, winnerId, loserId, setsWinner, setsLoser, JSON.stringify(scores), Date.now());
    return result.lastInsertRowid;
  },

  // Get pending result for a challenge
  getPendingForChallenge(challengeId) {
    return db.prepare(`
      SELECT * FROM match_results
      WHERE challenge_id = ? AND confirmed = 0 AND disputed = 0
    `).get(challengeId);
  },

  // Confirm a result
  confirm(id) {
    db.prepare('UPDATE match_results SET confirmed = 1 WHERE id = ?').run(id);
  },

  // Mark as disputed
  dispute(id) {
    db.prepare('UPDATE match_results SET disputed = 1 WHERE id = ?').run(id);
  },

  // Get by ID
  getById(id) {
    return db.prepare('SELECT * FROM match_results WHERE id = ?').get(id);
  },

  // Get result by challenge ID (confirmed or disputed)
  getByChallenge(challengeId) {
    return db.prepare('SELECT * FROM match_results WHERE challenge_id = ?').get(challengeId);
  },

  // Get all pending (unconfirmed, undisputed) results
  getAllPending() {
    return db.prepare(`
      SELECT * FROM match_results
      WHERE confirmed = 0 AND disputed = 0
      ORDER BY created_at DESC
    `).all();
  },

  // Get pending results needing confirmation reminder
  getNeedingConfirmReminder(reminderIntervalMs) {
    const now = Date.now();
    const threshold = now - reminderIntervalMs;
    return db.prepare(`
      SELECT * FROM match_results
      WHERE confirmed = 0 AND disputed = 0
      AND (last_reminder_at IS NULL OR last_reminder_at < ?)
    `).all(threshold);
  },

  // Update reminder timestamp
  updateReminderTime(id) {
    db.prepare('UPDATE match_results SET last_reminder_at = ? WHERE id = ?').run(Date.now(), id);
  },
};

// ============ BOT STATE ============

export const botState = {
  get(key) {
    const row = db.prepare('SELECT value FROM bot_state WHERE key = ?').get(key);
    return row?.value ?? null;
  },

  set(key, value) {
    db.prepare(`
      INSERT INTO bot_state (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = ?
    `).run(key, value, value);
  },

  delete(key) {
    db.prepare('DELETE FROM bot_state WHERE key = ?').run(key);
  },
};

// ============ MATCH HISTORY ============

export const matchHistory = {
  // Record a match for a player
  record(data) {
    const {
      playerId,
      opponentId,
      result, // 'W' or 'L'
      wasChallenger,
      setsWon,
      setsLost,
      pointsScored,
      pointsConceded,
      wasComeback,
      wasPerfect,
      rankBefore,
      rankAfter,
      challengeId,
    } = data;

    db.prepare(`
      INSERT INTO match_history (
        player_id, opponent_id, result, was_challenger,
        sets_won, sets_lost, points_scored, points_conceded,
        was_comeback, was_perfect, rank_before, rank_after,
        match_date, challenge_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      playerId, opponentId, result, wasChallenger ? 1 : 0,
      setsWon, setsLost, pointsScored, pointsConceded,
      wasComeback ? 1 : 0, wasPerfect ? 1 : 0, rankBefore, rankAfter,
      Date.now(), challengeId
    );
  },

  // Get form guide (last N results) for a player
  getFormGuide(playerId, limit = 5) {
    return db.prepare(`
      SELECT result FROM match_history
      WHERE player_id = ?
      ORDER BY match_date DESC
      LIMIT ?
    `).all(playerId, limit).map(r => r.result);
  },

  // Get form guide as string (e.g., "WWLWW")
  getFormString(playerId, limit = 5) {
    const form = this.getFormGuide(playerId, limit);
    return form.join('') || '-';
  },

  // Get head-to-head record against a specific opponent
  getHeadToHead(playerId, opponentId) {
    const wins = db.prepare(`
      SELECT COUNT(*) as count FROM match_history
      WHERE player_id = ? AND opponent_id = ? AND result = 'W'
    `).get(playerId, opponentId).count;

    const losses = db.prepare(`
      SELECT COUNT(*) as count FROM match_history
      WHERE player_id = ? AND opponent_id = ? AND result = 'L'
    `).get(playerId, opponentId).count;

    return { wins, losses };
  },

  // Get all opponents with head-to-head records
  getAllHeadToHead(playerId) {
    return db.prepare(`
      SELECT
        opponent_id,
        SUM(CASE WHEN result = 'W' THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN result = 'L' THEN 1 ELSE 0 END) as losses
      FROM match_history
      WHERE player_id = ?
      GROUP BY opponent_id
    `).all(playerId);
  },

  // Get player's nemesis (opponent they've lost to most)
  getNemesis(playerId) {
    return db.prepare(`
      SELECT opponent_id, COUNT(*) as losses
      FROM match_history
      WHERE player_id = ? AND result = 'L'
      GROUP BY opponent_id
      ORDER BY losses DESC
      LIMIT 1
    `).get(playerId);
  },

  // Get player's favorite victim (opponent they've beaten most)
  getVictim(playerId) {
    return db.prepare(`
      SELECT opponent_id, COUNT(*) as wins
      FROM match_history
      WHERE player_id = ? AND result = 'W'
      GROUP BY opponent_id
      ORDER BY wins DESC
      LIMIT 1
    `).get(playerId);
  },

  // Get recent matches for a player
  getRecent(playerId, limit = 10) {
    return db.prepare(`
      SELECT * FROM match_history
      WHERE player_id = ?
      ORDER BY match_date DESC
      LIMIT ?
    `).all(playerId, limit);
  },

  // Get recent matches between two specific players
  getRecentBetween(player1Id, player2Id, limit = 5) {
    return db.prepare(`
      SELECT * FROM match_history
      WHERE player_id = ? AND opponent_id = ?
      ORDER BY match_date DESC
      LIMIT ?
    `).all(player1Id, player2Id, limit);
  },
};

// ============ PREDICTIONS ============

export const predictions = {
  // Create or update a prediction
  upsert(challengeId, userId, predictedWinnerId) {
    db.prepare(`
      INSERT INTO predictions (challenge_id, user_id, predicted_winner_id, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(challenge_id, user_id) DO UPDATE SET
        predicted_winner_id = ?,
        created_at = ?
    `).run(challengeId, userId, predictedWinnerId, Date.now(), predictedWinnerId, Date.now());
  },

  // Get all predictions for a challenge
  getForChallenge(challengeId) {
    return db.prepare(`
      SELECT * FROM predictions
      WHERE challenge_id = ?
    `).all(challengeId);
  },

  // Get a user's prediction for a challenge
  getUserPrediction(challengeId, userId) {
    return db.prepare(`
      SELECT * FROM predictions
      WHERE challenge_id = ? AND user_id = ?
    `).get(challengeId, userId);
  },

  // Mark predictions as correct/incorrect after match
  resolvePredictions(challengeId, winnerId) {
    db.prepare(`
      UPDATE predictions
      SET correct = (predicted_winner_id = ?)
      WHERE challenge_id = ?
    `).run(winnerId, challengeId);
  },

  // Get correct predictions for a challenge
  getCorrectPredictions(challengeId) {
    return db.prepare(`
      SELECT * FROM predictions
      WHERE challenge_id = ? AND correct = 1
    `).all(challengeId);
  },

  // Get prediction stats for a user
  getUserStats(userId) {
    return db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN correct = 1 THEN 1 ELSE 0 END) as correct,
        SUM(CASE WHEN correct = 0 THEN 1 ELSE 0 END) as incorrect
      FROM predictions
      WHERE user_id = ? AND correct IS NOT NULL
    `).get(userId);
  },
};

// ============ SCORE CORRECTIONS ============

export const corrections = {
  // Create a correction request
  create(challengeId, requestedBy, newScores, newWinnerId) {
    const result = db.prepare(`
      INSERT INTO score_corrections (challenge_id, requested_by, new_scores, new_winner_id, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(challengeId, requestedBy, JSON.stringify(newScores), newWinnerId, Date.now());
    return result.lastInsertRowid;
  },

  // Get pending correction for a challenge
  getPendingForChallenge(challengeId) {
    return db.prepare(`
      SELECT * FROM score_corrections
      WHERE challenge_id = ? AND status = 'pending'
    `).get(challengeId);
  },

  // Get correction by ID
  getById(id) {
    return db.prepare('SELECT * FROM score_corrections WHERE id = ?').get(id);
  },

  // Approve correction
  approve(id, approvedBy) {
    db.prepare(`
      UPDATE score_corrections
      SET status = 'approved', approved_by = ?
      WHERE id = ?
    `).run(approvedBy, id);
  },

  // Reject correction
  reject(id) {
    db.prepare(`
      UPDATE score_corrections
      SET status = 'rejected'
      WHERE id = ?
    `).run(id);
  },
};
