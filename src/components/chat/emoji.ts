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

const ALL: Emoji[] = (() => {
  const seen = new Set<string>();
  const out: Emoji[] = [];
  for (const c of EMOJI_CATS) for (const x of c.items) if (!seen.has(x.e)) { seen.add(x.e); out.push(x); }
  return out;
})();
export const emojiCount = ALL.length;

export function searchEmoji(q: string): Emoji[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const words = s.split(/\s+/);
  return ALL.filter((x) => words.every((w) => x.n.split(" ").some((n) => n.startsWith(w)) || x.n.includes(w))).slice(0, 80);
}

const RKEY = "il_chat_emoji_recent";
export function recentEmoji(): string[] {
  try { return (JSON.parse(localStorage.getItem(RKEY) ?? "[]") as string[]).slice(0, 24); } catch { return []; }
}
export function pushRecent(e: string) {
  const next = [e, ...recentEmoji().filter((x) => x !== e)].slice(0, 24);
  try { localStorage.setItem(RKEY, JSON.stringify(next)); } catch { /* ignore */ }
}

/** Quick reactions (long-press bar). */
export const QUICK = ["❤️", "😂", "🔥", "💪", "😮", "😢", "👍"];

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
