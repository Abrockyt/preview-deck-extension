/* ══════════════════════════════════════════════════════════════
   Preview Deck — service worker

   Owns two things the side panel cannot:

   1. The chrome.debugger session. Debugger calls must come from a
      persistent extension context; a side panel can be torn down
      mid-flight and would strand an attached tab behind Chrome's
      "this tab is being debugged" banner.

   2. Message relay. Content scripts cannot address a side panel
      directly, so tag events land here and are re-broadcast.
   ══════════════════════════════════════════════════════════════ */

const DEBUGGER_VERSION = '1.3';

/** Tabs this extension currently has attached, so cleanup is exact. */
const attached = new Set();

/* ── Debugger lifecycle ─────────────────────────────────────── */

function sendCommand(tabId, method, params) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params || {}, (result) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(result);
    });
  });
}

function attach(tabId) {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach({ tabId }, DEBUGGER_VERSION, () => {
      const err = chrome.runtime.lastError;
      if (err) return reject(new Error(err.message));
      attached.add(tabId);
      resolve();
    });
  });
}

/** Always safe to call: never rejects, never double-detaches. */
function detach(tabId) {
  return new Promise((resolve) => {
    if (!attached.has(tabId)) return resolve();
    chrome.debugger.detach({ tabId }, () => {
      void chrome.runtime.lastError;      // swallow "not attached"
      attached.delete(tabId);
      resolve();
    });
  });
}

/**
 * Restore the tab to its own size and let go of it.
 * Clearing the override before detaching matters — detaching alone
 * leaves the emulated viewport in place until the page reloads.
 */
async function release(tabId) {
  if (!attached.has(tabId)) return;
  try { await sendCommand(tabId, 'Emulation.clearDeviceMetricsOverride'); } catch (e) {}
  await detach(tabId);
}

/* A tab that closes, navigates or reloads mid-capture must not keep the
   banner. These are the three ways that happens. */
chrome.tabs.onRemoved.addListener((tabId) => { attached.delete(tabId); });
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (attached.has(tabId) && (info.status === 'loading' || info.url)) release(tabId);
});
chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId != null) attached.delete(source.tabId);
});

/* ── Capture ────────────────────────────────────────────────── */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Wait for the page to actually finish painting at the new size.
 * A fixed delay alone is a guess; two rAFs resolve only after the
 * browser has committed a frame, so this returns when there is
 * genuinely something new on screen.
 */
async function settle(tabId, extraMs) {
  await sleep(extraMs);
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => new Promise((res) => {
        requestAnimationFrame(() => requestAnimationFrame(() => res(true)));
      }),
    });
  } catch (e) {
    /* Page may be mid-navigation; the delay above still applied. */
  }
}

/**
 * Screenshot the emulated viewport.
 *
 * Page.captureScreenshot is used rather than chrome.tabs.captureVisibleTab.
 * captureVisibleTab photographs the visible *window*, so an emulated
 * 1920×1080 viewport inside a smaller window comes back scaled down and
 * letterboxed — the images would not be at device size, which is the whole
 * point of the exercise. Page.captureScreenshot renders the emulated
 * viewport exactly, needs no extra permission (the debugger is already
 * attached), and returns clean base64.
 *
 * captureVisibleTab remains the fallback if the debugger command fails.
 */
async function shoot(tabId, windowId) {
  try {
    const res = await sendCommand(tabId, 'Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    if (res && res.data) return 'data:image/png;base64,' + res.data;
  } catch (e) {
    console.warn('[Preview Deck] Page.captureScreenshot failed, falling back:', e.message);
  }
  return await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
}

async function captureAll(tabId, windowId, devices, onProgress) {
  const results = [];
  await attach(tabId);
  try {
    await sendCommand(tabId, 'Page.enable');

    for (let i = 0; i < devices.length; i++) {
      const d = devices[i];
      onProgress({ index: i, label: d.label, status: 'capturing' });

      await sendCommand(tabId, 'Emulation.setDeviceMetricsOverride', {
        width: d.width,
        height: d.height,
        deviceScaleFactor: 1,
        mobile: d.width < 768,
        screenWidth: d.width,
        screenHeight: d.height,
      });

      /* First size needs longer: the layout is changing from the real
         window, and media queries/observers cascade. */
      await settle(tabId, i === 0 ? 420 : 260);

      const screenshot = await shoot(tabId, windowId);
      results.push({ label: d.label, width: d.width, height: d.height, screenshot });
      onProgress({ index: i, label: d.label, status: 'done' });
    }
  } finally {
    /* finally, not after the loop: a throw halfway through must still
       hand the tab back. */
    await release(tabId);
  }
  return results;
}

/** Chrome's attach errors are opaque; translate the ones users hit. */
function explain(message) {
  const m = String(message || '');
  if (/already attached|Another debugger/i.test(m)) {
    return 'This tab already has a debugger attached — close DevTools on it (or any other extension using the debugger) and try again.';
  }
  if (/Cannot access|chrome:\/\/|extension/i.test(m)) {
    return 'Chrome will not allow debugging this page. Open a http://localhost or http://127.0.0.1 tab.';
  }
  if (/No tab with given id|No target/i.test(m)) {
    return 'That tab is gone — switch to your dev server tab and try again.';
  }
  return m || 'Capture failed.';
}

/* ── Messages ───────────────────────────────────────────────── */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  /* Side panel → capture the active tab at every device size. */
  if (msg.type === 'PD_CAPTURE_ALL') {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) throw new Error('No active tab.');
        if (!/^https?:\/\/(localhost|127\.0\.0\.1)([:/]|$)/.test(tab.url || '')) {
          throw new Error('Preview Deck only runs on http://localhost or http://127.0.0.1.');
        }
        const results = await captureAll(tab.id, tab.windowId, msg.devices, (p) => {
          chrome.runtime.sendMessage({ type: 'PD_CAPTURE_PROGRESS', ...p }).catch(() => {});
        });
        sendResponse({ ok: true, results, url: tab.url });
      } catch (e) {
        sendResponse({ ok: false, error: explain(e.message) });
      }
    })();
    return true;                        // keep the worker alive for the await
  }

  /* Side panel → inject/arm or disarm the tagger. */
  if (msg.type === 'PD_SET_TAGGING') {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) throw new Error('No active tab.');

        if (msg.armed) {
          /* Injected on demand only — the extension has no content script
             on any page until this runs. */
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js'],
          });
          await chrome.tabs.sendMessage(tab.id, { type: 'PD_ARM', startAt: msg.startAt || 0 });
        } else {
          /* Disarming a tab that was never injected (or has since
             navigated) is a no-op, not an error worth showing. */
          try {
            await chrome.tabs.sendMessage(tab.id, { type: 'PD_DISARM' });
          } catch (e) { /* no listener there — already clean */ }
        }
        sendResponse({ ok: true, url: tab.url });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }

  /* Content script → side panel. Content scripts cannot reach the panel
     directly, so the worker re-broadcasts. */
  if (msg.type === 'PD_TAG' || msg.type === 'PD_DISARMED') {
    chrome.runtime.sendMessage(msg).catch(() => {});
    return;
  }
});

/* Keyboard shortcut mirrors the panel's Tag button. */
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-tagging') {
    chrome.runtime.sendMessage({ type: 'PD_TOGGLE_TAGGING' }).catch(() => {});
  }
});

/* Clicking the toolbar icon opens the popup (declared in the manifest);
   this only makes the panel available to open programmatically. */
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
});
