import { handleChallengeStart } from '../components/buttons/challengeStart.js';
import { handleCooldownRemove } from '../components/buttons/cooldownRemove.js';
import { handleDmNotificationsToggle } from '../components/buttons/dmNotifications.js';
import { handleChallengeAccept, handleChallengeDecline } from '../components/buttons/challengeResponse.js';
import { handleScoreSubmit } from '../components/buttons/scoreSubmit.js';
import { handleScoreConfirm, handleScoreDispute } from '../components/buttons/scoreConfirm.js';
import { handlePrediction } from '../components/buttons/prediction.js';
import {
  handleCorrectionRequest,
  handleCorrectionModal,
  handleCorrectionApprove,
  handleCorrectionReject,
} from '../components/buttons/correction.js';
import { handleChallengeSelect, handleUnrankedUserSelect } from '../components/selects/challengeSelect.js';
import { handleScoreModal } from '../components/modals/scoreModal.js';
import { handleAdminCommand } from '../commands/admin.js';
import { handleProfileCommand } from '../commands/profile.js';
import { handleH2HCommand } from '../commands/h2h.js';
import { handleHistoryCommand, handleHistoryNavigation } from '../commands/history.js';
import {
  handleSetupCommand,
  handleSetupChannelButton,
  handleSetupChannelSelect,
  handleSetupFinish,
} from '../commands/setup.js';
import {
  handleAdminSetRank,
  handleAdminRemoveRank,
  handleAdminClearCooldown,
  handleAdminRefresh,
  handleAdminForceResult,
  handleAdminViewPending,
  handleAdminCancelChallenge,
  handleAdminSetCooldown,
  handleAdminSetResponseWindow,
  handleAdminModal,
} from '../components/buttons/adminPanel.js';
import {
  handleDisputeResolve,
  handleDisputeVoid,
  handleDisputeModal,
} from '../components/buttons/disputeResolve.js';
import {
  handleAdminSelectRemoveRank,
  handleAdminSelectClearCooldown,
  handleAdminSelectForceResultWinner,
  handleAdminSelectForceResultLoser,
  handleAdminForceResultFinalModal,
  handleAdminSelectCancelChallenge,
} from '../components/selects/adminSelects.js';

/**
 * Route all interactions to appropriate handlers
 */
