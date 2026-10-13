// Reserve safety cues before shedding optional readings or fitting the remaining text.
export function fitCombatRow(parts, width, measure) {
  const reservedText = parts.filter((part) => part.reserved).map((part) => part.text).join("·");
  const reservedWidth = reservedText ? measure(reservedText) + 6 : 0;
  const readings = parts.filter((part) => !part.reserved);
  const fits = (text) => measure(text) <= width - reservedWidth;
  let text = readings.map((part) => part.text).join(" · ");
  if (!fits(text)) text = readings.map((part) => part.text).join("·");
  while (!fits(text) && readings.some((part) => part.optional)) {
    readings.splice(readings.findLastIndex((part) => part.optional), 1);
    text = readings.map((part) => part.text).join("·");
  }
  return { text, reservedText, reservedWidth };
}
