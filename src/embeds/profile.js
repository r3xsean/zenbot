import { EmbedBuilder } from 'discord.js';
import { players, matchHistory, challenges } from '../database/queries.js';

/**
 * Format form guide for display
 */
function formatFormGuide(form) {
  if (!form || form.length === 0) return null;
  return form.map(r => r === 'W' ? 'W' : 'L').join(' ');
}

/**
 * Format days at rank
 */
function formatDaysAtRank(rankSince) {
  if (!rankSince) return null;
  const days = Math.floor((Date.now() - rankSince) / (1000 * 60 * 60 * 24));
  if (days === 0) return 'today';
  if (days === 1) return '1 day';
  return `${days} days`;
}

/**
 * Build the player profile embed
 */
export function buildProfileEmbed(userId, user) {
  const player = players.getById(userId);
  const displayName = user?.displayName || user?.username || 'Unknown Player';
  const avatarUrl = user?.displayAvatarURL?.({ dynamic: true, size: 256 }) || null;

  // Base embed
  const embed = new EmbedBuilder()
    .setTitle(displayName)
    .setColor(0x2F3136);

  if (avatarUrl) {
    embed.setThumbnail(avatarUrl);
  }

  // If player doesn't exist or has no data
  if (!player) {
    embed.setDescription('No matches played yet.');
    return embed;
  }

  // === BUILD DESCRIPTION (main stats) ===
  const descLines = [];

  // Rank line
  if (player.rank) {
    let rankLine = `**Rank #${player.rank}**`;
    const daysAtRank = formatDaysAtRank(player.rank_since);
    if (daysAtRank) rankLine += ` (${daysAtRank})`;
    if (player.highest_rank && player.highest_rank < player.rank) {
      rankLine += ` · Peak: #${player.highest_rank}`;
    }
    descLines.push(rankLine);
  } else {
    descLines.push('**Unranked**');
  }

  // Record line
  const wins = player.wins || 0;
  const losses = player.losses || 0;
  const totalMatches = wins + losses;

  if (totalMatches > 0) {
    const winRate = Math.round((wins / totalMatches) * 100);
    descLines.push(`${wins}W - ${losses}L (${winRate}%)`);
  }

  // Form guide
  const form = matchHistory.getFormGuide(userId, 5);
  const formDisplay = formatFormGuide(form);
  if (formDisplay) {
    descLines.push(formDisplay);
  }

  // Streak
  if (player.win_streak > 0) {
    let streakLine = `${player.win_streak} win streak`;
    if (player.best_win_streak > player.win_streak) {
      streakLine += ` (best: ${player.best_win_streak})`;
    }
    descLines.push(streakLine);
  } else if (player.loss_streak > 1) {
    descLines.push(`${player.loss_streak} loss streak`);
  }

  // Cooldown
  if (player.cooldown_until && player.cooldown_until > Date.now()) {
    descLines.push(`On cooldown until <t:${Math.floor(player.cooldown_until / 1000)}:t>`);
  }

  embed.setDescription(descLines.join('\n'));

  // === STATS FIELD (only if they have meaningful stats) ===
  const titleDefenses = player.title_defenses || 0;
  const titleTakes = player.title_takes || 0;
  const perfectMatches = player.perfect_matches || 0;
  const comebackWins = player.comeback_wins || 0;
  const totalPoints = player.total_points || 0;
  const pointsConceded = player.total_points_conceded || 0;

  const hasStats = titleDefenses > 0 || titleTakes > 0 || perfectMatches > 0 || comebackWins > 0;

  if (hasStats || totalMatches >= 3) {
    const statLines = [];

    if (totalPoints > 0) {
      const pointDiff = totalPoints - pointsConceded;
      const diffStr = pointDiff >= 0 ? `+${pointDiff}` : `${pointDiff}`;
      statLines.push(`**Points:** ${totalPoints} scored, ${pointsConceded} conceded (${diffStr})`);
    }

    if (titleDefenses > 0 || titleTakes > 0) {
      const parts = [];
      if (titleTakes > 0) parts.push(`${titleTakes} title take${titleTakes !== 1 ? 's' : ''}`);
      if (titleDefenses > 0) parts.push(`${titleDefenses} defense${titleDefenses !== 1 ? 's' : ''}`);
      statLines.push(`**Titles:** ${parts.join(', ')}`);
    }

    if (perfectMatches > 0 || comebackWins > 0) {
      const parts = [];
      if (perfectMatches > 0) parts.push(`${perfectMatches} perfect`);
      if (comebackWins > 0) parts.push(`${comebackWins} comeback${comebackWins !== 1 ? 's' : ''}`);
      statLines.push(`**Special:** ${parts.join(', ')}`);
    }

    if (statLines.length > 0) {
      embed.addFields({ name: 'Stats', value: statLines.join('\n'), inline: false });
    }
  }

  // === RIVALRIES (only if they exist) ===
  const nemesis = matchHistory.getNemesis(userId);
  const victim = matchHistory.getVictim(userId);

  if (nemesis || victim) {
    const rivalryLines = [];
    if (nemesis && nemesis.losses >= 2) {
      rivalryLines.push(`**Nemesis:** <@${nemesis.opponent_id}> (${nemesis.losses} losses)`);
    }
    if (victim && victim.wins >= 2) {
      rivalryLines.push(`**Victim:** <@${victim.opponent_id}> (${victim.wins} wins)`);
    }

    if (rivalryLines.length > 0) {
      embed.addFields({ name: 'Rivalries', value: rivalryLines.join('\n'), inline: false });
    }
  }

  return embed;
}
