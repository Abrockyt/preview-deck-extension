/* browser.sidebarAction.open() must run inside a user-gesture handler —
   this click is that gesture. Firefox opens the sidebar itself; there is
   no windowId to pass, unlike Chrome's chrome.sidePanel.open(). */
document.getElementById('open').addEventListener('click', async () => {
  try {
    await browser.sidebarAction.open();
    window.close();
  } catch (e) {
    document.querySelector('.hint').textContent =
      'Could not open the sidebar: ' + e.message + ' (needs Firefox 115+).';
  }
});
