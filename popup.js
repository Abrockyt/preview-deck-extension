/* Opens the side panel and gets out of the way.
   chrome.sidePanel.open() requires a user gesture, which this click is. */
document.getElementById('open').addEventListener('click', async () => {
  try {
    const win = await chrome.windows.getCurrent();
    await chrome.sidePanel.open({ windowId: win.id });
    window.close();
  } catch (e) {
    /* Older Chrome builds lack sidePanel.open(); say so rather than
       failing silently on a dead button. */
    document.querySelector('.hint').textContent =
      'Could not open the side panel: ' + e.message + ' (needs Chrome 116+).';
  }
});
