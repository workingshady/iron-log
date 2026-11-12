// Curated emoji set (~400) for the picker: categories, names for search, recents. Each entry = "<emoji> <names…>".

const RAW: { id: string; label: string; icon: string; list: string }[] = [
  {
    id: "gym", label: "Gym", icon: "💪",
    list: "💪 flexed biceps muscle strong arm|🏋️ weight lifter gym lift|🏋️‍♀️ woman lifting weights|🏋️‍♂️ man lifting weights|🤸 cartwheel gymnastics|🧘 yoga stretch|🏃 running run cardio|🏃‍♀️ woman running|🚴 cycling bike|🏊 swimming swim|🤼 wrestling wrestlers|🥊 boxing glove|🥋 martial arts|⛹️ basketball player|⚽ football soccer|🏀 basketball|🎾 tennis|🏐 volleyball|🥇 gold medal first|🥈 silver medal second|🥉 bronze medal third|🏆 trophy win champion|🏅 medal sports|🎯 target goal bullseye|⏱️ stopwatch timer rest|⏰ alarm clock|🔥 fire lit streak hot|⚡ lightning energy zap|💯 hundred perfect|🦵 leg day legs|🦶 foot|🦾 mechanical arm robot strong|🫀 heart anatomical cardio|🫁 lungs breath|🧠 brain|🦴 bone|💊 pill supplement|🥤 shake protein drink|🥛 milk|🍗 chicken protein|🥚 egg protein|🍳 eggs breakfast|🥩 steak meat|🍚 rice carbs|🍌 banana|🥑 avocado|🥦 broccoli|💧 water drop hydrate|😴 sleeping rest|🛌 bed sleep|📈 chart up progress|📉 chart down|📅 calendar|📝 notes log|✅ check done|❌ cross no|➕ plus add|🔁 repeat reps|🚀 rocket gains|🐐 goat greatest|🦍 gorilla beast|🦁 lion|🐂 bull strong|🐺 wolf|👟 sneaker shoe|🩳 shorts|🎽 running shirt|🧴 lotion|🩹 bandage injury|🧊 ice cube recovery|🌡️ thermometer|⚖️ scale weight",
  },
  {
    id: "smileys", label: "Smileys", icon: "😀",
    list: "😀 grinning smile happy|😃 smiley happy|😄 smile happy|😁 grin beaming|😆 laughing|😅 sweat smile relief|🤣 rofl rolling laughing|😂 joy tears laughing lol|🙂 slightly smiling|🙃 upside down|😉 wink|😊 blush smile|😇 innocent halo|🥰 smiling hearts love|😍 heart eyes love|🤩 star struck wow|😘 kiss blow|😗 kissing|😋 yum tasty|😛 tongue|😜 wink tongue crazy|🤪 zany crazy|😝 squinting tongue|🤑 money mouth|🤗 hug|🤭 hand over mouth oops|🤫 shush quiet|🤔 thinking hmm|🤐 zipper mouth|🤨 raised eyebrow|😐 neutral|😑 expressionless|😶 no mouth|😏 smirk|😒 unamused|🙄 eye roll|😬 grimace|😮‍💨 exhale relief|🤥 lying|😌 relieved|😔 pensive sad|😪 sleepy|🤤 drooling|😴 sleeping|😷 mask sick|🤒 thermometer sick|🤕 bandage hurt|🤢 nauseated|🤮 vomit|🥵 hot sweat|🥶 cold freezing|🥴 woozy dizzy|😵 dizzy knocked out|🤯 mind blown exploding|🤠 cowboy|🥳 party celebrate|😎 cool sunglasses|🤓 nerd|🧐 monocle|😕 confused|😟 worried|🙁 frown|😮 open mouth wow|😯 hushed|😲 astonished|😳 flushed|🥺 pleading puppy eyes|😦 frowning|😧 anguished|😨 fearful|😰 anxious sweat|😥 sad relieved|😢 cry tear|😭 sob crying loud|😱 scream fear|😖 confounded|😣 persevere|😞 disappointed|😓 downcast sweat|😩 weary|😫 tired|🥱 yawn bored|😤 triumph huff steam|😡 angry pout|😠 angry|🤬 cursing|😈 devil smiling|👿 imp|💀 skull dead|☠️ skull crossbones|💩 poop|🤡 clown|👻 ghost|👽 alien|🤖 robot|😺 cat smile|😹 cat joy|😻 cat heart eyes|🙈 see no evil monkey|🙉 hear no evil|🙊 speak no evil",
  },
  {
    id: "people", label: "Hands", icon: "👍",
    list: "👋 wave hello bye|🤚 raised back of hand|✋ raised hand stop high five|🖐️ hand splayed|👌 ok perfect|🤌 pinched fingers italian|🤏 pinching small|✌️ victory peace|🤞 crossed fingers luck|🫰 hand with index finger and thumb crossed|🤟 love you gesture|🤘 rock on horns|🤙 call me shaka|👈 point left|👉 point right|👆 point up|👇 point down|☝️ index up|👍 thumbs up like yes|👎 thumbs down dislike no|✊ raised fist|👊 fist bump punch|🤛 left fist bump|🤜 right fist bump|👏 clap applause|🙌 raising hands celebrate|🫶 heart hands|👐 open hands|🤲 palms up together dua|🤝 handshake deal|🙏 pray please thanks|✍️ writing|💅 nail polish|🤳 selfie|👀 eyes look|👁️ eye|👅 tongue|👄 mouth|🫦 biting lip|👶 baby|🧒 child|👦 boy|👧 girl|🧑 person|👨 man|👩 woman|🧔 beard man|👴 old man|👵 old woman|🙋 raising hand|🙆 ok gesture|🙅 no gesture|🤷 shrug|🤦 facepalm|🙇 bow|💁 tipping hand|🧏 deaf person|🕺 dancing man|💃 dancing woman|👯 bunny dancers|🚶 walking|🧍 standing|🧎 kneeling|👫 couple|👬 two men|👭 two women|👪 family",
  },
  {
    id: "hearts", label: "Hearts", icon: "❤️",
    list: "❤️ red heart love|🧡 orange heart|💛 yellow heart|💚 green heart|💙 blue heart|💜 purple heart|🖤 black heart|🤍 white heart|🤎 brown heart|💔 broken heart|❤️‍🔥 heart on fire|❣️ heart exclamation|💕 two hearts|💞 revolving hearts|💓 beating heart|💗 growing heart|💖 sparkling heart|💘 heart arrow cupid|💝 heart ribbon gift|💟 heart decoration|💌 love letter|💋 kiss mark|💯 hundred|💢 anger|💥 boom collision|💫 dizzy star|💦 sweat droplets|💨 dash wind fast|🕳️ hole|💬 speech bubble|🗨️ left speech|💭 thought bubble|💤 zzz sleep|✨ sparkles|⭐ star|🌟 glowing star|🎉 party popper tada celebrate|🎊 confetti|🎈 balloon|🎁 gift present|🎂 birthday cake|🎀 ribbon|🪅 pinata|🔔 bell|📣 megaphone|📢 loudspeaker|🔕 muted bell",
  },
  {
    id: "nature", label: "Nature", icon: "🌿",
    list: "🐶 dog|🐱 cat|🐭 mouse|🐹 hamster|🐰 rabbit bunny|🦊 fox|🐻 bear|🐼 panda|🐨 koala|🐯 tiger|🦁 lion|🐮 cow|🐷 pig|🐸 frog|🐵 monkey|🐔 chicken|🐧 penguin|🐦 bird|🦅 eagle|🦉 owl|🦄 unicorn|🐝 bee|🦋 butterfly|🐢 turtle slow|🐍 snake|🐙 octopus|🐬 dolphin|🐳 whale|🦈 shark|🐘 elephant|🦒 giraffe|🐎 horse|🐪 camel|🌵 cactus|🌴 palm tree|🌲 evergreen tree|🌳 tree|🌿 herb|🍀 four leaf clover luck|🍁 maple leaf|🌸 cherry blossom|🌹 rose|🌻 sunflower|🌷 tulip|🌞 sun face|☀️ sun sunny|🌤️ sun cloud|⛅ partly cloudy|🌧️ rain|⛈️ storm|❄️ snowflake cold|🌈 rainbow|🌙 moon night|⭐ star|🌍 earth globe|🌊 wave sea|🔥 fire|💧 droplet",
  },
  {
    id: "food", label: "Food", icon: "🍔",
    list: "🍏 green apple|🍎 apple|🍐 pear|🍊 orange|🍋 lemon|🍌 banana|🍉 watermelon|🍇 grapes|🍓 strawberry|🫐 blueberries|🍒 cherries|🍑 peach|🥭 mango|🍍 pineapple|🥥 coconut|🥝 kiwi|🍅 tomato|🥑 avocado|🥦 broccoli|🥬 leafy green|🥒 cucumber|🌶️ hot pepper|🌽 corn|🥕 carrot|🥔 potato|🍠 sweet potato|🥐 croissant|🍞 bread|🥖 baguette|🧀 cheese|🥚 egg|🍳 cooking egg|🥞 pancakes|🥓 bacon|🥩 steak|🍗 chicken leg|🍖 meat bone|🌭 hot dog|🍔 burger|🍟 fries|🍕 pizza|🥪 sandwich|🌯 burrito shawarma|🥗 salad|🍝 pasta|🍜 noodles ramen|🍲 stew|🍛 curry rice|🍣 sushi|🍚 rice|🍙 rice ball|🧆 falafel|🥙 pita kebab|🫓 flatbread|🍤 shrimp|🍦 ice cream|🍩 donut|🍪 cookie|🎂 cake|🍰 shortcake|🧁 cupcake|🍫 chocolate|🍬 candy|🍯 honey|🥜 peanuts|🌰 nuts|☕ coffee|🍵 tea|🧃 juice box|🥤 cup straw shake|🧋 bubble tea|🥛 milk|🍺 beer|🧊 ice",
  },
  {
    id: "travel", label: "Places", icon: "🚗",
    list: "🚗 car|🚕 taxi|🚌 bus|🚎 trolleybus|🏎️ race car|🚓 police car|🚑 ambulance|🚒 fire engine|🛻 pickup|🚚 truck|🛵 scooter|🏍️ motorcycle|🚲 bicycle|🛴 kick scooter|🚆 train|🚇 metro subway|✈️ airplane|🚀 rocket|🛸 ufo|🚁 helicopter|⛵ sailboat|🚢 ship|⚓ anchor|🏠 house home|🏡 house garden|🏢 office|🏥 hospital|🏦 bank|🏨 hotel|🏪 store|🏫 school|🏟️ stadium|🕌 mosque|⛪ church|🕋 kaaba|🏝️ island|🏖️ beach|🏜️ desert|⛰️ mountain|🏔️ snow mountain|🗻 fuji|🌋 volcano|🗺️ map|🧭 compass|🏁 finish flag|🚩 red flag|🏳️ white flag|🇪🇬 egypt flag|🇸🇦 saudi flag|🇦🇪 uae flag|🇺🇸 usa flag|🇬🇧 uk flag",
  },
  {
    id: "objects", label: "Objects", icon: "💡",
    list: "⌚ watch|📱 phone mobile|💻 laptop|⌨️ keyboard|🖥️ desktop|🖨️ printer|🎧 headphones music|🎵 music note|🎶 notes music|🎤 microphone sing|📷 camera photo|📸 camera flash|🎥 movie camera|📺 tv|📻 radio|🔋 battery|🔌 plug|💡 bulb idea|🔦 flashlight|🕯️ candle|💸 money wings|💵 dollar|💰 money bag|💳 card|🧾 receipt|✉️ envelope|📦 package|📌 pin|📎 paperclip|✂️ scissors|🔒 lock|🔓 unlocked|🔑 key|🔨 hammer|🛠️ tools|⚙️ gear|🧲 magnet|🧪 test tube|💉 syringe|🩺 stethoscope|🧻 toilet paper|🧼 soap|🪥 toothbrush|🛒 cart|🎮 game controller|🕹️ joystick|🎲 dice|♟️ chess|🧩 puzzle|🎨 palette art|🎬 clapper|📚 books|📖 book|✏️ pencil|🖊️ pen|📣 megaphone|⏳ hourglass|⌛ hourglass done|📆 tear-off calendar|🗓️ spiral calendar",
  },
  {
    id: "symbols", label: "Symbols", icon: "✔️",
    list: "✔️ check mark|☑️ check box|✅ check done|❎ cross box|❌ cross wrong|⭕ circle|🛑 stop|⛔ no entry|🚫 prohibited|❗ exclamation|❓ question|‼️ double exclamation|⁉️ exclamation question|⚠️ warning|🔴 red circle|🟠 orange circle|🟡 yellow circle|🟢 green circle|🔵 blue circle|🟣 purple circle|⚫ black circle|⚪ white circle|🟥 red square|🟩 green square|🟦 blue square|🔺 red triangle up|🔻 red triangle down|➡️ right arrow|⬅️ left arrow|⬆️ up arrow|⬇️ down arrow|↩️ return|🔄 counterclockwise|🔃 clockwise|🆗 ok button|🆕 new|🆒 cool|🆙 up|🆓 free|🔝 top|🔜 soon|♻️ recycle|💲 dollar sign|➕ plus|➖ minus|✖️ multiply|➗ divide|🟰 equals|♾️ infinity|🔢 numbers|#️⃣ hash|🔟 ten|💤 zzz|🎶 notes|〰️ wavy dash|🔆 bright|📶 signal|🕐 one oclock|☪️ star crescent|☮️ peace|☯️ yin yang",
  },
];

