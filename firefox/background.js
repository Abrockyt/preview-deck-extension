/* ══════════════════════════════════════════════════════════════
   Preview Deck (Firefox build) — background script

   Firefox's WebExtensions API has no equivalent to Chrome's
   chrome.debugger / DevTools Protocol, so there is no way to emulate
   a device viewport or screenshot one from an extension. That is the
   entire reason this build exists separately from the Chrome/Edge
   one: it ships tagging, source-location capture and Markdown export,
   and drops "Capture all device sizes" rather than pretend to offer
   a feature the platform cannot support.

   What is left for this file to do is small: relay the arm/disarm
   request to the active tab, and relay tag events from the content
   script back up to the sidebar (content scripts cannot address the
   sidebar directly, same as they cannot address a Chrome side panel).
   ══════════════════════════════════════════════════════════════ */

browser.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || !msg.type) return;

  if (msg.type === 'PD_SET_TAGGING') {
    return (async () => {
      try {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        if (!tab) throw new Error('No active tab.');

        if (msg.armed) {
          /* Injected on demand only — nothing runs on any page until
             tagging is armed. */
          await browser.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js'],
          });
          await browser.tabs.sendMessage(tab.id, { type: 'PD_ARM', startAt: msg.startAt || 0 });
        } else {
          try {
            await browser.tabs.sendMessage(tab.id, { type: 'PD_DISARM' });
          } catch (e) { /* never injected, or already navigated away — fine */ }
        }
        return { ok: true, url: tab.url };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    })();
  }

  /* Content script → sidebar relay. */
  if (msg.type === 'PD_TAG' || msg.type === 'PD_DISARMED') {
    browser.runtime.sendMessage(msg).catch(() => {});
  }
});

browser.commands.onCommand.addListener((command) => {
  if (command === 'toggle-tagging') {
    browser.runtime.sendMessage({ type: 'PD_TOGGLE_TAGGING' }).catch(() => {});
  }
});
