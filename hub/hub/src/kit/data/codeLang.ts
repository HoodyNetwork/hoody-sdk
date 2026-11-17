// One table for the languages the kit CodeBlock colours: a language word (a Markdown fence tag such as `bash`) or a file
// extension (`deploy.sh`) gives its CodeBlock `lang`. Ask's fenced blocks and Files' text previews both read it, so a
// file colours the same in both places. A word not in the table is plain (undefined).
import type { CodeLang } from './Ids';

/** The CodeBlock languages a word or extension can name (CodeBlock also takes 'plain' and the shell aliases). */
export type ColouredLang = Exclude<CodeLang, 'plain' | 'bash' | 'sh'>;

/** The table: each language with the words and extensions that name it. */
export const CODE_LANG_WORDS: readonly (readonly [ColouredLang, string])[] = [
  ['json', 'json jsonc json5'],
  ['shell', 'sh bash shell zsh ksh console'],
  ['js', 'js javascript jsx mjs cjs node'],
  ['ts', 'ts typescript tsx mts cts'],
  ['yaml', 'yaml yml'],
  ['http', 'http'],
  ['python', 'py python'],
  ['diff', 'diff patch'],
];

const BY_WORD: Record<string, ColouredLang> = Object.create(null) as Record<string, ColouredLang>;
for (const [lang, words] of CODE_LANG_WORDS) for (const w of words.split(' ')) BY_WORD[w] = lang;

/** The language a word names (case-insensitive, leading dots ignored: `.YML` is yaml); undefined = plain. */
export function codeLangOfWord(word: unknown): ColouredLang | undefined {
  const w = String(word || '').toLowerCase().replace(/^\.+/, '');
  return w ? BY_WORD[w] : undefined;
}

/** The language of a file name or path by its extension (1 to 8 letters or digits after the last dot); undefined = plain. */
export function codeLangOfPath(path: unknown): ColouredLang | undefined {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(String(path || '').slice(-40));
  return m ? BY_WORD[(m[1] as string).toLowerCase()] : undefined;
}
