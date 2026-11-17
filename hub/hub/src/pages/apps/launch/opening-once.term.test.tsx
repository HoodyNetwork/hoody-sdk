// Apps, an Open under way in the launcher (AppLauncher Opening): its line ("Opening htop…", "Finding htop…", "Preparing a
// place to run it…", "Starting htop…") was said twice in the terminal. A labelled Spinner sat before the same words (those
// were aria-hidden on the web; the terminal draws both, and its Spinner draws its label, kit/states/Spinner.term.tsx).
// The spinner is only the mark and the words are the status: once on the line, and as the status's name. The app's style
// table is installed as the terminal has it (`.line` is a flex row there, so the status span is an item of its own).
import { afterAll, afterEach, expect, test } from 'bun:test';
import { installStyleTable } from '../../../../scripts/term/style-table';
import { FocusRoot } from '../../../term/prim';
import { setStyleTable } from '../../../term/jsx/style';
import { queryAllByRole, semanticsOf } from '../../../term/prim/semantics';
import { drawTest, type TestTerm } from '../../../term/prim/testing';
import strings from '../strings.en.json';
import { Opening } from './AppLauncher';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });
afterAll(() => setStyleTable(null));

const times = (line: string, word: string) => line.split(word).length - 1;
const LINES = {
  opening: strings['launcher.opening'],
  resolve: strings['launcher.phase.resolve'],
  create: strings['launcher.phase.create'],
  execute: strings['launcher.phase.execute'],
} as const;

for (const phase of ['opening', 'resolve', 'create', 'execute'] as const) {
  test(`${phase}: the line is said once`, async () => {
    installStyleTable(100);
    // `at` names no launch this tab marked, so no elapsed time is drawn beside the line.
    t = await drawTest(<FocusRoot><Opening name="htop" phase={phase === 'opening' ? undefined : phase} at="not-marked" /></FocusRoot>, { width: 100, height: 4 });
    const f = await t.settle();
    const word = LINES[phase].replace('{{name}}', 'htop');
    const lines = f.split('\n').filter((l) => l.includes(word));
    expect(lines.length, f).toBe(1);
    expect(times(lines[0]!, word), f).toBe(1);
    expect(queryAllByRole(semanticsOf(t.renderer as never), 'status', { name: new RegExp(word) }).length, f).toBe(1);
  }, 60_000);
}