export interface Emoji { e: string; n: string }
export interface EmojiCat { id: string; label: string; icon: string; items: Emoji[] }

export const EMOJI_CATS: EmojiCat[] = RAW.map((c) => ({
  id: c.id, label: c.label, icon: c.icon,
  items: c.list.split("|").map((s) => { const i = s.indexOf(" "); return { e: s.slice(0, i), n: s.slice(i + 1) }; }),
}));

// A few Egyptian / MSA Arabic keywords so search works in both languages (normalised: no diacritics, أ/إ/آ → ا, ة → ه, ى → ي).
const AR: Record<string, string> = {
  "❤️": "قلب حب", "😍": "حب حلو جميل", "🥰": "حب", "😂": "ضحك هههه", "🤣": "ضحك هههه", "😊": "ابتسامه مبسوط", "😀": "ابتسامه فرحان",
  "😢": "حزين بكاء زعلان", "😭": "بكاء عياط", "😡": "غضب زعلان", "😮": "واو", "😱": "خوف", "🤔": "تفكير", "😴": "نوم نايم", "🥱": "تعبان نوم",
  "🔥": "نار جامد", "💪": "عضلات قوه بطل", "👍": "تمام موافق لايك", "👎": "مش عاجبني", "👏": "تصفيق برافو", "🙏": "شكرا لو سمحت دعاء",
  "🤲": "دعاء", "👋": "سلام اهلا", "🤝": "اتفاق", "✌️": "سلام", "💯": "مية بالمية", "🎉": "مبروك احتفال", "🥳": "مبروك احتفال",
  "🏋️": "جيم حديد تمرين", "🏋️‍♂️": "جيم حديد تمرين", "🦵": "رجل رجلين ليج", "🏃": "جري كارديو", "⚽": "كوره", "🏆": "كاس فوز بطوله",
  "🥇": "دهب ذهب الاول", "🍗": "فراخ بروتين", "🥚": "بيض", "🍚": "رز", "🍌": "موز", "🥤": "شيك بروتين", "💧": "مايه مياه", "☕": "قهوه",
  "🍵": "شاي", "🍕": "بيتزا", "🌙": "قمر ليل رمضان", "🕌": "مسجد جامع", "🇪🇬": "مصر", "✅": "تم خلاص", "❌": "لا غلط", "⏱️": "وقت راحه",
  "😎": "روش", "🐐": "معلم اسطوره", "🦍": "وحش", "🚀": "صاروخ", "💤": "نوم", "🤕": "اصابه وجع", "🩹": "اصابه", "🧊": "تلج",
};
export const normAr = (s: string) => s.toLowerCase().replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");

