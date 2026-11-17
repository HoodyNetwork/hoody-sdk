// The strings a page's manifest carries at boot (vite.config.mts pageBootStrings): the table's keys its page.ts writes
// as quoted literals, each with its plural forms, values unchanged. The scan is a deliberate superset (a literal that is
// also a key keeps that key). A key page.ts builds at run time is not seen, so definePage refuses that manifest at load.

const LITERAL = /['"]([\w.-]+)['"]/g;
const PLURAL = /_(zero|one|two|few|many|other)$/;

export function bootStrings(pageSrc: string, table: Readonly<Record<string, string>>): Record<string, string> {
  const named = new Set(Array.from(pageSrc.matchAll(LITERAL), (m) => m[1] as string));
  return Object.fromEntries(Object.entries(table).filter(([k]) => named.has(k) || named.has(k.replace(PLURAL, ''))));
}
