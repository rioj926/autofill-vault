// background.js
chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get("vaultItems");
  if (!existing.vaultItems) {
    await chrome.storage.local.set({ vaultItems: [] });
  }
});