const ALL: Emoji[] = (() => {
  const seen = new Set<string>();
  const out: Emoji[] = [];
  for (const c of EMOJI_CATS) for (const x of c.items) if (!seen.has(x.e)) { seen.add(x.e); out.push(AR[x.e] ? { e: x.e, n: `${x.n} ${normAr(AR[x.e])}` } : x); }
  return out;
})();
export const emojiCount = ALL.length;

/** Name / keyword search (English + Arabic). Word-start matches rank first. */
export function searchEmoji(q: string, limit = 80): Emoji[] {
  const s = normAr(q.trim());
  if (!s) return [];
  const words = s.split(/\s+/);
  const scored: [Emoji, number][] = [];
  for (const x of ALL) {
    const names = x.n.split(" ");
    let score = 0;
    for (const w of words) {
      if (names[0] === w) score += 3;
      else if (names.some((n) => n.startsWith(w))) score += 2;
      else if (x.n.includes(w)) score += 1;
      else { score = -1; break; }
    }
    if (score > 0) scored.push([x, score]);
  }
  return scored.sort((a, b) => b[1] - a[1]).slice(0, limit).map(([x]) => x);
}
const TWO = new Set(["red", "orange", "yellow", "green", "blue", "purple", "black", "white", "brown", "broken", "heart", "thumbs", "raised", "smiling", "face", "flexed", "party", "sweat", "slightly", "upside", "star", "hand", "folded", "crossed", "point", "check", "cross", "lightning", "weight", "leg", "gold", "silver", "bronze", "mind", "open", "sad", "rolling", "sparkling", "two", "growing", "beating", "revolving", "high", "fist", "ok", "victory", "call", "love", "heart", "rock", "clapping", "rising", "see", "hear", "speak", "eye"]);
/** Readable name for screen readers ("red heart"). */
export function emojiName(e: string): string {
  const x = ALL.find((a) => a.e === e || a.e === stripTone(e));
  if (!x) return e;
  const w = x.n.split(" ").filter((s) => /^[a-z]/.test(s));
  return TWO.has(w[0]) ? w.slice(0, 2).join(" ") : w[0];
}

