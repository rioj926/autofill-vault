// crypto.js
// Lightweight AES-GCM encryption helper, used to protect sensitive fields
// (like card numbers) behind a master passcode. Non-sensitive fields
// (name, address, phone, etc.) are stored in plain local storage for speed.
//
// The passcode itself is NEVER stored. It's used to derive a key each
// session (kept only in memory), so encrypted fields become unreadable
// without re-entering the passcode.

const VaultCrypto = (() => {
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  async function deriveKey(passcode, saltBytes) {
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      enc.encode(passcode),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: saltBytes,
        iterations: 150000,
        hash: "SHA-256"
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  function toB64(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  }
  function fromB64(str) {
    return Uint8Array.from(atob(str), c => c.charCodeAt(0));
  }

  // Encrypts plaintext with a passcode. Returns a single string blob
  // containing salt + iv + ciphertext, all base64-joined with ':'.
  async function encrypt(plaintext, passcode) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(passcode, salt);
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      enc.encode(plaintext)
    );
    return [toB64(salt), toB64(iv), toB64(ciphertext)].join(":");
  }

  // Decrypts a blob produced by encrypt(). Throws if passcode is wrong.
  async function decrypt(blob, passcode) {
    const [saltB64, ivB64, dataB64] = blob.split(":");
    const salt = fromB64(saltB64);
    const iv = fromB64(ivB64);
    const key = await deriveKey(passcode, salt);
    const plainBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      fromB64(dataB64)
    );
    return dec.decode(plainBuf);
  }

  return { encrypt, decrypt };
})();
