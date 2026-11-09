// `npx tsx scripts/check-videos.ts` — checks every YouTube id still exists (oEmbed 200) and lists exercises without a video.
import { EXERCISES } from "../program/exercises";

const ids = Object.values(EXERCISES).flatMap((e) => (Array.isArray(e.yt) ? e.yt : e.yt ? [e.yt] : []).map((y) => [e.key, y] as const));
console.log("no video:", Object.values(EXERCISES).filter((e) => !e.yt).map((e) => e.key).join(" ") || "none");
let dead = 0;
for (const [k, y] of ids) {
  const r = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${y}&format=json`);
  if (!r.ok) { dead++; console.log("DEAD", k, y, r.status); }
}
console.log(`checked ${ids.length}, dead ${dead}`);
