(() => {
  'use strict';

  const { Core, Reddit } = globalThis.RedditToolbox;

  class RedditRemovalService {
    constructor(client, options = {}) {
      this.client = client;
      this.deleteUneditablePosts = options.deleteUneditablePosts === true;
      this.verifyOverwrite = true;
      this.verifyOwnership = true;
      this.verifyDeletion = true;
      this.replacementLength = Math.max(8, Math.min(128, Number(options.replacementLength) || 24));
      this.minimumSettleMs = Math.max(250, Number(options.minimumSettleMs) || 900);
      this.maximumSettleMs = Math.max(this.minimumSettleMs, Number(options.maximumSettleMs) || 1_500);
      this.verificationAttempts = Math.max(1, Math.min(5, Math.trunc(Number(options.verificationAttempts) || 3)));
      this.verificationDelayMs = Math.max(100, Number(options.verificationDelayMs) || 750);
      this.deletionVerificationAttempts = Math.max(2, Math.min(8, Number(options.deletionVerificationAttempts) || 6));
      this.sleep = options.sleep || Core.wait;
      this.random = options.random || Math.random;
      this.randomSource = options.randomSource || globalThis.crypto;
      this.expectedUsername = String(options.expectedUsername || '').trim();
      this.states = new Map();
    }

    report(context, phase, detail = {}) {
      context?.reportPhase?.(phase, detail);
    }

    stateFor(fullname) {
      if (!this.states.has(fullname)) {
        this.states.set(fullname, {
          ownershipVerified: false,
          replacement: '',
          editSent: false,
          edited: false,
          deleteSent: false,
          deleteAcknowledged: false,
          deleteAttempts: 0
        });
      }
      return this.states.get(fullname);
    }

    async verifyWithRetries(check) {
      for (let attempt = 1; attempt <= this.verificationAttempts; attempt += 1) {
        if (await check()) return true;
        if (attempt < this.verificationAttempts) {
          await this.sleep(this.verificationDelayMs * attempt);
        }
      }
      return false;
    }

    async ensureSession(context) {
      if (!this.expectedUsername) return;
      if (typeof this.client.assertSession !== 'function') {
        throw new Core.PauseRequiredError(
          'The Reddit adapter cannot revalidate the active account for this automated batch.',
          { code: 'SESSION_RECHECK_UNAVAILABLE' }
        );
      }
      this.report(context, 'checking-session');
      await this.client.assertSession(this.expectedUsername, true);
    }

    async ensureOwnership(item, state) {
      if (typeof this.client.inspectTarget === 'function') {
        const target = await this.client.inspectTarget(item.fullname);
        if (!target.available || !target.owned) throw new Core.ApiError('Ownership could not be verified.', { code: 'OWNERSHIP_NOT_VERIFIED' });
        if (target.editable !== (item.editable !== false)) throw new Core.ApiError('Live editability differs from the reviewed batch. Prepare a new review.', { code: 'EDITABILITY_CHANGED' });
        state.ownershipVerified = true;
        return;
      }
      if (typeof this.client.verifyOwnership !== 'function') {
        throw new Core.ApiError('The Reddit adapter cannot verify item ownership.', {
          code: 'OWNERSHIP_CHECK_UNAVAILABLE'
        });
      }
      if (!await this.client.verifyOwnership(item.fullname)) {
        throw new Core.ApiError('The item could not be verified as belonging to the signed-in account.', {
          code: 'OWNERSHIP_NOT_VERIFIED'
        });
      }
      state.ownershipVerified = true;
    }

    async verifyDeleted(item, state, context = {}, allowResend = true) {
      if (!this.verifyDeletion) return true;
      await this.ensureSession();
      if (typeof this.client.isDeleted !== 'function' && typeof this.client.getDeletionStatus !== 'function') {
        throw new Core.PauseRequiredError(
          'The delete request was sent, but this adapter cannot verify the result.',
          { code: 'DELETE_RESULT_UNVERIFIED' }
        );
      }
      let missingReads = 0;
      let presentReads = 0;
      let last;
      for (let attempt = 0; attempt < this.deletionVerificationAttempts; attempt += 1) {
        last = typeof this.client.getDeletionStatus === 'function'
          ? await this.client.getDeletionStatus(item.fullname)
          : { status: await this.client.isDeleted(item.fullname) ? 'deleted' : 'unknown' };
        missingReads = last.status === 'missing' ? missingReads + 1 : 0;
        presentReads = last.status === 'present' && last.owned ? presentReads + 1 : 0;
        // Live Reddit can preserve the moderation placeholder after an owner
        // deletes a comment. Require our accepted delete and prior ownership;
        // [removed] alone (or an active author) is never enough.
        const deletedRemovedComment = item.kind === 'comment'
          && last.authorDeleted === true && last.text?.trim().toLowerCase() === '[removed]'
          && state.deleteAcknowledged && state.ownershipVerified;
        if (last.status === 'deleted'
          || deletedRemovedComment
          || (missingReads >= 2 && state.deleteAcknowledged && state.ownershipVerified)) {
          state.completed = true;
          state.deletionEvidence = last.status === 'deleted' ? 'deleted-marker'
            : deletedRemovedComment ? 'accepted-and-author-deleted' : 'accepted-and-no-longer-returned';
          return true;
        }
        if (context.isStopRequested?.()) break;
        if (attempt + 1 < this.deletionVerificationAttempts) {
          this.report(context, 'verifying-deletion', { attempt: attempt + 1 });
          await this.sleep(Math.min(6_000, this.verificationDelayMs * (2 ** (attempt + 1))));
        }
      }

      // A successful response can be a no-op. Retry once only after repeated live
      // evidence of the same owned target; never resend an ambiguous request.
      if (allowResend && !context.isStopRequested?.() && state.deleteAcknowledged
        && state.deleteAttempts < 2 && presentReads >= 2
        && last.editable === (item.editable !== false)
        && (item.editable === false || last.text === state.replacement)) {
        await context.beforeMutation?.();
        await this.ensureSession(context);
        await this.ensureOwnership(item, state);
        if (item.editable !== false && !await this.client.verifyText(item.fullname, state.replacement)) {
          throw new Core.ApiError('The saved text changed. This item needs a new review.', { code: 'OVERWRITE_NOT_VERIFIED' });
        }
        this.report(context, 'retrying-delete');
        await this.sendDelete(item, state);
        return this.verifyDeleted(item, state, context, false);
      }
      throw new Core.ApiError('Deletion is not confirmed yet. Other items can continue; recheck this result when cleanup finishes.', { code: 'DELETE_RESULT_UNCERTAIN' });
    }

    async sendDelete(item, state) {
      state.deleteSent = true;
      state.deleteAcknowledged = false;
      state.deleteAttempts += 1;
      try {
        await this.client.delete(item.fullname);
        state.deleteAcknowledged = true;
      } catch (error) {
        if (!this.isAmbiguousMutationError(error)) {
          state.deleteSent = false;
          throw error;
        }
      }
    }

    isAmbiguousMutationError(error) {
      return ['NETWORK_ERROR', 'RESPONSE_LOST', 'INVALID_JSON', 'UNRECOGNIZED_RESPONSE', 'API_REDIRECT'].includes(error?.code)
        || Number(error?.status) >= 500
        || !(error instanceof Core.ToolboxError);
    }

    async remove(item, context = {}) {
      const prefix = item?.kind === 'comment' ? 't1' : item?.kind === 'post' ? 't3' : '';
      if (!prefix || !new RegExp(`^${prefix}_[a-z0-9]+$`).test(item.fullname)) {
        throw new Core.ApiError('The item does not have a valid exact content ID.', { code: 'INVALID_TARGET' });
      }
      const directDelete = item.kind === 'post' && item.editable === false;
      if (directDelete && !this.deleteUneditablePosts) {
        this.report(context, 'skipped', { reason: 'post-has-no-editable-body' });
        return {
          status: 'skipped',
          reason: 'post-has-no-editable-body',
          overwritten: false,
          deleted: false
        };
      }

      const state = this.stateFor(item.fullname);
      if (state.completed) return { status: 'skipped', reason: 'already-completed', deleted: true };
      if (state.deleteSent) {
        this.report(context, 'verifying-deletion');
        await this.verifyDeleted(item, state, context);
        this.report(context, 'complete');
        return {
          status: 'completed',
          reason: directDelete ? 'deleted-uneditable-post' : 'overwritten-and-deleted',
          overwritten: !directDelete,
          verified: directDelete ? false : this.verifyOverwrite,
          deleted: true
        };
      }

      await this.ensureSession(context);
      this.report(context, 'checking-ownership');
      await this.ensureOwnership(item, state);

      if (directDelete) {
        await context.beforeMutation?.();
        await this.ensureSession(context);
        await this.ensureOwnership(item, state);
        this.report(context, 'deleting-direct');
        await this.sendDelete(item, state);
        this.report(context, 'verifying-deletion');
        await this.verifyDeleted(item, state, context);
        this.report(context, 'complete');
        return {
          status: 'completed',
          reason: 'deleted-uneditable-post',
          overwritten: false,
          verified: false,
          deleted: true
        };
      }

      if (!state.replacement) {
        this.report(context, 'preparing-replacement');
        state.replacement = Core.randomLetterString(this.replacementLength, this.randomSource);
      }

      if (state.editSent && !state.edited) {
        this.report(context, 'verifying-overwrite');
        const alreadySaved = await this.verifyWithRetries(
          () => this.client.verifyText(item.fullname, state.replacement)
        );
        if (alreadySaved) state.edited = true;
        else throw new Core.PauseRequiredError('The previous overwrite remains uncertain. No edit or delete was repeated.', { code: 'OVERWRITE_RESULT_UNCERTAIN' });
      }

      if (!state.edited) {
        await context.beforeMutation?.();
        await this.ensureSession(context);
        await this.ensureOwnership(item, state);
        this.report(context, 'overwriting');
        state.editSent = true;
        try {
          await this.client.edit(item.fullname, state.replacement);
          state.edited = true;
        } catch (error) {
          if (!this.isAmbiguousMutationError(error)) {
            state.editSent = false;
            throw error;
          }
          this.report(context, 'verifying-overwrite');
          const saved = await this.verifyWithRetries(
            () => this.client.verifyText(item.fullname, state.replacement)
          );
          if (!saved) {
            throw new Core.PauseRequiredError('The overwrite may have been sent, but its saved text cannot be confirmed. No delete was sent.', { code: 'OVERWRITE_RESULT_UNCERTAIN' });
          }
          state.edited = true;
        }
      }

      const settleMs = Core.randomBetween(this.minimumSettleMs, this.maximumSettleMs, this.random);
      this.report(context, 'waiting-for-save', { delayMs: settleMs });
      await this.sleep(settleMs);

      if (this.verifyOverwrite) {
        this.report(context, 'verifying-overwrite');
        const verified = await this.verifyWithRetries(
          () => this.client.verifyText(item.fullname, state.replacement)
        );
        if (!verified) {
          throw new Core.PauseRequiredError('The overwrite could not be verified, so the item was not deleted.', {
            code: 'OVERWRITE_NOT_VERIFIED',
          });
        }
      }

      await context.beforeMutation?.();
      await this.ensureSession(context);
      await this.ensureOwnership(item, state);
      // A pause can last arbitrarily long; verify again at the deletion boundary.
      if (!await this.client.verifyText(item.fullname, state.replacement)) {
        throw new Core.PauseRequiredError('The saved replacement changed before deletion. No delete was sent.', { code: 'OVERWRITE_NOT_VERIFIED' });
      }
      this.report(context, 'deleting');
      await this.sendDelete(item, state);
      this.report(context, 'verifying-deletion');
      await this.verifyDeleted(item, state, context);
      this.report(context, 'complete');
      return {
        status: 'completed',
        reason: 'overwritten-and-deleted',
        overwritten: true,
        verified: this.verifyOverwrite,
        deleted: true
      };
    }
  }

  Reddit.RedditRemovalService = RedditRemovalService;
})();
