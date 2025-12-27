import { challenges, matchResults } from '../database/queries.js';
import { config } from '../config.js';
import { processMatchCompletion } from './matchCompletion.js';

/**
 * Check for and process expired challenges
 */
async function processExpiredChallenges(client) {
  const expired = challenges.getExpired();

  for (const challenge of expired) {
    try {
      // Auto-forfeit: challenger wins
      challenges.updateStatus(challenge.id, 'expired');

      // Process match completion (forfeit - no scores, no cooldowns)
      await processMatchCompletion({
        client,
        challengerId: challenge.challenger_id,
        defenderId: challenge.defender_id,
        defenderRank: challenge.defender_rank,
        winnerId: challenge.challenger_id,
        loserId: challenge.defender_id,
        setsWinner: 2,
        setsLoser: 0,
        scores: null,
        challengeId: challenge.id,
        isForfeit: true,
        skipCooldown: true,
      });

      // Try to update the original challenge message
      if (challenge.message_id && challenge.channel_id) {
        const channel = client.channels.cache.get(challenge.channel_id);
        if (channel) {
          try {
            const message = await channel.messages.fetch(challenge.message_id);
            await message.edit({
              content:
                `**Challenge Expired**\n\n` +
                `<@${challenge.defender_id}> did not respond in time.\n` +
                `<@${challenge.challenger_id}> wins by forfeit and takes Rank #${challenge.defender_rank}!`,
              embeds: [],
              components: [],
            });
          } catch (err) {
            console.log('Could not update expired challenge message:', err.message);
          }
        }
      }

      // Post to logs
      const logsChannel = client.channels.cache.get(config.channels.logs);
      if (logsChannel) {
        await logsChannel.send(
          `> ## **Auto-Forfeit**\n>\n` +
          `> <@${challenge.defender_id}> did not respond to challenge from <@${challenge.challenger_id}>.\n` +
          `> <@${challenge.challenger_id}> claims Rank #${challenge.defender_rank} by forfeit.\n>\n` +
          `> *No cooldown applied.*`
        );
      }

      // Archive the match thread if it exists
      if (challenge.thread_id) {
        try {
          const thread = await client.channels.fetch(challenge.thread_id);
          if (thread) {
            await thread.send(`**Challenge Expired.** <@${challenge.challenger_id}> wins by forfeit. This thread will be archived.`);
            await thread.setArchived(true);
          }
        } catch (err) {
          console.log('Could not archive thread:', err.message);
        }
      }

      console.log(`Processed expired challenge ${challenge.id}`);
    } catch (error) {
      console.error(`Error processing expired challenge ${challenge.id}:`, error);
    }
  }
}

/**
 * Send reminders for matches waiting on score submission
 */
async function sendScoreSubmissionReminders(client) {
  const needingReminder = challenges.getNeedingScoreReminder(config.reminderIntervalMs);

  for (const challenge of needingReminder) {
    try {
      // Send to thread if it exists, otherwise fall back to channel
      const targetChannelId = challenge.thread_id || challenge.channel_id;
      if (targetChannelId) {
        const channel = await client.channels.fetch(targetChannelId).catch(() => null);
        if (channel) {
          await channel.send(
            `**Reminder:** <@${challenge.challenger_id}> - Your match against <@${challenge.defender_id}> is waiting for you to submit the result!\n` +
            `Use the "Submit Result" button on the match message.`
          );
        }
      }

      challenges.updateReminderTime(challenge.id);
      console.log(`Sent score submission reminder for challenge ${challenge.id}`);
    } catch (error) {
      console.error(`Error sending score reminder for challenge ${challenge.id}:`, error);
    }
  }
}

/**
 * Send reminders for results waiting on confirmation
 */
async function sendConfirmationReminders(client) {
  const needingReminder = matchResults.getNeedingConfirmReminder(config.reminderIntervalMs);

  for (const result of needingReminder) {
    try {
      const challenge = challenges.getById(result.challenge_id);
      if (!challenge) continue;

      // Send to thread if it exists, otherwise fall back to channel
      const targetChannelId = challenge.thread_id || challenge.channel_id;
      if (targetChannelId) {
        const channel = await client.channels.fetch(targetChannelId).catch(() => null);
        if (channel) {
          await channel.send(
            `**Reminder:** <@${challenge.defender_id}> - Please confirm or dispute the match result submitted by <@${challenge.challenger_id}>!`
          );
        }
      }

      matchResults.updateReminderTime(result.id);
      console.log(`Sent confirmation reminder for result ${result.id}`);
    } catch (error) {
      console.error(`Error sending confirmation reminder for result ${result.id}:`, error);
    }
  }
}

/**
 * Send reminders for disputes waiting on admin resolution
 */
async function sendDisputeReminders(client) {
  const needingReminder = challenges.getNeedingDisputeReminder(config.reminderIntervalMs);

  for (const challenge of needingReminder) {
    try {
      const disputesChannel = client.channels.cache.get(config.channels.disputes);
      if (disputesChannel) {
        await disputesChannel.send(
          `**Reminder:** Disputed match between <@${challenge.challenger_id}> and <@${challenge.defender_id}> (Rank #${challenge.defender_rank}) is still awaiting admin resolution!`
        );
      }

      challenges.updateReminderTime(challenge.id);
      console.log(`Sent dispute reminder for challenge ${challenge.id}`);
    } catch (error) {
      console.error(`Error sending dispute reminder for challenge ${challenge.id}:`, error);
    }
  }
}

/**
 * Start the expiration and reminder check interval
 */
export function startExpirationChecker(client) {
  // Check every minute for expirations
  setInterval(() => {
    processExpiredChallenges(client);
  }, 60 * 1000);

  // Check every 5 minutes for reminders
  setInterval(() => {
    sendScoreSubmissionReminders(client);
    sendConfirmationReminders(client);
    sendDisputeReminders(client);
  }, 5 * 60 * 1000);

  // Run immediately on startup
  processExpiredChallenges(client);

  console.log('Expiration checker and reminders started');
}

export { processExpiredChallenges };
