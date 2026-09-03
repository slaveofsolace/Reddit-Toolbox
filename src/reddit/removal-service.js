(() => {
  'use strict';

  const { Core, Reddit } = globalThis.RedditToolbox;

  class RedditRemovalService {
    constructor(client, options = {}) {
      this.client = client;
      this.deleteUneditablePosts = options.deleteUneditablePosts === true;
      this.verifyOverwrite = options.verifyOverwrite !== false;
      this.verifyOwnership = options.verifyOwnership !== false;
      this.verifyDeletion = options.verifyDeletion !== false;
      this.replacementLength = Math.max(8, Math.min(128, Number(options.replacementLength) || 24));
      this.minimumSettleMs = Math.max(250, Number(options.minimumSettleMs) || 900);
      this.maximumSettleMs = Math.max(this.minimumSettleMs, Number(options.maximumSettleMs) || 1_500);
      this.verificationAttempts = Math.max(1, Math.min(5, Math.trunc(Number(options.verificationAttempts) || 3)));
      this.verificationDelayMs = Math.max(100, Number(options.verificationDelayMs) || 750);
      this.sleep = options.sleep || Core.wait;
      this.random = options.random || Math.random;
      this.randomSource = options.randomSource || globalThis.crypto;
      this.states = new Map();
    }

    stateFor(fullname) {
      if (!this.states.has(fullname)) {
        this.states.set(fullname, {
          ownershipVerified: false,
          replacement: '',
          editSent: false,
          edited: false,
          deleteSent: false
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

    async ensureOwnership(item, state) {
      if (!this.verifyOwnership || state.ownershipVerified) return;
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

    async verifyDeleted(item, state) {
      if (!this.verifyDeletion) return true;
      if (typeof this.client.isDeleted !== 'function') {
        throw new Core.PauseRequiredError(
          'The delete request was sent, but this adapter cannot verify the result.',
          { code: 'DELETE_RESULT_UNVERIFIED' }
        );
      }
      const deleted = await this.verifyWithRetries(() => this.client.isDeleted(item.fullname));
      if (!deleted) {
        throw new Core.PauseRequiredError(
          'The delete request was sent, but Reddit has not confirmed the result. Inspect the item before resuming.',
          { code: 'DELETE_RESULT_UNCERTAIN' }
        );
      }
      this.states.delete(item.fullname);
      return true;
    }

    isAmbiguousMutationError(error) {
      return error?.code === 'NETWORK_ERROR' || (error?.retryable && Number(error?.status) >= 500);
    }

    async remove(item) {
      const directDelete = item.kind === 'post' && item.editable === false;
      if (directDelete && !this.deleteUneditablePosts) {
        return {
          status: 'skipped',
          reason: 'post-has-no-editable-body',
          overwritten: false,
          deleted: false
        };
      }

      const state = this.stateFor(item.fullname);
      if (state.deleteSent) {
        await this.verifyDeleted(item, state);
        return {
          status: 'completed',
          reason: directDelete ? 'deleted-uneditable-post' : 'overwritten-and-deleted',
          overwritten: !directDelete,
          verified: directDelete ? false : this.verifyOverwrite,
          deleted: true
        };
      }

      await this.ensureOwnership(item, state);

      if (directDelete) {
        state.deleteSent = true;
        try {
          await this.client.delete(item.fullname);
        } catch (error) {
          if (!this.isAmbiguousMutationError(error)) {
            state.deleteSent = false;
            throw error;
          }
        }
        await this.verifyDeleted(item, state);
        return {
          status: 'completed',
          reason: 'deleted-uneditable-post',
          overwritten: false,
          verified: false,
          deleted: true
        };
      }

      if (!state.replacement) {
        state.replacement = Core.randomLetterString(this.replacementLength, this.randomSource);
      }

      if (state.editSent && !state.edited) {
        const alreadySaved = await this.verifyWithRetries(
          () => this.client.verifyText(item.fullname, state.replacement)
        );
        if (alreadySaved) state.edited = true;
        else state.editSent = false;
      }

      if (!state.edited) {
        state.editSent = true;
        try {
          await this.client.edit(item.fullname, state.replacement);
          state.edited = true;
        } catch (error) {
          if (!this.isAmbiguousMutationError(error)) {
            state.editSent = false;
            throw error;
          }
          const saved = await this.verifyWithRetries(
            () => this.client.verifyText(item.fullname, state.replacement)
          );
          if (!saved) {
            state.editSent = false;
            throw error;
          }
          state.edited = true;
        }
      }

      const settleMs = Core.randomBetween(this.minimumSettleMs, this.maximumSettleMs, this.random);
      await this.sleep(settleMs);

      if (this.verifyOverwrite) {
        const verified = await this.verifyWithRetries(
          () => this.client.verifyText(item.fullname, state.replacement)
        );
        if (!verified) {
          throw new Core.ApiError('The overwrite could not be verified, so the item was not deleted.', {
            code: 'OVERWRITE_NOT_VERIFIED',
            retryable: true
          });
        }
      }

      state.deleteSent = true;
      try {
        await this.client.delete(item.fullname);
      } catch (error) {
        if (!this.isAmbiguousMutationError(error)) {
          state.deleteSent = false;
          throw error;
        }
      }
      await this.verifyDeleted(item, state);
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
