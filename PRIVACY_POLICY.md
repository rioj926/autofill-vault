# Privacy Policy — Autofill Vault

_Last updated: [DATE]_

## What this extension does

Autofill Vault lets you save personal information (such as your name,
address, phone number, email, LinkedIn profile, or payment card number) and
fill it into form fields on websites you visit, either by dragging a saved
item onto a field or by clicking a field and then clicking a saved item.

## What data we collect

**None.** Autofill Vault does not collect, transmit, sell, or share any of
your data with us or with any third party. There are no analytics, no
tracking scripts, and no external servers involved in how this extension
operates.

## Where your data is stored

Everything you save (labels and values) is stored using Chrome's built-in
`chrome.storage.local` API, directly on your own device, inside your own
browser profile. This data:

- Never leaves your device
- Is never sent to us, to the developer, or to any server
- Is only accessible to this extension, within your own browser

If you uninstall the extension, this locally stored data is removed by
Chrome along with it.

## Sensitive data encryption

Any item you mark as "Sensitive" (for example, a card number) is encrypted
on your device using AES-256-GCM (via the browser's built-in Web Crypto
API) before being stored. The passcode used to encrypt/decrypt this data is
never stored anywhere — not locally, not remotely — and exists only in your
browser's memory for the duration of your session.

## Permissions this extension requests, and why

- **storage** — to save your items locally on your device
- **activeTab / scripting** — to inject the floating panel and fill form
  fields on the page you're currently viewing
- **host permissions (all sites)** — so the floating panel and autofill
  functionality are available on any website you choose to use it on; the
  extension does not read, log, or transmit the content of the pages you
  visit

## Third parties

This extension does not integrate with, or send data to, any third-party
service, analytics platform, or advertising network.

## Changes to this policy

If this policy changes, the "Last updated" date above will be revised, and
material changes will be reflected in the extension's Chrome Web Store
listing.

## Contact

Questions about this policy can be directed to: [YOUR EMAIL]
