# Autofill Vault

A Chrome extension that saves your info once (name, address, phone, LinkedIn,
card number, etc.) and lets you drag a chip onto any form field to fill it —
or click a field, then click a chip, as a simpler fallback.

## How it works

- **Extension popup** (click the toolbar icon): add/remove saved items. Mark
  anything sensitive (like a card number) as "Sensitive" — it gets encrypted
  with a master passcode you set, using AES-256 via the browser's built-in
  Web Crypto API. The passcode is never stored anywhere.
- **Floating panel** (bottom-right circle on every page): hover over the
  🔐 circle to open your saved chips, move away to close it (with a small
  grace delay so it doesn't flicker). On touch devices without hover, tap
  the circle to open/close instead. Drag a chip onto a field, or click into
  a field then click a chip. Sensitive items ask for your passcode before
  filling.
- All data lives in `chrome.storage.local` — nothing is sent to any server.

## Load it locally (developer mode)

1. Open Chrome and go to `chrome://extensions`
2. Turn on **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select this `autofill-vault` folder
5. Pin the extension (puzzle-piece icon → pin) so it's easy to reach

## Try it

1. Click the extension icon, add a couple of items (e.g. "Full Name" → your
   name; try one marked "Sensitive" too, and set a passcode when prompted)
2. Visit any page with a form (a Google Form, a signup page, etc.)
3. Click the blue 🔐 circle in the bottom-right corner
4. Drag a chip onto a field, or click the field then click a chip

## Notes / next steps if you want to publish this

- Chrome Web Store requires a one-time $5 developer registration fee
- Before publishing, write a short privacy policy (even a simple one) since
  the extension handles personal data — Chrome Web Store requires this for
  data-handling extensions
- Consider adding: auto-lock after inactivity, import/export of saved items,
  per-site autofill memory, matching field labels automatically
- The current encryption re-derives a key from your passcode every time you
  unlock an item — this is intentionally simple for the MVP. A future version
  could cache the derived key in memory for the session so you're not
  re-typing the passcode per field.
