// StepPictures in the terminal: a stored picture of a reopened chat (Ask column, AI session view) mounts without reading
// IntersectionObserver (a trapped DOM global here: even `typeof` throws TERM_GLOBAL). A terminal draws no picture, so the
// twin (StepPictures.term.tsx) shows the picture's name and reads nothing through the host.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box } from '@term/prim';
import { StepPictureHost, StoredPicture, type StepPictureReader } from './StepPictures';

let term: TestTerm | null = null;
afterEach(() => { term?.renderer.destroy(); term = null; });

test('a stored picture mounts and shows its name; nothing is read (no IntersectionObserver read)', async () => {
  const asked: string[] = [];
  const reader: StepPictureReader = {
    read: () => Promise.resolve(null),
    stored: (id) => { asked.push(id); return Promise.resolve(null); },
  };
  term = await drawTest(
    <Box dir="column" width={60} height={6}>
      <StepPictureHost value={reader}><StoredPicture id="att-1" name="shot.png" /></StepPictureHost>
    </Box>,
    { width: 60, height: 6 },
  );
  const f = await term.settle();
  expect(f).toContain('shot.png');
  expect(asked).toEqual([]);
}, 60_000);
