# Brio — iPhone web app (GitHub Pages)

Read-only dashboard for the Brio paper-trading bot, served as a static PWA at
`https://vssssn.github.io/brio-app/`.

**How data gets here.** The bot's box can't accept inbound connections, so it *pushes*: a small
publisher on the box builds a snapshot every 5 s, gzips it, encrypts it with **AES-256-GCM**
(key = PBKDF2-SHA256 of the access code, 1,000,000 iterations, salt in `config.js`) and publishes the
ciphertext to a public relay:

- **Primary:** MQTT over WebSocket (`wss://public.cloud.shiftr.io`), retained messages on
  `<topic>/live` (every 5 s) and `<topic>/hist` (every 60 s, equity history + token charts).
- **Fallback:** ntfy.sh, one snapshot every ~10 min (ntfy.sh anonymous limit is 250 messages/day).

The page decrypts in the browser with WebCrypto. The relay only ever sees ciphertext. **This repo holds
no secrets:** no access code, no keys, no wallet data. The topic name and salt in `config.js` are not
secret, and neither is the broker's `public`/`public` login, which shiftr.io publishes for its open instance.

## Install on iPhone
1. Open `https://vssssn.github.io/brio-app/` in **Safari**.
2. Enter the access code once (it's kept in this device's local storage; "Compte → Oublier le code" removes it).
3. Share → **Add to Home Screen**. It opens full-screen with the Brio icon.

Status pill under the header: green **Live** (< 20 s old), orange **En retard**, red **Données figées / Hors ligne**.

## Deploy
Settings → Pages → *Build and deployment* → Source: **GitHub Actions**. Every push to `main` runs
`.github/workflows/pages.yml`, which deploys the site.

Requires iOS 16.4+ (it uses `DecompressionStream`).
