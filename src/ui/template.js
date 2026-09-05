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
    continueOnFailure: true,
    maxConsecutiveFailures: 5
  });

  const staticMarkup = String.raw`
    <button class="launcher" type="button" title="Open Reddit Toolbox · drag to move" aria-label="Open Reddit Toolbox" aria-expanded="false" aria-controls="rt-panel">
      <span class="launcher-label">RT</span><span class="launcher-badge" hidden></span>
    </button>
    <aside class="panel" id="rt-panel" role="dialog" aria-label="Reddit Toolbox" aria-modal="false">
      <header class="header">
        <button class="icon-button move-window" type="button" aria-label="Move window" title="Drag to move. Arrow keys move; Shift moves farther.">⠿</button>
        <div class="brand"><strong>Reddit Toolbox</strong><span>Your Reddit history <small>RC7</small></span></div>
        <button class="icon-button reset-window" type="button" aria-label="Reset window layout" title="Reset size and position">↺</button>
        <button class="icon-button close" type="button" aria-label="Close">✕</button>
      </header>
      <div class="content">
        <div class="account-line"><span class="account-status" role="status">Uses your signed-in Reddit account</span><a class="canonical-link" href="https://www.reddit.com/" target="_blank" rel="noopener noreferrer">Open www.reddit.com</a></div>
        <div class="status-line request-status" role="status"></div>
        <section class="section scope-section">
          <div class="section-title"><h2>What would you like to delete?</h2></div>
          <div class="checks"><label class="check"><input id="include-comments" type="checkbox"> Comments</label><label class="check"><input id="include-posts" type="checkbox"> Posts</label></div>
          <div class="grid">
            <div class="field full"><label for="date-mode">Date range</label><select id="date-mode"><option value="all">All time</option><option value="before">Before a date</option><option value="after">After a date</option><option value="between">Between dates</option></select></div>
            <div class="field from-field"><label for="from-date">From</label><input id="from-date" type="date"></div>
            <div class="field through-field"><label for="through-date">Through</label><input id="through-date" type="date"></div>
            <div class="field"><label for="limit-mode">Limit</label><select id="limit-mode"><option value="all">No limit</option><option value="count">Set a limit</option></select><div class="field amount-field" hidden><label for="max-items">Number of items</label><input id="max-items" type="number" min="1" max="100000" step="1" inputmode="numeric" value="100"></div></div>
            <div class="field"><label for="sort-order">Order</label><select id="sort-order"><option value="oldest">Oldest first</option><option value="newest">Newest first</option></select></div>
          </div>
          <details class="advanced"><summary>More options</summary>
            <div class="grid">
              <div class="field full"><label for="keep-subreddits">Keep these subreddits</label><input id="keep-subreddits" type="text" placeholder="askscience, personalfinance"></div>
              <div class="field"><label for="keep-score">Keep score at or above</label><input id="keep-score" type="number" step="1" placeholder="No score filter"></div>
              <div class="field"><label for="text-includes">Only matching text</label><input id="text-includes" type="text" placeholder="Optional phrase"></div>
            </div>
            <label class="check"><input id="delete-uneditable" type="checkbox"> Also delete link and media posts</label>
            <p class="help">Link and media posts have no body to overwrite. Post titles stay unchanged. Speed adjusts automatically to Reddit’s limits.</p>
            <div class="actions utility-actions"><button class="button import" type="button">Import archive CSV</button><button class="button check-login" type="button">Check login</button><button class="button clear-history" type="button">Clear loaded history</button></div>
            <input class="file-input archive-input" type="file" accept=".csv,text/csv" multiple>
            <p class="help">Profile history can omit older items. Import comments.csv or posts.csv from your Reddit archive to include them.</p>
          </details>
          <button class="button primary scan" type="button">Find matching items</button>
          <div class="status-line scan-status" role="status">Review the matches before deleting.</div>
        </section>
        <section class="section preview-section" hidden>
          <div class="section-title"><h2>Review</h2><button class="button text-button export-backup" type="button" disabled>Save a copy</button></div>
          <div class="selection-summary"><span><strong class="selected-count">0</strong> selected</span><span><strong class="comment-count">0</strong> comments · <strong class="post-count">0</strong> posts</span><span class="found-total">from <strong class="found-count">0</strong> found</span></div>
          <div class="preview-caption help">No items loaded</div>
          <div class="preview"><div class="preview-empty">Find matching items to review them.</div></div>
          <div class="actions preview-navigation" hidden><button class="button preview-previous" type="button">Previous</button><span class="preview-page help" role="status"></span><button class="button preview-next" type="button">Next</button></div>
        </section>
        <details class="run-details" hidden><summary>Run details</summary>
          <div class="detail-metrics"><span><strong class="processed-count">0</strong> processed</span><span><strong class="remaining-count">0</strong> remaining</span><span><strong class="skipped-count">0</strong> skipped</span><span class="current-count">—</span><span class="elapsed-time">0s</span></div>
          <div class="log">No run activity.</div><button class="button export-log" type="button" disabled>Save run log</button>
        </details>
      </div>
      <footer class="run-section">
        <div class="batch-summary" hidden aria-live="polite"><span><strong class="deleted-count">0</strong> deleted</span><span><strong class="unconfirmed-count">0</strong> need recheck</span><span><strong class="failed-count">0</strong> failed</span></div>
        <div class="current-action" hidden></div><progress class="progress" value="0" max="1" aria-label="Cleanup progress" hidden></progress>
        <div class="status-line run-status" role="status">Find items to get started.</div>
        <p class="delete-note" hidden>Editable text is overwritten first. Deletion is permanent.</p>
        <div class="actions run-actions"><button class="button danger start" type="button" disabled>Delete selected items</button><button class="button pause" type="button" hidden>Pause</button><button class="button stop" type="button" title="Finish the current item, then stop" hidden>Stop</button><button class="button recheck" type="button" hidden>Recheck results</button><button class="button retry" type="button" hidden>Review retries</button></div>
      </footer>
      <button class="resize-handle resize-left" data-edge="left" type="button" aria-label="Resize window from left" title="Drag to resize. Arrow keys also resize.">◢</button>
      <button class="resize-handle resize-right" data-edge="right" type="button" aria-label="Resize window from right" title="Drag to resize. Arrow keys also resize.">◢</button>
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
