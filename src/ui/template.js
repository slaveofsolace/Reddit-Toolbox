(() => {
  'use strict';

  const { UI } = globalThis.RedditToolbox;

  const DEFAULT_SETTINGS = Object.freeze({
    includeComments: true,
    includePosts: true,
    dateMode: 'all',
    fromDate: '',
    throughDate: '',
    maxItems: 0,
    sortOrder: 'oldest',
    keepSubreddits: '',
    keepScoreAtOrAbove: '',
    textIncludes: '',
    deleteUneditablePosts: false,
    verifyOverwrite: true,
    replacementLength: 24,
    minimumDelaySeconds: 4.5,
    maximumDelaySeconds: 8.5,
    continueOnFailure: true,
    maxConsecutiveFailures: 5
  });

  const staticMarkup = String.raw`
    <button class="launcher" type="button" title="Open Reddit Toolbox" aria-label="Open Reddit Toolbox">
      <span class="launcher-label">RT</span>
      <span class="launcher-badge" hidden></span>
    </button>
    <aside class="panel" role="dialog" aria-label="Reddit Toolbox" aria-modal="false">
      <header class="header">
        <div class="brand">
          <strong>Reddit Toolbox</strong>
          <span>Automated history cleanup · RC2</span>
        </div>
        <button class="icon-button close" type="button" aria-label="Close">✕</button>
      </header>

      <div class="content">
        <section class="section">
          <div class="notice">
            One confirmation starts the entire selected batch. No per-item clicks are required. Keep this Reddit tab open; the batch continues while this panel is closed and pauses only when Reddit needs attention or you press Pause or Stop.
          </div>
        </section>

        <section class="section scope-section">
          <div class="section-title"><h2>1. Scope</h2><span>Choose what can be touched</span></div>
          <div class="checks">
            <label class="check"><input id="include-comments" type="checkbox"> Comments</label>
            <label class="check"><input id="include-posts" type="checkbox"> Posts</label>
          </div>

          <div class="grid">
            <div class="field full">
              <label for="date-mode">Time frame</label>
              <select id="date-mode">
                <option value="all">All available history</option>
                <option value="before">On or before a date</option>
                <option value="after">On or after a date</option>
                <option value="between">Between two dates</option>
              </select>
            </div>
            <div class="field from-field">
              <label for="from-date">From</label>
              <input id="from-date" type="date">
            </div>
            <div class="field through-field">
              <label for="through-date">Through</label>
              <input id="through-date" type="date">
            </div>
            <div class="field">
              <label for="max-items">Maximum items</label>
              <input id="max-items" type="number" min="0" max="100000" step="1" inputmode="numeric" placeholder="0 = all">
            </div>
            <div class="field">
              <label for="sort-order">Process order</label>
              <select id="sort-order">
                <option value="oldest">Oldest first</option>
                <option value="newest">Newest first</option>
              </select>
            </div>
            <div class="field full">
              <label for="keep-subreddits">Keep these subreddits</label>
              <input id="keep-subreddits" type="text" placeholder="askscience, personalfinance">
            </div>
            <div class="field">
              <label for="keep-score">Keep score at or above</label>
              <input id="keep-score" type="number" step="1" placeholder="Disabled">
            </div>
            <div class="field">
              <label for="text-includes">Only matching text</label>
              <input id="text-includes" type="text" placeholder="Optional phrase">
            </div>
          </div>

          <div class="checks">
            <label class="check" title="Link and media posts have no body to overwrite.">
              <input id="delete-uneditable" type="checkbox"> Delete link/media posts directly
            </label>
          </div>

          <div class="grid">
            <div class="field">
              <label for="replacement-length">Replacement letters</label>
              <input id="replacement-length" type="number" min="8" max="128" step="1">
            </div>
            <div class="field">
              <label for="minimum-delay">Delay range (seconds)</label>
              <div class="grid compact-grid">
                <input id="minimum-delay" type="number" min="1" max="300" step="0.5" aria-label="Minimum delay seconds">
                <input id="maximum-delay" type="number" min="1" max="300" step="0.5" aria-label="Maximum delay seconds">
              </div>
            </div>
          </div>

          <div class="automation-note">
            Reddit Toolbox automatically waits through rate limits, retries temporary failures, and continues past isolated item failures. Five consecutive failures pause the batch for review.
          </div>

          <div class="actions">
            <button class="button primary scan" type="button">Scan history</button>
            <button class="button import" type="button">Import archive CSV</button>
            <input class="file-input archive-input" type="file" accept=".csv,text/csv" multiple>
            <button class="button build-preview" type="button">Prepare batch</button>
          </div>
          <div class="status-line scan-status" role="status">For complete history, extract comments.csv and posts.csv from a Reddit data export.</div>
        </section>

        <section class="section preview-section">
          <div class="section-title"><h2>2. Review batch</h2><span class="preview-caption">No batch prepared</span></div>
          <div class="summary">
            <div class="metric"><strong class="found-count">0</strong><span>Found</span></div>
            <div class="metric"><strong class="selected-count">0</strong><span>Selected</span></div>
            <div class="metric"><strong class="comment-count">0</strong><span>Comments</span></div>
            <div class="metric"><strong class="post-count">0</strong><span>Posts</span></div>
          </div>
          <div class="preview"><div class="preview-empty">Scan or import data, then prepare a batch.</div></div>
          <div class="actions">
            <button class="button export-backup" type="button" disabled>Export selected content</button>
            <button class="button export-log" type="button" disabled>Export run log</button>
          </div>
        </section>

        <section class="section run-section">
          <div class="section-title"><h2>3. Automate</h2><span>One confirmation for the whole batch</span></div>
          <div class="confirm">
            <span>Type <code class="confirmation-phrase">DELETE 0 ITEMS</code> once to unlock the complete batch.</span>
            <input class="confirmation-input" type="text" autocomplete="off" spellcheck="false" aria-label="Deletion confirmation">
          </div>
          <div class="batch-summary" aria-live="polite">
            <div class="metric"><strong class="processed-count">0</strong><span>Processed</span></div>
            <div class="metric"><strong class="remaining-count">0</strong><span>Remaining</span></div>
            <div class="metric"><strong class="failed-count">0</strong><span>Failed</span></div>
            <div class="metric"><strong class="current-count">—</strong><span>Current</span></div>
          </div>
          <div class="current-action">Ready to run the selected batch automatically.</div>
          <progress class="progress" value="0" max="1"></progress>
          <div class="status-line run-status" role="status">Idle</div>
          <div class="actions run-actions">
            <button class="button danger start" type="button" disabled>Run entire batch</button>
            <button class="button pause" type="button" disabled>Pause batch</button>
            <button class="button stop" type="button" disabled>Stop after current item</button>
            <button class="button retry" type="button" disabled>Prepare retry batch</button>
          </div>
          <div class="log">No run activity.</div>
        </section>
      </div>
    </aside>
  `;

  function dateLabel(timestamp) {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  function safeFilenamePart(value) {
    return String(value || 'reddit').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'reddit';
  }

  function compactError(error) {
    return error?.message || String(error || 'Unknown error');
  }

  UI.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
  UI.staticMarkup = staticMarkup;
  UI.dateLabel = dateLabel;
  UI.safeFilenamePart = safeFilenamePart;
  UI.compactError = compactError;
})();
