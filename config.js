// Public relay configuration — contains NO secret. Data on the relay is AES-256-GCM encrypted;
// the key is derived on-device from the access code (PBKDF2-SHA256), which never leaves the phone.
window.BRIO_CFG = {
  topic: "brio-8721d792093be8abb201e306",
  salt: "ee8f4c4cbadce3ed02eb27c6c1b443c1",
  iter: 1000000,
  // primary: MQTT over WebSocket (retained + live push). "public"/"public" are the broker's published open-instance login, not ours.
  mqtt: { url: "wss://public.cloud.shiftr.io", user: "public", pw: "public" },
  // fallback: ntfy.sh snapshot every ~10 min (anonymous ntfy.sh allows only 250 msgs/day)
  ntfy: "https://ntfy.sh",
  staleAfter: 20,
  offlineAfter: 90
};
