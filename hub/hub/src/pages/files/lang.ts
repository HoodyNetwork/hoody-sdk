// Which colours a text preview gets: the kit CodeBlock language for the file's name,
// or `shell` for a file without a known extension whose first line is a shell shebang. Everything else stays plain.
// The extension table is the kit's (kit/data/codeLang.ts), the one Ask's code blocks use too.
import { type ColouredLang, codeLangOfPath } from '@kit';

/** Longer texts stay plain: the kit's own bound for its tokenizers (kit/data/highlight.ts HL_MAX), which its shell
 *  colouring does not apply. */
export const PREVIEW_HL_MAX = 100_000;

/** `#!/bin/sh`, `#!/bin/bash`, `#!/usr/bin/zsh`, `#!/usr/bin/env bash`: the interpreter is a shell. */
const SHELL_SHEBANG = /^#![ \t]*\/(?:usr\/)?(?:local\/)?bin\/(?:env[ \t]+)?(?:ba|z|k|da)?sh(?:[ \t]|$)/;

/** The kit CodeBlock language for a preview of `name` showing `text`; undefined = plain. */
export function previewLang(name: string, text: string): ColouredLang | undefined {
  if (text.length > PREVIEW_HL_MAX) return undefined;
  const ext = codeLangOfPath(name);
  if (ext) return ext;
  const nl = text.indexOf('\n');
  const first = nl < 0 ? text : text.slice(0, nl);
  return SHELL_SHEBANG.test(first) ? 'shell' : undefined;
}
