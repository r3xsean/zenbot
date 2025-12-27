import { players, matchHistory } from '../database/queries.js';

/**
 * Format hours for cooldown display
 */
function formatCooldown(cooldownUntil) {
  if (!cooldownUntil || cooldownUntil <= Date.now()) {
    return null;
  }
  return `<t:${Math.floor(cooldownUntil / 1000)}:R>`;
}

/**
 * Build the leaderboard as plain text (not embed)
 */
export function buildLeaderboardContent() {
  const leaderboard = players.getLeaderboard();
  const now = Date.now();

  let content = '# Leaderboard\n\n## **Top 10 Rankings**\n';

  for (let i = 1; i <= 10; i++) {
    const player = leaderboard.find(p => p.rank === i);

    if (player) {
      const cooldown = formatCooldown(player.cooldown_until);

      if (cooldown) {
        content += `> **${i}.** **<@${player.discord_id}>** \`Cooldown expires\`${cooldown}\n`;
      } else {
        content += `> **${i}.** **<@${player.discord_id}>**\n`;
      }
    } else {
      content += `> **${i}.** *Empty*\n`;
    }
  }

  return content;
}

// Keep old function for backwards compatibility but mark as deprecated
export function buildLeaderboardEmbed(client) {
  // This now just returns null - use buildLeaderboardContent instead
  return null;
}
