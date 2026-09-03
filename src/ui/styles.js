(() => {
  'use strict';

  globalThis.RedditToolbox.UI.styles = String.raw`
    :host {
      --rt-accent: #ff4500;
      --rt-accent-hover: #e03d00;
      --rt-bg: #ffffff;
      --rt-bg-subtle: #f6f7f8;
      --rt-border: #d6d9dc;
      --rt-text: #1c1c1c;
      --rt-muted: #576f76;
      --rt-danger: #b42318;
      --rt-success: #067647;
      color: var(--rt-text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 14px;
      line-height: 1.45;
    }

    * { box-sizing: border-box; }
    button, input, select, textarea { font: inherit; }
    button { cursor: pointer; }
    button:disabled { cursor: not-allowed; opacity: .5; }

    .launcher {
      align-items: center;
      background: var(--rt-accent);
      border: 0;
      border-radius: 999px;
      bottom: 20px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, .22);
      color: white;
      display: flex;
      font-size: 13px;
      font-weight: 750;
      height: 48px;
      justify-content: center;
      letter-spacing: .02em;
      position: fixed;
      right: 20px;
      width: 48px;
      z-index: 2147483646;
    }

    .launcher:hover { background: var(--rt-accent-hover); }

    .panel {
      background: var(--rt-bg);
      border: 1px solid var(--rt-border);
      border-radius: 16px;
      bottom: 80px;
      box-shadow: 0 18px 60px rgba(0, 0, 0, .28);
      display: none;
      max-height: min(820px, calc(100vh - 110px));
      overflow: hidden;
      position: fixed;
      right: 20px;
      width: min(470px, calc(100vw - 24px));
      z-index: 2147483647;
    }

    .panel.open { display: flex; flex-direction: column; }

    .header {
      align-items: center;
      border-bottom: 1px solid var(--rt-border);
      display: flex;
      justify-content: space-between;
      padding: 15px 16px;
    }

    .brand { display: grid; gap: 1px; }
    .brand strong { font-size: 16px; }
    .brand span { color: var(--rt-muted); font-size: 12px; }

    .icon-button {
      align-items: center;
      background: transparent;
      border: 0;
      border-radius: 8px;
      color: var(--rt-muted);
      display: flex;
      height: 32px;
      justify-content: center;
      width: 32px;
    }

    .icon-button:hover { background: var(--rt-bg-subtle); color: var(--rt-text); }

    .content { overflow: auto; padding: 16px; }
    .section { display: grid; gap: 12px; margin-bottom: 20px; }
    .section:last-child { margin-bottom: 0; }
    .section-title { align-items: baseline; display: flex; justify-content: space-between; }
    .section-title h2 { font-size: 14px; margin: 0; }
    .section-title span { color: var(--rt-muted); font-size: 12px; }

    .notice {
      background: #fff4ed;
      border: 1px solid #ffd6ae;
      border-radius: 10px;
      color: #7a2e0e;
      font-size: 12px;
      padding: 10px 12px;
    }

    .grid { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .field { display: grid; gap: 5px; }
    .field.full { grid-column: 1 / -1; }
    .field label, .label { color: var(--rt-muted); font-size: 12px; font-weight: 650; }

    input[type="text"], input[type="number"], input[type="date"], select {
      background: var(--rt-bg);
      border: 1px solid var(--rt-border);
      border-radius: 8px;
      color: var(--rt-text);
      min-height: 38px;
      padding: 8px 10px;
      width: 100%;
    }

    input:focus, select:focus, button:focus-visible {
      outline: 3px solid color-mix(in srgb, var(--rt-accent) 28%, transparent);
      outline-offset: 1px;
    }

    .checks { display: flex; flex-wrap: wrap; gap: 12px 18px; }
    .check { align-items: center; display: inline-flex; gap: 7px; }
    .check input { accent-color: var(--rt-accent); height: 16px; width: 16px; }

    .actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .button {
      background: var(--rt-bg);
      border: 1px solid var(--rt-border);
      border-radius: 999px;
      color: var(--rt-text);
      font-weight: 700;
      min-height: 38px;
      padding: 8px 14px;
    }

    .button:hover:not(:disabled) { background: var(--rt-bg-subtle); }
    .button.primary { background: var(--rt-accent); border-color: var(--rt-accent); color: white; }
    .button.primary:hover:not(:disabled) { background: var(--rt-accent-hover); }
    .button.danger { background: var(--rt-danger); border-color: var(--rt-danger); color: white; }
    .button.link { border-color: transparent; padding-inline: 8px; }

    .file-input { display: none; }
    .status-line { color: var(--rt-muted); font-size: 12px; min-height: 18px; }
    .status-line.error { color: var(--rt-danger); }
    .status-line.success { color: var(--rt-success); }

    .summary { display: grid; gap: 8px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .metric { background: var(--rt-bg-subtle); border-radius: 9px; padding: 9px; }
    .metric strong { display: block; font-size: 16px; }
    .metric span { color: var(--rt-muted); font-size: 11px; }

    .preview {
      border: 1px solid var(--rt-border);
      border-radius: 10px;
      max-height: 230px;
      overflow: auto;
    }

    .preview-empty { color: var(--rt-muted); padding: 18px; text-align: center; }
    .item { border-bottom: 1px solid var(--rt-border); display: grid; gap: 3px; padding: 10px 11px; }
    .item:last-child { border-bottom: 0; }
    .item-head { align-items: center; display: flex; gap: 7px; }
    .kind { color: var(--rt-accent); font-size: 10px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .subreddit { font-weight: 700; }
    .date { color: var(--rt-muted); font-size: 11px; margin-left: auto; }
    .snippet { color: var(--rt-muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .item-status { color: var(--rt-muted); font-size: 11px; }
    .item-status.completed { color: var(--rt-success); }
    .item-status.failed { color: var(--rt-danger); }

    .confirm { background: var(--rt-bg-subtle); border-radius: 10px; display: grid; gap: 8px; padding: 12px; }
    .confirm code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; font-weight: 750; }
    .progress { appearance: none; background: var(--rt-bg-subtle); border: 0; border-radius: 999px; height: 7px; overflow: hidden; width: 100%; }
    .progress::-webkit-progress-bar { background: var(--rt-bg-subtle); }
    .progress::-webkit-progress-value { background: var(--rt-accent); }
    .progress::-moz-progress-bar { background: var(--rt-accent); }

    .log { background: var(--rt-bg-subtle); border-radius: 9px; color: var(--rt-muted); font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; max-height: 120px; overflow: auto; padding: 9px; white-space: pre-wrap; }
    .hidden { display: none !important; }

    @media (prefers-color-scheme: dark) {
      :host {
        --rt-bg: #17191a;
        --rt-bg-subtle: #242728;
        --rt-border: #3d4143;
        --rt-text: #f2f4f5;
        --rt-muted: #a8b3b8;
        --rt-danger: #f04438;
        --rt-success: #32d583;
      }
      .notice { background: #3a2219; border-color: #713b21; color: #ffd6ae; }
    }

    @media (max-width: 520px) {
      .panel { bottom: 72px; right: 12px; }
      .launcher { bottom: 14px; right: 14px; }
      .grid { grid-template-columns: 1fr; }
      .field.full { grid-column: auto; }
      .summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }

    @media (prefers-reduced-motion: reduce) {
      * { scroll-behavior: auto !important; }
    }
  `;
})();
