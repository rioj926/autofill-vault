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
  grace delay so it doesn't flicker). Drag the icon itself to reposition it
  anywhere on screen — your chosen spot is remembered across every site.
  Right-click the icon to hide it on the current page (resets on reload),
  or turn it off everywhere from the "Show floating icon" checkbox in the
  extension popup. On touch devices without hover, tap the circle to
  open/close instead. Drag a chip onto a field, or click into a field then
  click a chip. Sensitive items ask for your passcode before filling.
- **Smart suggestions**: when you click into a form field, Autofill Vault
  looks at the field's name, id, placeholder, label, and autocomplete
  attribute, and moves its best-guess matching chip to the top of the panel
  with a gold highlight and a ★. It's only ever a suggestion — nothing
  fills until you drag or click that chip yourself.
- **Import / Export**: back up all your saved items to a JSON file, or bring
  them into a new browser or computer, from the "Export" / "Import" buttons
  in the popup. Sensitive items stay encrypted in the exported file — you'll
  need the original passcode to unlock them again after importing.
- All data lives in `chrome.storage.local` — nothing is sent to any server.

## Load it locally (developer mode)

1. Open Chrome and go to `chrome://extensions`
2. Turn on **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select this `autofill-vault` folder
5. Pin the extension (puzzle-piece icon → pin) so it's easy to reach

## Try it

1. Click the extension icon, add a couple of items (e.g. "Full Name" → your
   name, "Phone Number" → a number; try one marked "Sensitive" too, and set
   a passcode when prompted)
2. Open `test.html` (included in this folder) for a page with fields
   deliberately named differently than the item labels, to see smart
   suggestion in action
3. Hover the blue 🔐 circle in the bottom-right corner
4. Drag a chip onto a field, or click the field then click a chip
5. Try the Export button in the popup, then Import the same file back in

## Notes / next steps if you want to publish updates

- Chrome Web Store updates just need a version bump in `manifest.json` and
  a fresh package upload — no new $5 fee, and no new host permissions here
  means it likely won't re-trigger the broad-permissions review flag
- Ideas for a future version: auto-lock sensitive items after inactivity,
  multiple named profiles (work vs. personal), and merging/deduping on
  import instead of always appending
- The current encryption re-derives a key from your passcode every time you
  unlock an item — this is intentionally simple for the MVP. A future version
  could cache the derived key in memory for the session so you're not
  re-typing the passcode per field.
