import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { players, matchHistory } from '../database/queries.js';

export const h2hCommand = new SlashCommandBuilder()
  .setName('h2h')
  .setDescription('View head-to-head record between two players')
  .addUserOption(option =>
    option.setName('player1')
      .setDescription('First player')
      .setRequired(true))
  .addUserOption(option =>
    option.setName('player2')
      .setDescription('Second player')
      .setRequired(true));

export async function handleH2HCommand(interaction) {
  const user1 = interaction.options.getUser('player1');
  const user2 = interaction.options.getUser('player2');

  if (user1.id === user2.id) {
    return interaction.reply({
      content: 'Please select two different players.',
      ephemeral: true,
    });
  }

  // Get head-to-head stats
  const h2h = matchHistory.getHeadToHead(user1.id, user2.id);
  const totalMatches = h2h.wins + h2h.losses;

  if (totalMatches === 0) {
    return interaction.reply({
      content: `<@${user1.id}> and <@${user2.id}> have never played each other.`,
      ephemeral: false,
    });
  }

  // Get recent matches from player1's perspective
  const recentMatches = matchHistory.getRecentBetween(user1.id, user2.id, 5);

  // Get current ranks
  const player1 = players.getById(user1.id);
  const player2 = players.getById(user2.id);

  // Determine who's ahead
  let leader, leaderWins, trailerWins;
  if (h2h.wins > h2h.losses) {
    leader = user1;
    leaderWins = h2h.wins;
    trailerWins = h2h.losses;
  } else if (h2h.losses > h2h.wins) {
    leader = user2;
    leaderWins = h2h.losses;
    trailerWins = h2h.wins;
  } else {
    leader = null; // Tied
  }

  // Build embed
  const embed = new EmbedBuilder()
    .setTitle('Head to Head')
    .setColor(0x2F3136); // Neutral dark gray

  // Main matchup display
  const rank1 = player1?.rank ? `#${player1.rank}` : 'Unranked';
  const rank2 = player2?.rank ? `#${player2.rank}` : 'Unranked';

  let description = `**<@${user1.id}>** (${rank1}) vs **<@${user2.id}>** (${rank2})\n\n`;

  // Score display
  if (leader) {
    description += `**${leaderWins} - ${trailerWins}** in favor of <@${leader.id}>`;
  } else {
    description += `**${h2h.wins} - ${h2h.losses}** (Tied)`;
  }

  embed.setDescription(description);

  // Recent matches
  if (recentMatches.length > 0) {
    const matchLines = recentMatches.map(match => {
      // Determine if winner was challenger or defender
      // was_challenger is from player1's perspective
      const winnerWasChallenger = match.result === 'W' ? match.was_challenger : !match.was_challenger;
      const emoji = winnerWasChallenger ? '⚫' : '⚪';
      const winner = match.result === 'W' ? user1.id : user2.id;
      const score = `${match.sets_won}-${match.sets_lost}`;
      const date = `<t:${Math.floor(match.match_date / 1000)}:R>`;
      return `${emoji} <@${winner}> won ${score} ${date}`;
    });

    embed.addFields({
      name: 'Recent Matches',
      value: matchLines.join('\n') + '\n\n*⚫ Challenger won | ⚪ Defender won*',
      inline: false,
    });
  }

  // Fun stats
  const statLines = [];

  // Current streak
  let currentStreak = 0;
  let streakHolder = null;
  for (const match of recentMatches) {
    if (streakHolder === null) {
      streakHolder = match.result;
      currentStreak = 1;
    } else if (match.result === streakHolder) {
      currentStreak++;
    } else {
      break;
    }
  }

  if (currentStreak >= 2) {
    const streakWinner = streakHolder === 'W' ? user1.id : user2.id;
    statLines.push(`<a:blackfire:1452141367793811487> <@${streakWinner}> on a ${currentStreak} game win streak in this matchup`);
  }

  if (statLines.length > 0) {
    embed.addFields({
      name: 'Notes',
      value: statLines.join('\n'),
      inline: false,
    });
  }

  await interaction.reply({
    embeds: [embed],
    ephemeral: false,
  });
}