const RKEY = "il_chat_emoji_recent";
export function recentEmoji(): string[] {
  try { return (JSON.parse(localStorage.getItem(RKEY) ?? "[]") as string[]).slice(0, 32); } catch { return []; }
}
export function pushRecent(e: string) {
  const next = [e, ...recentEmoji().filter((x) => x !== e)].slice(0, 32);
  try { localStorage.setItem(RKEY, JSON.stringify(next)); } catch { /* ignore */ }
}

// ---------------------------------------------------------------- skin tones (Fitzpatrick modifiers, one choice remembered)

export const TONES: { id: number; mod: string; label: string; swatch: string }[] = [
  { id: 0, mod: "", label: "Default", swatch: "#ffcc4d" },
  { id: 1, mod: "\u{1F3FB}", label: "Light", swatch: "#f7dece" },
  { id: 2, mod: "\u{1F3FC}", label: "Medium-light", swatch: "#f3d2a2" },
  { id: 3, mod: "\u{1F3FD}", label: "Medium", swatch: "#d5ab88" },
  { id: 4, mod: "\u{1F3FE}", label: "Medium-dark", swatch: "#af7e57" },
  { id: 5, mod: "\u{1F3FF}", label: "Dark", swatch: "#7c533e" },
];
// base characters that take a skin tone (hands, people, sports in this set)
const TONEABLE = new Set([..."💪🦵🦶🏋🤸🧘🏃🚴🏊⛹👋🤚✋🖐👌🤌🤏✌🤞🫰🤟🤘🤙👈👉👆👇☝👍👎✊👊🤛🤜👏🙌🫶👐🤲🙏✍💅🤳👶🧒👦👧🧑👨👩🧔👴👵🙋🙆🙅🤷🤦🙇💁🧏🕺💃🚶🧍🧎"].map((c) => c.codePointAt(0)!));
const TKEY = "il_chat_skin_tone";
export const getTone = () => { try { return Math.max(0, Math.min(5, Number(localStorage.getItem(TKEY)) || 0)); } catch { return 0; } };
export const saveTone = (t: number) => { try { localStorage.setItem(TKEY, String(t)); } catch { /* ignore */ } };
export const stripTone = (e: string) => e.replace(/[\u{1F3FB}-\u{1F3FF}]/gu, "");
/** "👍" + tone 3 → "👍🏽"; "🏋️‍♀️" → "🏋🏽‍♀️" (the variation selector after the base is dropped, per Unicode). */
export function withTone(e: string, tone: number): string {
  if (!tone) return e;
  const cp = e.codePointAt(0)!;
  if (!TONEABLE.has(cp)) return e;
  const base = String.fromCodePoint(cp);
  const rest = e.slice(base.length).replace(/^️/, "");
  return base + TONES[tone].mod + rest;
}
export const toneable = (e: string) => TONEABLE.has(e.codePointAt(0)!);

/** Quick reactions: the bar on hover / long-press / the React button (6 + "more"). */
export const QUICK = ["❤️", "😂", "🔥", "💪", "😮", "👍"];

/** True when a text is only 1-3 emoji (shown big, like WhatsApp / iMessage). */
export function bigEmoji(text: string | null | undefined): number {
  if (!text) return 0;
  const t = text.trim();
  if (!t || t.length > 40) return 0;
  if (!/^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|\p{Regional_Indicator}|‍|️|⃣|\s)+$/u.test(t)) return 0;
  if (/^[\d#*\s]+$/.test(t)) return 0; // digits are Emoji_Component
  const n = typeof Intl !== "undefined" && "Segmenter" in Intl
    ? [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(t.replace(/\s+/g, ""))].length
    : [...t.replace(/\s+/g, "")].length;
  return n <= 3 ? n : 0;
}
