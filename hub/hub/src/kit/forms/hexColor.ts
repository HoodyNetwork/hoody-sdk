// normalizeHexColor, in a module of its own so pure consumers (@kit/pure) can import it: no React, no CSS.

const HEX = /^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

/** '#RRGGBB' in capitals for what the API accepts as a colour (surrounding spaces ignored), else null. */
export function normalizeHexColor(text: string): string | null {
  const d = HEX.exec(text.trim())?.[1]?.toUpperCase();
  if (!d) return null;
  return `#${d.length === 3 ? d.replace(/./g, (c) => c + c) : d}`;
}
