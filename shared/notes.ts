// Keyword topics for notes and journal, in English + Egyptian Arabic (people mix both in one sentence).
// Used to SUGGEST tags (you decide) and by worker/insights.ts to spot repeats across set notes.
// Arabic has no \b word boundaries in JS regex, so the Arabic stems are matched as plain substrings.

export type Topic = "pain" | "tight" | "count" | "cheat" | "sleep" | "food" | "win" | "struggle" | "life";

export const TOPICS: Record<Topic, RegExp> = {
  pain: /\b(pain|hurt|hurts|ache|aching|sharp|injur\w*|sore joint)\b|وجع|واجع|بيوجع|بتوجع|ألم|الم |اتعور|متعور|اصابه|إصابة|اصابة/i,
  tight: /\b(tight|stiff|tense|click\w*|pinch\w*)\b|مشدود|متشد|اتشد|متيبس|ناشف|بيطقطق|طقطقة/i,
  count: /forg[oe]t to count|lost count|lose count|count.{0,30}estimate|نسيت اعد|نسيت أعد|مش فاكر (العدد|كام)|تهت في العد/i,
  cheat: /\b(cheat\w*|swing\w*|momentum|partial|half reps?)\b|غش|مرجح|نص عد|بضهري|بظهري/i,
  sleep: /\b(slept|sleep|insomnia|tired|exhausted|nap)\b|نوم|نمت|منمتش|سهران|سهرت|أرق|ارق|تعبان|مرهق|هلكان/i,
  food: /\b(ate|eat|meal|protein|fasting|hungry|calories|carbs)\b|أكل|اكل|كلت|بروتين|صايم|صيام|فطار|غدا|عشا|جعان|سعرات/i,
  win: /\b(pr|record|stronger|easy|felt great|best)\b|رقم جديد|عديت|أحسن|احسن|أقوى|اقوى|سهل|حلو|ممتاز/i,
  struggle: /\b(hard|heavy|failed|fail|couldn'?t|weak|struggl\w*)\b|صعب|تقيل|مقدرتش|ماقدرتش|ضعيف|فشلت|مش قادر/i,
  life: /\b(work|stress\w*|exam\w*|travel\w*|busy|family|deadline)\b|شغل|امتحان|ضغط|سفر|مسافر|مشغول|العيلة|البيت|مشوار/i,
};

/** Journal tags a note probably fits — shown as suggestions, never applied silently. */
const TAG_OF: Partial<Record<Topic, string>> = { pain: "pain", tight: "pain", sleep: "sleep", food: "food", win: "win", struggle: "struggle", life: "life" };
export function suggestTags(text: string): string[] {
  const out = new Set<string>();
  (Object.keys(TOPICS) as Topic[]).forEach((k) => { if (TAG_OF[k] && TOPICS[k].test(text)) out.add(TAG_OF[k]!); });
  return [...out];
}

/** Does the text contain Arabic letters? (for fonts / direction hints) */
export const hasArabic = (s: string) => /[؀-ۿ]/.test(s);

/** Tags are stored comma-separated ("pain,sleep"); old rows hold one tag. */
export const parseTags = (s: string | null | undefined) => (s ? s.split(",").map((x) => x.trim()).filter(Boolean) : []);
export const joinTags = (a: string[]) => (a.length ? [...new Set(a)].join(",") : null);

/**
 * Tags a SET probably deserves, from its numbers vs the plan and from the note's words (Arabic or English).
 * Shown as dashed suggestions — never applied without a tap.
 */
export function suggestSetTags(x: { reps: number | null; rir: number | null; strict?: number | null; note: string | null; kind: string }, rx?: { reps?: number | [number, number] | null; rir?: number | [number, number] | null }): string[] {
  const out = new Set<string>();
  const bot = rx?.reps == null ? null : Array.isArray(rx.reps) ? rx.reps[0] : rx.reps;
  const top = rx?.reps == null ? null : Array.isArray(rx.reps) ? rx.reps[1] : rx.reps;
  const target = rx?.rir == null ? null : Array.isArray(rx.rir) ? rx.rir[0] : rx.rir;
  if (x.kind === "N" && x.reps != null) {
    if (bot != null && x.reps < bot - 1) out.add("too heavy");
    if (top != null && x.reps >= top + 3) out.add("too light");
  }
  if (x.rir != null && target != null) {
    if (x.rir <= 0 && target >= 1) out.add("hard");
    if (x.rir >= target + 2) out.add("easy");
  }
  if (x.strict === 0) out.add("partial range");
  const n = x.note ?? "";
  if (TOPICS.count.test(n)) out.add("lost count");
  if (TOPICS.cheat.test(n)) out.add("partial range");
  if (/grip|slip|قبض|ايدي|إيدي|بيزحلق/i.test(n)) out.add("grip failed");
  if (/strap/i.test(n)) out.add("used straps");
  if (/spot|لوحدي/i.test(n)) out.add("no spotter");
  if (/busy|taken|مشغول|زحمة/i.test(n)) out.add("equipment busy");
  if (/pump|بمب|منفوخ/i.test(n)) out.add("great pump");
  if (TOPICS.win.test(n)) out.add("felt strong");
  return [...out].filter((t) => !n.includes(t));
}
