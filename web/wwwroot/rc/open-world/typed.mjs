// Typing short messages (docs/design/adventure, owner 31 Oct): toys ask a short question and the
// 6-year-old types a word or two. Forgiving by rule: case and spaces don't matter, a small spelling
// slip still matches, every answer gets a friendly reply, and nothing typed can ever block play.
// Pure: matching, names and replies; the type box itself is type-prompt.js.

/** Letters and digits only, lower case: "  Rex! " → "rex". */
export const clean = text =>
  String(text ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Edit distance, small words only (a kid's answers). */
export function distance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = [...Array(b.length + 1).keys()];
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++)
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length];
}

/** Does what he typed mean `word`? One slip allowed up to 5 letters, two beyond. */
export function sounds(typed, word) {
  const t = clean(typed),
    w = clean(word);
  if (!t || !w) return false;
  if (t === w || t.split(' ').includes(w)) return true;
  return distance(t, w) <= (w.length <= 5 ? 1 : 2);
}

/** A name for a toy, as typed: trimmed, capitalised, 12 letters at most; empty keeps the fallback. */
export function nameFrom(text, fallback) {
  const n = String(text ?? '')
    .replace(/[<&>"]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 12);
  return n ? n[0].toUpperCase() + n.slice(1) : fallback;
}

/**
 * Vocabulary table of friendly replies for young players.
 * Each entry holds words/phrases and era-specific replies (<= 28 chars, starting with an emoji).
 */
export const DICTIONARY = Object.freeze([
  // Existing specials and greetings
  {words: ['six seven', '67'], present: '6️⃣7️⃣ SIX SEVEN!', past: '6️⃣7️⃣ SIX SEVEN!'},
  {words: ['yee haw', 'yeehaw'], present: '🤠 YEEHAW!', past: '🤠 YEEHAW!'},
  {words: ['hola'], present: '👋 ¡Hola!', past: '🤠 ¡Hola, amigo!'},
  {words: ['gracias'], present: '🤠 ¡De nada!', past: '🤠 ¡De nada!'},
  {words: ['adios', 'adiós'], present: '👋 ¡Adiós, amigo!', past: '👋 ¡Adiós, amigo!'},
  {words: ['si', 'sí'], present: '👍 ¡Sí!', past: '👍 ¡Sí!'},
  {words: ['hi', 'hello', 'hey', 'howdy'], exclude: ['yellow'], present: '👋 Hello!', past: '🤠 ¡Hola! Howdy!'},

  // Questions
  {words: ['who are you'], present: '🤖 I am your robot buddy!', past: '🤠 I am your toy cowboy!'},
  {
    words: ['what is your name', 'what is ur name', 'whats your name'],
    present: '🤖 Beep! I am your robot!',
    past: '🤠 Beep! I am your cowboy!'
  },
  {words: ['where am i'], present: '🗺️ Saucer Springs!', past: '🗺️ Long, long ago!'},

  // Feelings
  {words: ['happy', 'glad'], present: '😊 Big robot smile!', past: '🤠 Happy as a dino!'},
  {words: ['sad'], present: '🤗 Beep boop! A hug!', past: '🤗 Dino hug for you!'},
  {words: ['mad', 'angry'], present: '🧯 Cool down, beep!', past: '🦕 Deep dino breath!'},
  {words: ['scared', 'afraid'], present: '🛡️ You are safe here!', past: '🦕 Dino keeps you safe!'},
  {words: ['tired', 'sleepy'], present: '🔋 Time to recharge!', past: '💤 Dino nap time!'},
  {words: ['bored'], present: '🚀 Let us go explore!', past: '🦖 Let us go stomp!'},
  {words: ['i love you', 'love you', 'love'], present: '💖 Beep! Love you too!', past: '❤️ Dino love you too!'},
  {words: ['sorry'], present: '✨ All good, pal!', past: '🤠 It is okay, partner!'},
  {words: ['thank you', 'thanks'], present: '🤖 You are welcome!', past: '🤠 You bet, partner!'},

  // Social words and reactions
  {words: ['yes', 'yeah', 'yep'], present: '👍 Yay! Yes!', past: '👍 Yeehaw! Yes!'},
  {words: ['no'], present: '🙂 Okay! No is fine.', past: '🤠 Okay, pal!'},
  {words: ['ok', 'okay'], present: '👌 A-okay, beep!', past: '👌 Okie dokie!'},
  {words: ['help'], present: '🤖 I can help! Beep!', past: '🤠 Dino help is here!'},
  {words: ['wow'], present: '✨ Super cool, right?', past: '🌟 Wow! Yeehaw!'},
  {words: ['cool'], present: '😎 So cool, beep!', past: '😎 Cool as a cactus!'},
  {words: ['lol'], present: '😆 Beep! So funny!', past: '😂 That tickles, dino!'},
  {words: ['haha', 'ha ha'], present: '😂 Beep beep haha!', past: '😂 Dino laughs! Haha!'},
  {words: ['oops', 'whoops'], present: '🔧 We can fix that!', past: '🤠 Dust yourself off!'},
  {words: ['good night', 'goodnight'], present: '🌙 Sleep tight, beep!', past: '🌙 Sweet dino dreams!'},
  {words: ['good bye', 'goodbye', 'bye'], present: '👋 See you next time!', past: '👋 Happy trails, pal!'},

  // Animals and dinosaurs
  {words: ['dog', 'dogs', 'puppy'], present: '🐶 Robo-pup says woof!', past: '🐶 Prairie pup! Woof!'},
  {words: ['cat', 'cats', 'kitty'], present: '🐱 Laser cat says purr!', past: '🐱 Barn cat says meow!'},
  {words: ['horse', 'horses', 'horsey', 'pony'], exclude: ['house'], present: '🐴 Turbo pony goes zoom!', past: '🐴 Giddyup, horsey!'},
  {words: ['cow', 'cows'], present: '🐮 Space cow goes moo!', past: '🐮 Mooo on the range!'},
  {words: ['bird', 'birds'], present: '🐦 Drone bird flies high!', past: '🐦 Chirp in the canyon!'},
  {words: ['t rex', 'trex'], exclude: ['tres'], present: '🦖 Tiny arms, big roar!', past: '🦖 ROAR! King of dinos!'},
  {words: ['raptor', 'raptors'], exclude: ['robot'], present: '⚡ Super fast raptor!', past: '🦕 Speedy raptor pack!'},
  {words: ['triceratops'], present: '🦕 Three big horns!', past: '🦕 Three mighty horns!' },
  {words: ['stegosaurus'], present: '🦕 Spikes on its back!', past: '🦕 Big spiky plates!'},
  {words: ['brontosaurus', 'argentinosaurus', 'bronto'], present: '🦕 Giant tall neck!', past: '🦕 Long neck in trees!'},
  {words: ['pterodactyl', 'quetzalcoatlus', 'quetzal'], present: '🦅 Gliding in the sky!', past: '🦅 Giant wings soar!'},

  // Vehicle and game words
  {words: ['car', 'cars'], present: '🚗 Vroom vroom! Zoom!', past: '🦕 Dino ride is better!'},
  {words: ['fast'], present: '⚡ Zoom! So fast!', past: '💨 Fast as the wind!'},
  {words: ['jump'], present: '🦘 Up, up, jump!', past: '🦘 Big bouncy leap!'},
  {words: ['race'], present: '🏁 3, 2, 1, GO!', past: '🏁 Dino derby time!'},
  {words: ['win', 'winner'], present: '🏆 You are number 1!', past: '🏆 Champion cowboy!'},
  {words: ['rocket', 'rockets'], present: '🚀 Blast off to space!', past: '🚀 Whoosh! Up high!'},
  {words: ['robot', 'robots'], exclude: ['raptor'], present: '🤖 Beep boop, that is me!', past: '🤖 A metal cowboy!'},
  {words: ['alien', 'aliens'], present: '👽 Friendly space buddy!', past: '👽 Star friend visits!'},
  {words: ['ufo', 'ufos'], present: '🛸 A flying saucer!', past: '🛸 A sky wagon!'},
  {words: ['beep'], present: '🔊 Beep beep boop!', past: '🔊 Beep beep!'},

  // Colours
  {words: ['red'], present: '🔴 Shiny red rover!', past: '🔴 Red canyon rock!'},
  {words: ['blue'], present: '🔵 Bright blue neon!', past: '🔵 Clear blue sky!'},
  {words: ['green'], present: '🟢 Glowing green light!', past: '🟢 Green valley grass!'},
  {words: ['yellow'], exclude: ['hello'], present: '🟡 Yellow like a bus!', past: '🟡 Warm yellow sun!'},
  {words: ['pink'], present: '🌸 Pretty pink laser!', past: '🌸 Sweet pink flower!'},
  {words: ['purple'], present: '🟣 Purple space dust!', past: '🟣 Purple sunset sky!'},
  {words: ['orange'], present: '🟠 Orange like a cone!', past: '🟠 Orange camp fire!'},
  {words: ['black'], present: '⚫ Deep space black!', past: '⚫ Dark starry night!'},
  {words: ['white'], present: '⚪ White like the moon!', past: '⚪ Fluffy white cloud!'},

  // Numbers 1-10
  {words: ['1', 'one'], present: '1️⃣ Number one! Zoom!', past: '1️⃣ One little dino!'},
  {words: ['2', 'two'], present: '2️⃣ Two robot eyes!', past: '2️⃣ Two dino friends!'},
  {words: ['3', 'three'], present: '3️⃣ Three, two, one!', past: '3️⃣ Three dino horns!'},
  {words: ['4', 'four'], present: '4️⃣ Four sturdy wheels!', past: '4️⃣ Four stompy feet!'},
  {words: ['5', 'five'], present: '5️⃣ High five, buddy!', past: '5️⃣ High five, partner!'},
  {words: ['6', 'six'], present: '6️⃣ Six wheels! Zoom!', past: '6️⃣ Six dino eggs!'},
  {words: ['7', 'seven'], present: '7️⃣ Lucky number seven!', past: '7️⃣ Seven canyon birds!'},
  {words: ['8', 'eight'], present: '8️⃣ Eight drone blades!', past: '8️⃣ Eight canyon paths!'},
  {words: ['9', 'nine'], present: '9️⃣ Nine! Beep!', past: '9️⃣ Almost ten dinos!'},
  {words: ['10', 'ten'], present: '🔟 Top ten score!', past: '🔟 Ten out of ten!'},

  // Spanish words
  {words: ['amigo', 'amigos'], present: '🤖 ¡Amigo! Friend!', past: '🤠 ¡Amigo! Friend!'},
  {words: ['perro', 'perros'], present: '🐶 ¡Perro! Dog!', past: '🐶 ¡Perro! Dog!'},
  {words: ['gato', 'gatos'], present: '🐱 ¡Gato! Cat!', past: '🐱 ¡Gato! Cat!'},
  {words: ['caballo', 'caballos'], present: '🐴 ¡Caballo! Horse!', past: '🐴 ¡Caballo! Horse!'},
  {words: ['vaca', 'vacas'], present: '🐮 ¡Vaca! Cow!', past: '🐮 ¡Vaca! Cow!'},
  {words: ['agua'], present: '💧 ¡Agua! Water!', past: '💧 ¡Agua! Water!'},
  {words: ['sol'], present: '☀️ ¡Sol! Sun!', past: '☀️ ¡Sol! Sun!'},
  {words: ['luna'], present: '🌙 ¡Luna! Moon!', past: '🌙 ¡Luna! Moon!'},
  {words: ['rojo'], present: '🔴 ¡Rojo! Red!', past: '🔴 ¡Rojo! Red!'},
  {words: ['azul'], present: '🔵 ¡Azul! Blue!', past: '🔵 ¡Azul! Blue!'},
  {words: ['verde'], present: '🟢 ¡Verde! Green!', past: '🟢 ¡Verde! Green!'},
  {words: ['uno'], present: '1️⃣ ¡Uno! One!', past: '1️⃣ ¡Uno! One!'},
  {words: ['dos'], present: '2️⃣ ¡Dos! Two!', past: '2️⃣ ¡Dos! Two!'},
  {words: ['tres'], exclude: ['trex'], present: '3️⃣ ¡Tres! Three!', past: '3️⃣ ¡Tres! Three!'},
  {words: ['cuatro'], present: '4️⃣ ¡Cuatro! Four!', past: '4️⃣ ¡Cuatro! Four!'},
  {words: ['cinco'], present: '5️⃣ ¡Cinco! Five!', past: '5️⃣ ¡Cinco! Five!'},
  {words: ['seis'], present: '6️⃣ ¡Seis! Six!', past: '6️⃣ ¡Seis! Six!'},
  {words: ['siete'], present: '7️⃣ ¡Siete! Seven!', past: '7️⃣ ¡Siete! Seven!'},
  {words: ['ocho'], present: '8️⃣ ¡Ocho! Eight!', past: '8️⃣ ¡Ocho! Eight!'},
  {words: ['nueve'], present: '9️⃣ ¡Nueve! Nine!', past: '9️⃣ ¡Nueve! Nine!'},
  {words: ['diez'], present: '🔟 ¡Diez! Ten!', past: '🔟 ¡Diez! Ten!'},
  {words: ['buenos dias'], present: '☀️ ¡Buenos días! Good day!', past: '🤠 ¡Buenos días! Good day!'},
  {words: ['buenas noches'], present: '🌙 ¡Buenas noches! Night!', past: '🌙 ¡Buenas noches! Night!'},
  {words: ['te quiero'], present: '❤️ ¡Te quiero! Love you!', past: '❤️ ¡Te quiero! Love you!'}
]);

// Multi-word phrases sorted longest first to prioritize full phrases over sub-phrases.
const PHRASES = DICTIONARY.flatMap(entry =>
  entry.words.filter(w => w.includes(' ')).map(phrase => ({phrase, entry}))
).sort((a, b) => b.phrase.length - a.phrase.length);

/** Find an exact phrase or exact word/plural match in the vocabulary table. */
function matchExact(t, era) {
  // 1. Known multi-word phrases matched first
  for (const {phrase, entry} of PHRASES) {
    const re = new RegExp('(?:^|\\s)' + phrase + '(?:$|\\s)');
    if (re.test(t)) return era === 'past' ? entry.past : entry.present;
  }

  const tokens = t.split(' ').filter(Boolean);

  // 2. Exact word and simple plural matches
  for (const token of tokens) {
    for (const entry of DICTIONARY) {
      if (entry.exclude?.includes(token)) continue;
      for (const w of entry.words) {
        if (w.includes(' ')) continue;
        if (token === w) return era === 'past' ? entry.past : entry.present;
        if (token.endsWith('s') && token.length > 3 && token.slice(0, -1) === w) {
          return era === 'past' ? entry.past : entry.present;
        }
      }
    }
  }

  return null;
}

/** Edit distance where swapping two neighbouring letters is one slip ("robto" → "robot"). */
function slips(a, b) {
  const d = Array.from({length: a.length + 1}, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}

/** The closest word to a spelling slip in the vocabulary table (words <= 3 letters must match exactly). */
function matchFuzzy(t, era) {
  let best = null,
    bestSlips = Infinity;
  for (const token of t.split(' ').filter(Boolean)) {
    if (token.length <= 3) continue;
    for (const entry of DICTIONARY) {
      if (entry.exclude?.includes(token)) continue;
      for (const w of entry.words) {
        if (w.includes(' ') || w.length <= 3) continue;
        const n = slips(token, w);
        if (n <= (w.length <= 5 ? 1 : 2) && n < bestSlips) (best = entry), (bestSlips = n);
      }
    }
  }
  return best && (era === 'past' ? best.past : best.present);
}

/**
 * Something said with Y (open speech). Returns { reply, call } where call names what answered:
 * 'mount' when he says his dinosaur's name (or "here boy", or a whistle) in the dark world.
 */
export function say(text, {era = 'present', mount = 'Dino', onFoot = false} = {}) {
  const t = clean(text),
    raw = String(text ?? '').trim();
  if (!raw) return {reply: null, call: null};
  if (!t) return {reply: `💬 ${raw.slice(0, 12)}`, call: null}; // emoji and symbols are an answer too

  // His dinosaur's own name beats the word table: a dino he called "Blue" must still come.
  const named = clean(mount);
  if (named && (t === named || t.split(' ').includes(named))) {
    if (era === 'past') return onFoot ? {reply: `🦖 ${mount} is here!`, call: 'mount'} : {reply: `🦖 You are on ${mount}!`, call: null};
    return {reply: `🦖 ${mount} lives long ago.`, call: null};
  }

  // Exact dictionary match checked first (protects vocabulary words like "white" from fuzzy collisions with "whistle").
  const exact = matchExact(t, era);
  if (exact) return {reply: exact, call: null};

  // Mount calling check
  const calling = sounds(t, mount) || ['here', 'whistle', 'come', 'dino', 'dinosaur'].some(w => sounds(t, w));
  if (era === 'past' && calling)
    return onFoot
      ? {reply: `🦖 ${mount} is here!`, call: 'mount'}
      : {reply: `🦖 You are on ${mount}!`, call: null};
  if (calling) return {reply: `🦖 ${mount} lives long ago.`, call: null};

  // Fuzzy match for small spelling slips on longer vocabulary words
  const fuzzy = matchFuzzy(t, era);
  if (fuzzy) return {reply: fuzzy, call: null};

  return {reply: `💬 "${raw.slice(0, 24)}"`, call: null};
}
