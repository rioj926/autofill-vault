// content.js
// Injects a small floating panel on every page. Chips can be dragged onto
// a form field, or clicked to fill whichever field was last focused.

(function () {
  // Guard against the content script somehow running twice on the same
  // page (e.g. during dev reload cycles) — a duplicate injection would
  // create a second overlapping panel, and clicks could land on a stale
  // instance's elements instead of the one you're looking at.
  if (window.__vaultInjected) {
    console.log("[Autofill Vault] already injected on this page, skipping duplicate init");
    return;
  }
  window.__vaultInjected = true;

  console.log("[Autofill Vault] content script BUILD v1.0.4 (hover mode) loaded on", location.href);

  let panelOpen = false;
  let lastFocusedField = null;
  let items = [];
  let isDragging = false;
  let closeTimer = null;

  // Track the last text-like field the user focused, so click-to-fill works.
  document.addEventListener(
    "focusin",
    e => {
      const el = e.target;
      if (isFillableField(el)) {
        lastFocusedField = el;
      }
    },
    true
  );

  function isFillableField(el) {
    if (!el) return false;
    const tag = el.tagName;
    if (tag === "TEXTAREA") return true;
    if (tag === "INPUT") {
      const type = (el.getAttribute("type") || "text").toLowerCase();
      return ["text", "email", "tel", "url", "search", "number", "password"].includes(type);
    }
    if (el.isContentEditable) return true;
    return false;
  }

  function fillField(el, text) {
    if (!el) return;
    if (el.isContentEditable) {
      el.textContent = text;
    } else {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      ).set;
      const taSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value"
      ).set;
      if (el.tagName === "TEXTAREA") {
        taSetter.call(el, text);
      } else {
        setter.call(el, text);
      }
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function resolveValue(item) {
    if (!item.sensitive) return item.value;
    const passcode = window.prompt(`Enter master passcode to unlock "${item.label}"`);
    if (!passcode) return null;
    try {
      return await VaultCrypto.decrypt(item.value, passcode);
    } catch (err) {
      alert("Wrong passcode, or this item can't be decrypted.");
      return null;
    }
  }

  async function loadItems() {
    const { vaultItems = [] } = await chrome.storage.local.get("vaultItems");
    items = vaultItems;
    console.log("[Autofill Vault] loaded", items.length, "saved item(s)");
  }

  chrome.storage.onChanged.addListener(changes => {
    if (changes.vaultItems) {
      items = changes.vaultItems.newValue || [];
      renderChips();
    }
  });

  // ---- UI ----

  const root = document.createElement("div");
  root.id = "vault-root";
  // Inline styles as a fallback in case the page's own CSS somehow wins
  // the cascade against content.css (rare, but some sites are aggressive).
  root.style.cssText =
    "all:initial; position:fixed !important; bottom:20px !important; " +
    "right:20px !important; z-index:2147483647 !important;";

  function mountRoot() {
    (document.body || document.documentElement).appendChild(root);
    console.log("[Autofill Vault] panel mounted");
  }
  if (document.body) {
    mountRoot();
  } else {
    document.addEventListener("DOMContentLoaded", mountRoot, { once: true });
  }

  const toggle = document.createElement("button");
  toggle.id = "vault-toggle";
  toggle.textContent = "🔐";
  toggle.title = "Autofill Vault";
  root.appendChild(toggle);

  const panel = document.createElement("div");
  panel.id = "vault-panel";
  panel.className = "vault-hidden";
  panel.innerHTML = `
    <div id="vault-panel-header">
      <span>Autofill Vault</span>
    </div>
    <div id="vault-chip-list"></div>
    <div id="vault-empty" class="vault-hidden">No saved items yet. Add some from the extension popup.</div>
  `;
  root.appendChild(panel);

  function openPanel() {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    panelOpen = true;
    panel.classList.remove("vault-hidden");
  }

  function closePanel() {
    panelOpen = false;
    panel.classList.add("vault-hidden");
  }

  // Hover to open/close. A short delay on close avoids flicker if the
  // pointer briefly dips outside root's hit area (e.g. crossing the small
  // gap between the toggle circle and the panel above it).
  root.addEventListener("mouseenter", openPanel);
  root.addEventListener("mouseleave", () => {
    // Don't close mid-drag — the pointer moving toward a form field to
    // drop a chip is expected to leave root's bounds, and closing the
    // panel out from under an in-progress drag would cancel it.
    if (isDragging) return;
    closeTimer = setTimeout(closePanel, 150);
  });

  // Keep it open for touch/keyboard users who tap the toggle instead of
  // hovering (touch devices don't really have hover).
  toggle.addEventListener("click", () => {
    if (panelOpen) closePanel();
    else openPanel();
  });

  function renderChips() {
    const list = panel.querySelector("#vault-chip-list");
    const empty = panel.querySelector("#vault-empty");
    list.innerHTML = "";

    if (items.length === 0) {
      empty.classList.remove("vault-hidden");
      return;
    }
    empty.classList.add("vault-hidden");

    items.forEach(item => {
      const chip = document.createElement("div");
      chip.className = "vault-chip";
      chip.draggable = true;
      chip.textContent = item.label + (item.sensitive ? " 🔒" : "");

      chip.addEventListener("dragstart", e => {
        console.log("[Autofill Vault] dragstart", item.label);
        isDragging = true;
        e.dataTransfer.effectAllowed = "copy";
        e.dataTransfer.setData("text/vault-item-id", item.id);
        // Some sites/browsers are picky about custom MIME types on drop
        // targets they don't control, so also set plain text as a fallback.
        e.dataTransfer.setData("text/plain", "");
      });

      chip.addEventListener("dragend", () => {
        isDragging = false;
        // The drag is over — if the pointer ended up outside root, close
        // the panel now rather than waiting for a mouseleave that may
        // already have been skipped while isDragging was true.
        if (!root.matches(":hover")) closePanel();
      });

      // Click-to-fill: fills whichever field was last focused.
      chip.addEventListener("click", async () => {
        if (!lastFocusedField) {
          alert("Click into a form field first, then click a chip to fill it.");
          return;
        }
        const value = await resolveValue(item);
        if (value !== null) fillField(lastFocusedField, value);
      });

      list.appendChild(chip);
    });
  }

  // ---- Drop handling on the whole document ----
  document.addEventListener("dragover", e => {
    if (isFillableField(e.target)) {
      e.preventDefault();
      e.target.classList.add("vault-drop-target");
    }
  });

  document.addEventListener("dragleave", e => {
    if (isFillableField(e.target)) {
      e.target.classList.remove("vault-drop-target");
    }
  });

  document.addEventListener("drop", async e => {
    const id = e.dataTransfer.getData("text/vault-item-id");
    console.log("[Autofill Vault] drop on", e.target.tagName, "id:", id);
    if (!id || !isFillableField(e.target)) return;
    e.preventDefault();
    e.target.classList.remove("vault-drop-target");

    const item = items.find(i => i.id === id);
    if (!item) return;
    const value = await resolveValue(item);
    if (value !== null) fillField(e.target, value);
  });

  loadItems().then(renderChips);
})();