export async function handleInteraction(interaction) {
  try {
    // Slash commands
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'setup') {
        return handleSetupCommand(interaction);
      }
      if (interaction.commandName === 'profile') {
        return handleProfileCommand(interaction);
      }
      if (interaction.commandName === 'h2h') {
        return handleH2HCommand(interaction);
      }
      if (interaction.commandName === 'history') {
        return handleHistoryCommand(interaction);
      }
      return handleAdminCommand(interaction);
    }

    // Button interactions
    if (interaction.isButton()) {
      const customId = interaction.customId;

      // Setup buttons
      if (customId.startsWith('setup_channel_')) {
        const channelKey = customId.replace('setup_channel_', '');
        return handleSetupChannelButton(interaction, channelKey);
      }

      if (customId === 'setup_finish') {
        return handleSetupFinish(interaction);
      }

      // Challenge buttons
      if (customId === 'challenge_start') {
        return handleChallengeStart(interaction);
      }

      if (customId === 'cooldown_remove') {
        return handleCooldownRemove(interaction);
      }

      if (customId === 'dm_notifications_toggle') {
        return handleDmNotificationsToggle(interaction);
      }

      if (customId.startsWith('challenge_accept_')) {
        const challengeId = parseInt(customId.split('_')[2]);
        return handleChallengeAccept(interaction, challengeId);
      }

      if (customId.startsWith('challenge_decline_')) {
        const challengeId = parseInt(customId.split('_')[2]);
        return handleChallengeDecline(interaction, challengeId);
      }

      // Score buttons
      if (customId.startsWith('score_submit_')) {
        const challengeId = parseInt(customId.split('_')[2]);
        return handleScoreSubmit(interaction, challengeId);
      }

      if (customId.startsWith('score_confirm_')) {
        const resultId = parseInt(customId.split('_')[2]);
        return handleScoreConfirm(interaction, resultId);
      }

      if (customId.startsWith('score_dispute_')) {
        const resultId = parseInt(customId.split('_')[2]);
        return handleScoreDispute(interaction, resultId);
      }

      // Prediction buttons
      if (customId.startsWith('predict_')) {
        const parts = customId.split('_');
        const challengeId = parseInt(parts[1]);
        const predictedWinnerId = parts[2];
        return handlePrediction(interaction, challengeId, predictedWinnerId);
      }

      // Correction buttons
      if (customId.startsWith('correction_request_')) {
        const challengeId = parseInt(customId.split('_')[2]);
        return handleCorrectionRequest(interaction, challengeId);
      }

      if (customId.startsWith('correction_approve_')) {
        const correctionId = parseInt(customId.split('_')[2]);
        return handleCorrectionApprove(interaction, correctionId);
      }

      if (customId.startsWith('correction_reject_')) {
        const correctionId = parseInt(customId.split('_')[2]);
        return handleCorrectionReject(interaction, correctionId);
      }

      // History navigation buttons
      if (customId.startsWith('history_prev_')) {
        const parts = customId.split('_');
        const targetUserId = parts[2];
        const currentPage = parseInt(parts[3]);
        return handleHistoryNavigation(interaction, targetUserId, currentPage, 'prev');
      }

      if (customId.startsWith('history_next_')) {
        const parts = customId.split('_');
        const targetUserId = parts[2];
        const currentPage = parseInt(parts[3]);
        return handleHistoryNavigation(interaction, targetUserId, currentPage, 'next');
      }

      // Admin panel buttons
      if (customId === 'admin_setrank') {
        return handleAdminSetRank(interaction);
      }

      if (customId === 'admin_removerank') {
        return handleAdminRemoveRank(interaction);
      }

      if (customId === 'admin_clearcooldown') {
        return handleAdminClearCooldown(interaction);
      }

      if (customId === 'admin_refresh') {
        return handleAdminRefresh(interaction);
      }

      if (customId === 'admin_forceresult') {
        return handleAdminForceResult(interaction);
      }

      if (customId === 'admin_viewpending') {
        return handleAdminViewPending(interaction);
      }

      if (customId === 'admin_cancelchallenge') {
        return handleAdminCancelChallenge(interaction);
      }

      if (customId === 'admin_setcooldown') {
        return handleAdminSetCooldown(interaction);
      }

      if (customId === 'admin_setresponsewindow') {
        return handleAdminSetResponseWindow(interaction);
      }

      // Dispute resolution buttons
      if (customId.startsWith('dispute_resolve_')) {
        const challengeId = parseInt(customId.split('_')[2]);
        return handleDisputeResolve(interaction, challengeId);
      }

      if (customId.startsWith('dispute_void_')) {
        const challengeId = parseInt(customId.split('_')[2]);
        return handleDisputeVoid(interaction, challengeId);
      }
    }

    // String select menu interactions
    if (interaction.isStringSelectMenu()) {
      const customId = interaction.customId;

      // Challenge select
      if (customId === 'challenge_select') {
        return handleChallengeSelect(interaction);
      }

      // Admin selects
      if (customId === 'admin_select_removerank') {
        return handleAdminSelectRemoveRank(interaction);
      }

      if (customId === 'admin_select_clearcooldown') {
        return handleAdminSelectClearCooldown(interaction);
      }

      if (customId === 'admin_select_forceresult_winner') {
        return handleAdminSelectForceResultWinner(interaction);
      }

      if (customId.startsWith('admin_select_forceresult_loser_')) {
        const winnerId = customId.split('_')[4];
        return handleAdminSelectForceResultLoser(interaction, winnerId);
      }

      if (customId === 'admin_select_cancelchallenge') {
        return handleAdminSelectCancelChallenge(interaction);
      }
    }

    // Channel select menu interactions (for setup)
    if (interaction.isChannelSelectMenu()) {
      const customId = interaction.customId;

      if (customId.startsWith('setup_select_')) {
        const channelKey = customId.replace('setup_select_', '');
        return handleSetupChannelSelect(interaction, channelKey);
      }
    }

    // User select menu interactions
    if (interaction.isUserSelectMenu()) {
      const customId = interaction.customId;

      if (customId === 'challenge_unranked_select') {
        return handleUnrankedUserSelect(interaction);
      }
    }

    // Modal submissions
    if (interaction.isModalSubmit()) {
      const customId = interaction.customId;

      // Score modal
      if (customId.startsWith('score_modal_')) {
        const challengeId = parseInt(customId.split('_')[2]);
        return handleScoreModal(interaction, challengeId);
      }

      // Admin modals
      if (customId === 'admin_modal_setrank' ||
          customId === 'admin_modal_setcooldown' ||
          customId === 'admin_modal_setresponsewindow') {
        return handleAdminModal(interaction);
      }

      // Force result final modal
      if (customId.startsWith('admin_modal_forceresult_final_')) {
        const parts = customId.split('_');
        const winnerId = parts[4];
        const loserId = parts[5];
        return handleAdminForceResultFinalModal(interaction, winnerId, loserId);
      }

      // Dispute resolution modal
      if (customId.startsWith('dispute_modal_')) {
        const challengeId = parseInt(customId.split('_')[2]);
        return handleDisputeModal(interaction, challengeId);
      }

      // Correction modal
      if (customId.startsWith('correction_modal_')) {
        const challengeId = parseInt(customId.split('_')[2]);
        return handleCorrectionModal(interaction, challengeId);
      }
    }

  } catch (error) {
    console.error('Error handling interaction:', error);

    const errorMessage = 'An error occurred. Please try again.';

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: errorMessage, ephemeral: true });
    } else {
      await interaction.reply({ content: errorMessage, ephemeral: true });
    }
  }
}
