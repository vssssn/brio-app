'use strict';
/* Brio relay client: decrypts snapshots published by the box (AES-256-GCM, key = PBKDF2-SHA256(code)).
   Transport 1: minimal MQTT 3.1.1 over WebSocket (subscribe-only, QoS 0) -> retained message on connect + push every ~5 s.
   Transport 2: ntfy.sh poll (fallback snapshot, ~10 min old at worst). Nothing here is secret. */
const Relay = (() => {
  const C = window.BRIO_CFG, te = new TextEncoder(), td = new TextDecoder();
  let key = null, everOk = false, running = false, listening = false, onData = null, onWrongKey = null, onStatus = null;
  let ws = null, wsTimer = null, pingTimer = null, backoff = 1000, lastMqttMsg = 0, ntfyTimer = null, lastNtfyId = null;
  const hex = h => new Uint8Array(h.match(/../g).map(b => parseInt(b, 16)));
  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  async function deriveKey(code){
    const base = await crypto.subtle.importKey('raw', te.encode(code), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({name:'PBKDF2', hash:'SHA-256', salt: hex(C.salt), iterations: C.iter}, base, {name:'AES-GCM', length:256}, false, ['decrypt']);
  }
  async function gunzip(u8){
    const s = new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  // returns {kind, obj} | null (not ours) ; throws 'badkey' when a well-formed message fails authentication
  async function open(msg, k = key){
    const m = /^B1:([A-Z]):([A-Za-z0-9+/=]+)$/.exec((msg || '').trim()); if (!m) return null;
    let raw; try { raw = b64(m[2]); } catch(e){ return null; }
    if (raw.length < 12 + 16 + 10) return null;
    let pt;
    try { pt = await crypto.subtle.decrypt({name:'AES-GCM', iv: raw.slice(0,12), additionalData: te.encode('brio1:' + m[1])}, k, raw.slice(12)); }
    catch(e){ throw 'badkey'; }
    return { kind: m[1], obj: JSON.parse(td.decode(await gunzip(new Uint8Array(pt)))), raw: msg };
  }
  async function handle(msg, via){
    try {
      const r = await open(msg); if (!r) return;
      everOk = true; onData && onData(r.kind, r.obj, via, r.raw);
    } catch(e){
      if (e === 'badkey' && !everOk) onWrongKey && onWrongKey();   // after one success, ignore foreign junk on the public topic
    }
  }

  /* ---------- minimal MQTT 3.1.1 over WebSocket ---------- */
  const str = s => { const b = te.encode(s); return [b.length >> 8, b.length & 255, ...b]; };
  const remLen = n => { const o = []; do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; o.push(d); } while (n > 0); return o; };
  const pkt = (h, body) => new Uint8Array([h, ...remLen(body.length), ...body]);
  let buf = new Uint8Array(0);
  function parse(){
    for (;;){
      if (buf.length < 2) return;
      let mult = 1, len = 0, i = 1, d;
      do { if (i >= buf.length) return; d = buf[i++]; len += (d & 127) * mult; mult *= 128; } while (d & 128);
      if (buf.length < i + len) return;
      const h = buf[0], body = buf.slice(i, i + len); buf = buf.slice(i + len);
      const type = h >> 4;
      if (type === 2){ // CONNACK
        if (body[1] !== 0){ status('mqtt-refused'); ws && ws.close(); continue; }
        backoff = 1000; status('mqtt-up');
        const topics = ['live', 'hist'].map(k => C.topic + '/' + k);
        ws.send(pkt(0x82, [0, 1, ...topics.flatMap(t => [...str(t), 0])]));
      } else if (type === 3){ // PUBLISH
        const tl = (body[0] << 8) | body[1], qos = (h >> 1) & 3; let p = 2 + tl + (qos ? 2 : 0);
        if (qos === 1) ws.send(pkt(0x40, [body[2 + tl], body[3 + tl]]));
        lastMqttMsg = Date.now();
        handle(td.decode(body.slice(p)), 'mqtt');
      }
    }
  }
  function status(s){ onStatus && onStatus(s); }
  function mqttConnect(){
    clearTimeout(wsTimer); clearInterval(pingTimer);
    try { ws && ws.close(); } catch(e){}
    buf = new Uint8Array(0);
    try { ws = new WebSocket(C.mqtt.url, ['mqtt']); } catch(e){ return retry(); }
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      const flags = 0x80 | 0x40 | 0x02, id = 'brio-web-' + Math.random().toString(36).slice(2, 10);
      ws.send(pkt(0x10, [...str('MQTT'), 4, flags, 0, 30, ...str(id), ...str(C.mqtt.user), ...str(C.mqtt.pw)]));
      pingTimer = setInterval(() => { try { ws.send(new Uint8Array([0xC0, 0])); } catch(e){} }, 20000);
    };
    ws.onmessage = ev => { const u = new Uint8Array(ev.data); const n = new Uint8Array(buf.length + u.length); n.set(buf); n.set(u, buf.length); buf = n; parse(); };
    ws.onclose = () => { clearInterval(pingTimer); status('mqtt-down'); retry(); };
    ws.onerror = () => {};
  }
  function retry(){ if (!running) return; clearTimeout(wsTimer); wsTimer = setTimeout(mqttConnect, backoff); backoff = Math.min(backoff * 2, 30000); }

  /* ---------- ntfy fallback (poll) ---------- */
  async function ntfyPoll(){
    try {
      const since = lastNtfyId || 'latest';
      const r = await fetch(`${C.ntfy}/${C.topic}/json?poll=1&since=${encodeURIComponent(since)}`, {cache: 'no-store'});
      if (r.ok){
        const lines = (await r.text()).trim().split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch(e){ return null; } }).filter(x => x && x.event === 'message');
        if (lines.length){ const m = lines[lines.length - 1]; lastNtfyId = m.id; await handle(m.message, 'ntfy'); }
      }
    } catch(e){}
  }
  function ntfyLoop(){ if (!running) return; clearTimeout(ntfyTimer); const quiet = Date.now() - lastMqttMsg > 30000;
    if (quiet) ntfyPoll(); ntfyTimer = setTimeout(ntfyLoop, quiet ? 60000 : 30000); }

  return {
    deriveKey, open,
    async start(k, cb){ key = k; everOk = false; running = true; onData = cb.data; onWrongKey = cb.wrong; onStatus = cb.status; backoff = 1000;
      mqttConnect(); clearTimeout(ntfyTimer); ntfyTimer = setTimeout(ntfyLoop, 6000);
      if (listening) return; listening = true;
      document.addEventListener('visibilitychange', () => { if (running && !document.hidden && (!ws || ws.readyState > 1 || Date.now() - lastMqttMsg > 15000)) { backoff = 1000; mqttConnect(); } });
      window.addEventListener('online', () => { if (!running) return; backoff = 1000; mqttConnect(); });
    },
    stop(){ running = false; onData = onWrongKey = onStatus = null; clearTimeout(wsTimer); clearTimeout(ntfyTimer); clearInterval(pingTimer); try { ws && ws.close(); } catch(e){} ws = null; },
    pollNow: ntfyPoll,
  };
})();
