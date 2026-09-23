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

  console.log("[Autofill Vault] content script BUILD v1.1.0 (smart suggest + movable icon) loaded on", location.href);

  let panelOpen = false;
  let lastFocusedField = null;
  let suggestedItemId = null;
  let items = [];
  let isDragging = false; // true while dragging a CHIP onto a field
  let closeTimer = null;

  const DEFAULT_POSITION = { right: 20, bottom: 20 };

  // ---- Smart field matching ----
  // A lightweight heuristic, not real parsing: we look at whatever
  // identifying text a field carries (name/id/placeholder/aria-label/
  // associated <label>/autocomplete) and compare it against each saved
  // item's label, expanding a few common synonyms so "tel" matches an
  // item called "Phone Number", etc. This only ever SUGGESTS a chip —
  // it still takes a click or drag to actually fill anything.
  const FIELD_SYNONYMS = {
    name: ["name", "fullname", "full", "yourname", "fname", "firstname", "lastname", "surname"],
    email: ["email", "mail"],
    phone: ["phone", "tel", "telephone", "mobile", "cell", "cellphone"],
    address: ["address", "addr", "street"],
    city: ["city", "town"],
    state: ["state", "province", "region"],
    zip: ["zip", "zipcode", "postal", "postcode"],
    country: ["country"],
    card: ["card", "cardnumber", "cc", "creditcard", "cardno"],
    cvv: ["cvv", "cvc", "securitycode", "csc"],
    expiry: ["expiry", "exp", "expdate", "expiration"],
    linkedin: ["linkedin"],
    website: ["website", "url", "site"],
    company: ["company", "organization", "employer"],
    username: ["username", "user", "login", "handle"]
  };

  function tokenize(str) {
    return (str || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter(Boolean);
  }

  function expandTokens(tokens) {
    const expanded = new Set(tokens);
    for (const token of tokens) {
      for (const [canonical, synonyms] of Object.entries(FIELD_SYNONYMS)) {
        if (synonyms.includes(token)) {
          expanded.add(canonical);
          synonyms.forEach(s => expanded.add(s));
        }
      }
    }
    return expanded;
  }

  function getFieldSignal(field) {
    const parts = [
      field.name,
      field.id,
      field.placeholder,
      field.getAttribute("aria-label"),
      field.autocomplete
    ];
    if (field.labels && field.labels.length) {
      parts.push(field.labels[0].textContent);
    } else if (field.id) {
      try {
        const lbl = document.querySelector(`label[for="${CSS.escape(field.id)}"]`);
        if (lbl) parts.push(lbl.textContent);
      } catch (e) {
        // Invalid selector from an unusual id — just skip label lookup.
      }
    }
    return parts.filter(Boolean).join(" ");
  }

  function computeSuggestion(field) {
    if (!field || items.length === 0) return null;
    const fieldTokens = expandTokens(tokenize(getFieldSignal(field)));
    if (fieldTokens.size === 0) return null;

    let best = null;
    let bestScore = 0;
    for (const item of items) {
      const itemTokens = expandTokens(tokenize(item.label));
      let score = 0;
      for (const t of itemTokens) {
        if (fieldTokens.has(t)) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }
    return bestScore > 0 ? best.id : null;
  }

  // Track the last text-like field the user focused, so click-to-fill works,
  // and compute a suggested chip for it.
  document.addEventListener(
    "focusin",
    e => {
      const el = e.target;
      if (isFillableField(el)) {
        lastFocusedField = el;
        suggestedItemId = computeSuggestion(el);
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

  // ---- UI ----

  async function init() {
    // Global on/off switch, set from the extension popup. Skip mounting
    // entirely if the user has turned the floating icon off.
    const { vaultIconEnabled = true } = await chrome.storage.local.get("vaultIconEnabled");
    if (!vaultIconEnabled) {
      console.log("[Autofill Vault] floating icon disabled in settings, not mounting");
      return;
    }

    const { vaultIconPosition = DEFAULT_POSITION } =
      await chrome.storage.local.get("vaultIconPosition");

    const root = document.createElement("div");
    root.id = "vault-root";
    // Inline styles as a fallback in case the page's own CSS somehow wins
    // the cascade against content.css (rare, but some sites are aggressive).
    root.style.cssText =
      `all:initial; position:fixed !important; z-index:2147483647 !important; ` +
      `right:${vaultIconPosition.right}px; bottom:${vaultIconPosition.bottom}px;`;

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
    toggle.title = "Autofill Vault — drag to move, right-click to hide on this page";
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
      renderChips(); // refresh ordering/suggestion each time it opens
      panel.classList.remove("vault-hidden");
    }

    function closePanel() {
      panelOpen = false;
      panel.classList.add("vault-hidden");
    }

    // Hover to open/close. A short delay on close avoids flicker if the
    // pointer briefly dips outside root's hit area.
    root.addEventListener("mouseenter", openPanel);
    root.addEventListener("mouseleave", () => {
      // Don't close mid-chip-drag — the pointer moving toward a form field
      // is expected to leave root's bounds.
      if (isDragging) return;
      closeTimer = setTimeout(closePanel, 150);
    });

    // Keep it open for touch/keyboard users who tap the toggle instead of
    // hovering (touch devices don't really have hover).
    toggle.addEventListener("click", () => {
      if (iconWasDragged) {
        // Suppress the click that fires right after a drag-to-move release.
        iconWasDragged = false;
        return;
      }
      if (panelOpen) closePanel();
      else openPanel();
    });

    // ---- Drag the icon itself to reposition it ----
    let dragState = null;
    let iconWasDragged = false;
    const DRAG_THRESHOLD = 4; // px of movement before it counts as a drag, not a click

    toggle.addEventListener("mousedown", e => {
      // Only left-click starts a reposition drag.
      if (e.button !== 0) return;
      const rect = root.getBoundingClientRect();
      dragState = {
        startX: e.clientX,
        startY: e.clientY,
        startRight: window.innerWidth - rect.right,
        startBottom: window.innerHeight - rect.bottom,
        moved: false
      };
      e.preventDefault();
    });

    document.addEventListener("mousemove", e => {
      if (!dragState) return;
      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;
      if (!dragState.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;

      dragState.moved = true;
      isDragging = true; // reuse this flag so hover-close logic pauses too

      let newRight = dragState.startRight - dx;
      let newBottom = dragState.startBottom - dy;
      // Keep the icon fully on-screen.
      newRight = Math.max(0, Math.min(newRight, window.innerWidth - 42));
      newBottom = Math.max(0, Math.min(newBottom, window.innerHeight - 42));

      root.style.right = newRight + "px";
      root.style.bottom = newBottom + "px";
    });

    document.addEventListener("mouseup", async () => {
      if (!dragState) return;
      if (dragState.moved) {
        iconWasDragged = true;
        const right = parseFloat(root.style.right) || 0;
        const bottom = parseFloat(root.style.bottom) || 0;
        await chrome.storage.local.set({ vaultIconPosition: { right, bottom } });
        console.log("[Autofill Vault] icon position saved", { right, bottom });
      }
      dragState = null;
      isDragging = false;
    });

    // ---- Right-click to hide the icon on this page (until next reload) ----
    toggle.addEventListener("contextmenu", e => {
      e.preventDefault();
      root.style.display = "none";
      console.log("[Autofill Vault] icon hidden for this page load");
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

      // Put the suggested item first, if any, so it's the easiest to grab.
      const ordered = suggestedItemId
        ? [...items].sort((a, b) =>
            a.id === suggestedItemId ? -1 : b.id === suggestedItemId ? 1 : 0
          )
        : items;

      ordered.forEach(item => {
        const isSuggested = item.id === suggestedItemId;
        const chip = document.createElement("div");
        chip.className = "vault-chip" + (isSuggested ? " vault-chip-suggested" : "");
        chip.draggable = true;
        chip.textContent = (isSuggested ? "★ " : "") + item.label + (item.sensitive ? " 🔒" : "");
        if (isSuggested) chip.title = "Suggested match for the field you're on";

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

    await loadItems();
    renderChips();

    chrome.storage.onChanged.addListener(changes => {
      if (changes.vaultItems) {
        items = changes.vaultItems.newValue || [];
        renderChips();
      }
    });
  }

  init();
})();
