// popup.js
// Handles adding/removing saved items. Actual drag-to-fill happens in the
// floating panel injected on the page (content.js) — dragging out of this
// popup window isn't reliable in Chrome (popup closes on blur).

const listEl = document.getElementById("items-list");
const statusEl = document.getElementById("status");
const passcodeSection = document.getElementById("passcode-section");
const sensitiveInput = document.getElementById("sensitive");

// Cached only in memory for the life of this popup (popup is recreated
// every time it's opened, so this never persists to disk).
let sessionPasscode = null;

function setStatus(msg, timeout = 2000) {
  statusEl.textContent = msg;
  if (timeout) setTimeout(() => (statusEl.textContent = ""), timeout);
}

async function getItems() {
  const { vaultItems = [] } = await chrome.storage.local.get("vaultItems");
  return vaultItems;
}

async function saveItems(items) {
  await chrome.storage.local.set({ vaultItems: items });
}

// Renders the passcode box. Driven by the "Sensitive" checkbox state (so
// it's available BEFORE you've ever saved a sensitive item — the earlier
// version only rendered this after a successful save, which meant there
// was nowhere to type a passcode the first time).
function renderPasscodeSection() {
  const needsPasscode = sensitiveInput.checked;

  if (!needsPasscode) {
    passcodeSection.classList.add("hidden");
    return;
  }

  passcodeSection.classList.remove("hidden");

  if (sessionPasscode) {
    passcodeSection.innerHTML = `
      <p class="hint">🔒 Master passcode set for this session.</p>
      <button id="change-passcode-btn" type="button">Change passcode</button>
    `;
    document.getElementById("change-passcode-btn").addEventListener("click", () => {
      sessionPasscode = null;
      renderPasscodeSection();
    });
  } else {
    passcodeSection.innerHTML = `
      <p class="hint">Set a master passcode to protect sensitive items. It's never stored — only kept in memory for this popup session.</p>
      <input type="password" id="passcode" placeholder="Master passcode" />
    `;
  }
}

sensitiveInput.addEventListener("change", renderPasscodeSection);

async function render() {
  const items = await getItems();
  listEl.innerHTML = "";

  items.forEach(item => {
    const row = document.createElement("div");
    row.className = "item";

    const info = document.createElement("div");
    info.className = "item-info";

    const label = document.createElement("div");
    label.className = "item-label";
    label.textContent = item.label;
    if (item.sensitive) {
      const badge = document.createElement("span");
      badge.className = "lock-badge";
      badge.textContent = "locked";
      label.appendChild(badge);
    }

    const value = document.createElement("div");
    value.className = "item-value";
    value.textContent = item.sensitive ? "•••• (encrypted)" : item.value;

    info.appendChild(label);
    info.appendChild(value);

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("click", async () => {
      const updated = (await getItems()).filter(i => i.id !== item.id);
      await saveItems(updated);
      render();
      setStatus("Removed");
    });

    row.appendChild(info);
    row.appendChild(removeBtn);
    listEl.appendChild(row);
  });
}

document.getElementById("add-btn").addEventListener("click", async () => {
  const labelInput = document.getElementById("label");
  const valueInput = document.getElementById("value");

  const label = labelInput.value.trim();
  const value = valueInput.value.trim();
  const sensitive = sensitiveInput.checked;

  if (!label || !value) {
    setStatus("Enter both a label and a value");
    return;
  }

  let storedValue = value;

  if (sensitive) {
    const liveInput = document.getElementById("passcode");
    const passcode = sessionPasscode || (liveInput ? liveInput.value : "");
    if (!passcode) {
      setStatus("Enter a master passcode above first");
      renderPasscodeSection();
      return;
    }
    storedValue = await VaultCrypto.encrypt(value, passcode);
    sessionPasscode = passcode; // cache for subsequent items this session
  }

  const items = await getItems();
  items.push({
    id: crypto.randomUUID(),
    label,
    value: storedValue,
    sensitive
  });
  await saveItems(items);

  labelInput.value = "";
  valueInput.value = "";
  sensitiveInput.checked = false;
  renderPasscodeSection();
  render();
  setStatus("Saved");
});

renderPasscodeSection();
render();

// ---- Floating icon on/off toggle ----
const iconEnabledInput = document.getElementById("icon-enabled");

(async () => {
  const { vaultIconEnabled = true } = await chrome.storage.local.get("vaultIconEnabled");
  iconEnabledInput.checked = vaultIconEnabled;
})();

iconEnabledInput.addEventListener("change", async () => {
  await chrome.storage.local.set({ vaultIconEnabled: iconEnabledInput.checked });
  setStatus("Saved — refresh open tabs for this to take effect");
});

// ---- Export / Import ----
// Export writes exactly what's in storage, including sensitive items'
// still-encrypted blobs — they stay useless without the original passcode,
// so it's safe to include them in a plain JSON file.
document.getElementById("export-btn").addEventListener("click", async () => {
  const items = await getItems();
  if (items.length === 0) {
    setStatus("Nothing to export yet");
    return;
  }

  const payload = {
    exportedFrom: "Autofill Vault",
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    items
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `autofill-vault-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setStatus(`Exported ${items.length} item(s)`);
});

const importFileInput = document.getElementById("import-file");

document.getElementById("import-btn").addEventListener("click", () => {
  importFileInput.click();
});

importFileInput.addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);

    if (!parsed || !Array.isArray(parsed.items)) {
      setStatus("That doesn't look like an Autofill Vault export file");
      return;
    }

    const existing = await getItems();
    const importCount = parsed.items.length;

    const proceed = confirm(
      `Import ${importCount} item(s)? They'll be added alongside your existing ` +
      `${existing.length} item(s) — duplicates aren't merged automatically, so check ` +
      `for repeats afterward. Sensitive items stay encrypted and need their ORIGINAL ` +
      `passcode to unlock (the one used when they were first saved).`
    );
    if (!proceed) {
      e.target.value = "";
      return;
    }

    // New random IDs, so an imported item can never collide with (or
    // silently overwrite) something already saved on this device.
    const newItems = parsed.items.map(item => ({
      id: crypto.randomUUID(),
      label: String(item.label || "Untitled"),
      value: String(item.value ?? ""),
      sensitive: Boolean(item.sensitive)
    }));

    await saveItems([...existing, ...newItems]);
    render();
    setStatus(`Imported ${newItems.length} item(s)`);
  } catch (err) {
    console.error("[Autofill Vault] import failed", err);
    setStatus("Couldn't read that file — is it a valid export?");
  } finally {
    e.target.value = ""; // allow re-selecting the same file later if needed
  }
});
