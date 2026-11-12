// `npx tsx scripts/test-push.mts (.mts: kept out of the Node tsconfig, it imports Worker code)` — checks worker/push.ts against an independent receiver written with node:crypto:
//  1. RFC 8291 Appendix A test vector (fixed keys + salt → the exact published body)
//  2. round trip with a fresh "browser" key pair: encrypt in our code, decrypt like a browser would
//  3. VAPID JWT (ES256) verifies with the public key from .dev.vars
//  4. quiet hours across midnight
import fs from "node:fs";
import nodeCrypto from "node:crypto";
import { b64u, encryptPayload, inQuiet, sanitizeNotify, unb64u, vapidJwt } from "../worker/push";

let failed = 0;
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`); if (!cond) failed++; };
const hmac = (k: Buffer, d: Buffer) => nodeCrypto.createHmac("sha256", k).update(d).digest();

/** Browser side of RFC 8291 (independent implementation). */
function decrypt(body: Uint8Array, uaPrivate: nodeCrypto.ECDH, authSecret: Buffer): string {
  const b = Buffer.from(body);
  const salt = b.subarray(0, 16);
  const rs = b.readUInt32BE(16);
  const idlen = b[20];
  const asPublic = b.subarray(21, 21 + idlen);
  const ct = b.subarray(21 + idlen);
  if (rs < 18 || ct.length > rs) throw new Error("bad rs");
  const uaPublic = uaPrivate.getPublicKey();
  const ecdh = uaPrivate.computeSecret(asPublic);
  const prkKey = hmac(authSecret, ecdh);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: aes128gcm\0"), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: nonce\0"), Buffer.from([1])])).subarray(0, 12);
  const d = nodeCrypto.createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const pt = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  let end = pt.length - 1;
  while (end >= 0 && pt[end] === 0) end--; // padding
  if (pt[end] !== 2) throw new Error("missing last-record delimiter");
  return pt.subarray(0, end).toString("utf8");
}

// 1. RFC 8291 Appendix A
{
  const V = {
    plaintext: "When I grow up, I want to be a watermelon",
    auth: "BTBZMqHH6r4Tts7J_aSIgg",
    uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
    uaPrivate: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
    asPublic: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
    asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
    salt: "DGv6ra1nlYgDCS1FRnbzlw",
    body: "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
  };
  const asPub = unb64u(V.asPublic);
  const jwk = { kty: "EC", crv: "P-256", x: b64u(asPub.slice(1, 33)), y: b64u(asPub.slice(33)) };
  const privateKey = await crypto.subtle.importKey("jwk", { ...jwk, d: V.asPrivate }, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  const publicKey = await crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, true, []);
  const out = await encryptPayload(V.uaPublic, V.auth, new Uint8Array(Buffer.from(V.plaintext)), { salt: unb64u(V.salt), asKeys: { privateKey, publicKey } });
  ok(b64u(out) === V.body, "RFC 8291 Appendix A: body matches the published test vector byte for byte");
  const ua = nodeCrypto.createECDH("prime256v1");
  ua.setPrivateKey(Buffer.from(unb64u(V.uaPrivate)));
  ok(decrypt(out, ua, Buffer.from(unb64u(V.auth))) === V.plaintext, "RFC 8291 vector decrypts with the node:crypto receiver");
}

// 2. round trip with fresh keys and a realistic payload
{
  const ua = nodeCrypto.createECDH("prime256v1");
  ua.generateKeys();
  const auth = nodeCrypto.randomBytes(16);
  const payload = JSON.stringify({ title: "Omar", body: "Bench at 6? 💪 مرحبا", url: "#/chat/abc", tag: "chat-abc", kind: "message" });
  const out = await encryptPayload(b64u(ua.getPublicKey()), b64u(auth), new Uint8Array(Buffer.from(payload)));
  ok(decrypt(out, ua, auth) === payload, `round trip (fresh keys, UTF-8, ${out.length} bytes on the wire)`);
  const out2 = await encryptPayload(b64u(ua.getPublicKey()), b64u(auth), new Uint8Array(Buffer.from(payload)));
  ok(Buffer.compare(Buffer.from(out), Buffer.from(out2)) !== 0, "each push uses a fresh salt + ephemeral key");
}

// 3. VAPID JWT
{
  const vars = Object.fromEntries(fs.readFileSync(".dev.vars", "utf8").split(/\r?\n/).map((l) => l.match(/^(\w+)=(.*)$/)).filter(Boolean).map((m) => [m![1], m![2]]));
  if (!vars.VAPID_PUBLIC_KEY || !vars.VAPID_PRIVATE_KEY) console.log("SKIP  VAPID (no keys in .dev.vars)");
  else {
    const env = { VAPID_PUBLIC_KEY: vars.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: vars.VAPID_PRIVATE_KEY, VAPID_SUBJECT: vars.VAPID_SUBJECT } as never;
    const jwt = await vapidJwt(env, "https://fcm.googleapis.com");
    const [h, p, s] = jwt.split(".");
    const pub = unb64u(vars.VAPID_PUBLIC_KEY);
    const key = nodeCrypto.createPublicKey({ key: { kty: "EC", crv: "P-256", x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33)) }, format: "jwk" });
    const valid = nodeCrypto.verify("sha256", Buffer.from(`${h}.${p}`), { key, dsaEncoding: "ieee-p1363" }, Buffer.from(unb64u(s)));
    const claims = JSON.parse(Buffer.from(unb64u(p)).toString());
    ok(valid, "VAPID JWT signature verifies with VAPID_PUBLIC_KEY (ES256)");
    ok(claims.aud === "https://fcm.googleapis.com" && claims.exp - Date.now() / 1000 <= 86400 && /^(mailto:|https:)/.test(claims.sub), `VAPID claims ok (sub ${claims.sub}, exp in ${Math.round((claims.exp - Date.now() / 1000) / 3600)} h)`);
  }
}

// 4. quiet hours
{
  const p = sanitizeNotify({ quiet: { on: true, from: "22:00", to: "07:00" }, tz: "UTC" });
  ok(inQuiet(p, Date.UTC(2026, 0, 1, 23, 30)) && inQuiet(p, Date.UTC(2026, 0, 1, 6, 59)) && !inQuiet(p, Date.UTC(2026, 0, 1, 12, 0)), "quiet hours across midnight");
  ok(sanitizeNotify({ tz: "Not/AZone", chat: "yes" as never }).tz === "Africa/Cairo", "bad prefs fall back to defaults");
}

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log("\nall push tests passed");
