// A chat's Markdown export, the pure part (split out of exportMd.ts so the terminal build shares it; exportMd.ts
// re-exports every name here and keeps downloadText, which saves through a DOM link).
import { cleanAgentText as clean, type ConvBlock, type ConvSnapshot, type StepView } from '@kit';

/** The host's words (from the strings file); the export has none of its own. */
export interface ExportWords {
  untitled: string;
  you: string;
  assistant: string;
  earlier: string;
  unfinished: string;
  cut: (count: number) => string;
  attached: (name: string) => string;
  step: Record<StepView['state'], string>;
  decided: Record<'once' | 'session' | 'deny' | 'answered' | 'declined' | 'elsewhere' | 'ended', string>;
}

/** The most one block of text carries into the file. */
export const EXPORT_BLOCK_MAX = 200_000;
const TITLE_MAX = 200;
const NAME_MAX = 80;

/** One line, scrubbed, with the markers that could open something escaped. */
function inline(text: unknown, max = TITLE_MAX): string {
  return clean(text, max, { code: true }).text.replace(/\s+/g, ' ').trim().replace(/[\\`*<[\]]/g, (c) => '\\' + c);
}
/** A step's input inside a code span: a backtick cannot end it. */
function span(text: unknown, max = TITLE_MAX): string {
  const t = clean(text, max, { code: true }).text.replace(/\s+/g, ' ').replace(/`/g, "'").trim();
  return t ? '`' + t + '`' : '';
}
/** Several lines of text as a quote: every line carries the marker, so none starts anything at the top level. */
function quote(text: unknown): { md: string; cut: number } {
  const c = clean(text, EXPORT_BLOCK_MAX, { code: true });
  // An entity, not a backslash: a backslash the text already carries would cancel the escape and leave the tag raw.
  const body = c.text.replace(/<(?=[A-Za-z/!?])/g, '&lt;');
  return { md: body.split('\n').map((l) => (l ? '> ' + l : '>')).join('\n'), cut: c.cut };
}

function stepLine(r: StepView, w: ExportWords): string {
  const parts = [inline(r.verb, 80), span(r.summary), r.time ? inline(r.time, 40) : '', w.step[r.state]];
  if (r.note) parts.push(inline(r.note, 300));
  return '- ' + parts.filter(Boolean).join(' · ');
}

function blockMd(b: ConvBlock, w: ExportWords): string {
  switch (b.k) {
    case 'user': {
      const q = quote(b.text), out = ['## ' + w.you, '', q.md];
      if (q.cut > 0) out.push('', '*' + w.cut(q.cut) + '*');
      for (const f of b.files ?? []) out.push('', '*' + inline(w.attached(clean(f.name, 120, { code: true }).text), 300) + '*');
      if (b.note) out.push('', '*' + inline(b.note.text, 300) + '*');
      return out.join('\n');
    }
    case 'steps':
      return [b.label ? '*' + inline(b.label, 120) + '*' : '', '', ...b.rows.map((r) => stepLine(r, w))].join('\n').trim();
    case 'reply': {
      const q = quote(b.text), out = ['## ' + w.assistant, '', q.md];
      if (q.cut > 0) out.push('', '*' + w.cut(q.cut) + '*');
      if (b.cut) out.push('', '*' + inline(b.cut, 300) + '*');
      if (b.streaming) out.push('', '*' + w.unfinished + '*');
      return out.join('\n');
    }
    case 'decided': {
      const d = b.d, bits = [w.decided[d.kind]];
      if (d.tool && d.kind !== 'deny') bits.push(inline(d.tool, 80));
      const first = d.text && d.kind !== 'answered' ? inline(clean(d.text, 200).text.split('\n')[0], 200) : '';
      if (first) bits.push(first);
      return '*' + bits.join(' · ') + '*';
    }
    case 'line':
      return '*' + inline(b.text, 300) + '*';
    // The agent's summary of the earlier conversation: the agent wrote it, never a message of the person's.
    case 'summary': {
      const q = quote(b.text), out = ['## ' + w.assistant, '', '*' + w.earlier + '*', '', q.md];
      if (q.cut > 0) out.push('', '*' + w.cut(q.cut) + '*');
      return out.join('\n');
    }
  }
}

export function exportMarkdown(snap: ConvSnapshot, w: ExportWords): string {
  const out = ['# ' + (inline(snap.title) || w.untitled)];
  const m = snap.meta;
  const where = m ? [m.computer, m.realm, m.folder, m.agent, m.model].map((x) => (x ? inline(x, 120) : '')).filter(Boolean).join(' · ') : '';
  if (where) out.push('', '*' + where + '*');
  if (snap.gapTop) out.push('', '> ' + w.earlier);
  for (const b of snap.blocks) {
    const t = blockMd(b, w);
    if (t) out.push('', t);
  }
  return out.join('\n') + '\n';
}

/** A file name from the title: no path or reserved characters, no leading dot, bounded. Letters of any script stay. */
export function exportFileName(title: string | null, w: ExportWords): string {
  const base = clean(title ?? '', 400, { code: true }).text
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').replace(/^[\s.]+/, '').slice(0, NAME_MAX).replace(/[\s.]+$/, '');
  return (base || w.untitled) + '.md';
}
