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
 * Something said with Y (open speech). Returns { reply, call } where call names what answered:
 * 'mount' when he says his dinosaur's name (or "here boy", or a whistle) in the dark world.
 */
export function say(text, {era = 'present', mount = 'Dino', onFoot = false} = {}) {
  const t = clean(text),
    raw = String(text ?? '').trim();
  if (!raw) return {reply: null, call: null};
  if (!t) return {reply: `💬 ${raw.slice(0, 12)}`, call: null}; // emoji and symbols are an answer too
  const calling = sounds(t, mount) || ['here', 'whistle', 'come', 'dino', 'dinosaur'].some(w => sounds(t, w));
  if (era === 'past' && calling)
    return onFoot
      ? {reply: `🦖 ${mount} comes running!`, call: 'mount'}
      : {reply: `🦖 ${mount} is right here, under you!`, call: null};
  if (calling) return {reply: `🦖 ${mount} can't hear you from here… it lives long ago`, call: null};
  if (['hi', 'hello', 'hey', 'howdy'].some(w => sounds(t, w)))
    return {reply: era === 'past' ? '🤠 Howdy, partner!' : '👋 Hello!', call: null};
  if (sounds(t, 'yeehaw') || sounds(t, 'yee haw')) return {reply: '🤠 YEEHAW!', call: null};
  if (sounds(t, 'six seven') || t === '67') return {reply: '6️⃣7️⃣ SIX SEVEN!', call: null};
  return {reply: `💬 "${String(text).trim().slice(0, 24)}"`, call: null};
}
