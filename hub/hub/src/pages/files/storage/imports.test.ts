// Storage lives in Files: nothing in this folder imports the computers page
// (its data helpers, runner, types or URLs). It takes the shared ones from @core, so the folder can move as it is.
// A terminal twin (*.term.tsx) may also draw with the terminal's primitives.
import { describe, expect, it } from 'vitest';

const sources = import.meta.glob<string>('./*.{ts,tsx}', { eager: true, query: '?raw', import: 'default' });

describe('storage imports', () => {
  it('no import leaves this folder except @core, @kit, React, test libraries and (terminal twins) @term/prim', () => {
    const outside = Object.entries(sources).flatMap(([file, text]) =>
      [...text.matchAll(/^\s*(?:import|export)\b[^;]*?from\s+'([^']+)'/gm)]
        .map((m) => m[1]!)
        .filter((spec) => !(file.endsWith('.term.tsx') && spec === '@term/prim'))
        .filter((spec) => spec.startsWith('../') || spec.startsWith('@/') || /^@(?!core$|core\/test\/|kit$|kit\/strings\.en\.json$|testing-library\/|tanstack\/)/.test(spec))
        .map((spec) => `${file}: ${spec}`),
    );
    expect(outside).toEqual([]);
  });
});
