(() => {
  'use strict';
  const { UI } = globalThis.RedditToolbox;
  const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);
  const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;

  function fitWindow(rect = {}, viewportWidth = 1024, viewportHeight = 768) {
    const maxWidth = Math.max(1, viewportWidth - 16);
    const maxHeight = Math.max(1, viewportHeight - 16);
    const width = clamp(finite(rect.width, 520), Math.min(320, maxWidth), maxWidth);
    const height = clamp(finite(rect.height, Math.min(740, viewportHeight - 100)), Math.min(360, maxHeight), maxHeight);
    return {
      width, height,
      left: clamp(finite(rect.left, viewportWidth - width - 20), 8, Math.max(8, viewportWidth - width - 8)),
      top: clamp(finite(rect.top, viewportHeight - height - 80), 8, Math.max(8, viewportHeight - height - 8))
    };
  }

  class ToolboxWindow {
    constructor(app) {
      this.app = app;
      this.panel = app.refs.panel;
      this.launcher = app.refs.launcher;
      this.layout = app.store.get('window-layout', {}) || {};
      this.launcherLayout = app.store.get('launcher-layout', {}) || {};
      this.drag = null;
      this.suppressLauncherClick = false;
      const root = app.shadow;
      const move = root.querySelector('.move-window');
      root.querySelector('.header').addEventListener('pointerdown', event => {
        if (!event.target.closest('button, a, input') || event.target.closest('.move-window')) this.begin(event, 'move');
      });
      for (const handle of root.querySelectorAll('.resize-handle')) {
        handle.addEventListener('pointerdown', event => this.begin(event, handle.dataset.edge));
        handle.addEventListener('keydown', event => this.keyboard(event, handle.dataset.edge));
      }
      move.addEventListener('keydown', event => this.keyboard(event, 'move'));
      this.launcher.addEventListener('pointerdown', event => this.begin(event, 'launcher'));
      this.launcher.addEventListener('click', event => {
        if (!this.suppressLauncherClick) return;
        this.suppressLauncherClick = false;
        event.preventDefault();
        event.stopImmediatePropagation();
      }, true);
      globalThis.addEventListener('pointermove', event => this.move(event));
      globalThis.addEventListener('pointerup', event => this.finish(event));
      globalThis.addEventListener('pointercancel', event => this.finish(event));
      globalThis.addEventListener('resize', () => this.apply());
      globalThis.visualViewport?.addEventListener('resize', () => this.apply());
      root.querySelector('.reset-window').addEventListener('click', () => this.reset());
      this.apply();
    }

    viewport() {
      return { width: globalThis.visualViewport?.width || innerWidth, height: globalThis.visualViewport?.height || innerHeight };
    }

    apply() {
      const viewport = this.viewport();
      const rect = fitWindow(this.layout, viewport.width, viewport.height);
      Object.assign(this.panel.style, Object.fromEntries(Object.entries(rect).map(([key, value]) => [key, value + 'px'])));
      this.panel.style.right = 'auto';
      this.panel.style.bottom = 'auto';
      const left = clamp(finite(this.launcherLayout.left, viewport.width - 68), 8, Math.max(8, viewport.width - 56));
      const top = clamp(finite(this.launcherLayout.top, viewport.height - 68), 8, Math.max(8, viewport.height - 56));
      Object.assign(this.launcher.style, { left: left + 'px', top: top + 'px', right: 'auto', bottom: 'auto' });
    }

    begin(event, mode) {
      if (event.button !== 0 || this.drag) return;
      if (mode !== 'launcher') event.preventDefault();
      const element = mode === 'launcher' ? this.launcher : this.panel;
      const rect = element.getBoundingClientRect();
      this.drag = { mode, id: event.pointerId, x: event.clientX, y: event.clientY, rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }, target: event.target, moved: false };
      event.target.setPointerCapture?.(event.pointerId);
      this.panel.classList.add('interacting');
    }

    move(event) {
      const drag = this.drag;
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) < 5 && !drag.moved) return;
      drag.moved = true;
      this.change(drag.rect, drag.mode, dx, dy);
    }

    change(rect, mode, dx, dy) {
      if (mode === 'launcher') this.launcherLayout = { left: rect.left + dx, top: rect.top + dy };
      else if (mode === 'move') this.layout = { ...rect, left: rect.left + dx, top: rect.top + dy };
      else {
        const viewport = this.viewport();
        const right = rect.left + rect.width;
        const left = mode === 'left' ? clamp(rect.left + dx, 8, right - Math.min(320, viewport.width - 16)) : rect.left;
        this.layout = { ...rect, left, width: mode === 'left' ? right - left : clamp(rect.width + dx, Math.min(320, viewport.width - 16), viewport.width - rect.left - 8), height: clamp(rect.height + dy, Math.min(360, viewport.height - 16), viewport.height - rect.top - 8) };
      }
      this.apply();
    }

    finish(event) {
      if (!this.drag || event.pointerId !== this.drag.id) return;
      if (this.drag.moved) {
        this.suppressLauncherClick = this.drag.mode === 'launcher' && event.type !== 'pointercancel';
        this.save();
      }
      if (this.drag.target.hasPointerCapture?.(event.pointerId)) this.drag.target.releasePointerCapture(event.pointerId);
      this.drag = null;
      this.panel.classList.remove('interacting');
    }

    keyboard(event, mode) {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const amount = event.shiftKey ? 50 : 10;
      const rect = this.panel.getBoundingClientRect();
      this.change({ left: rect.left, top: rect.top, width: rect.width, height: rect.height }, mode,
        event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0,
        event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0);
      this.save();
    }

    save() {
      const viewport = this.viewport();
      this.layout = fitWindow(this.layout, viewport.width, viewport.height);
      this.app.store.set('window-layout', this.layout);
      this.app.store.set('launcher-layout', this.launcherLayout);
    }

    reset() {
      this.layout = {};
      this.launcherLayout = {};
      this.app.store.remove('window-layout');
      this.app.store.remove('launcher-layout');
      this.apply();
    }
  }

  UI.fitWindow = fitWindow;
  UI.ToolboxWindow = ToolboxWindow;
})();
