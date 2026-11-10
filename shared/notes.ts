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
