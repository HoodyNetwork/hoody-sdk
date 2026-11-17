// logic.ts picsOf: which pictures a step's result names. Only the image tool's successful JSON result, only files directly
// inside a folder named generated-images, never a path from anywhere else.
import { describe, expect, it } from 'vitest';
import { picsOf } from './logic';

const DIR = '/home/ada/.hoody/generated-images';
const out = (images: unknown, more: Record<string, unknown> = {}) => ({ output: JSON.stringify({ images, model: 'm', provider: 'p', prompt: 'a cat', ...more }) });

describe('picsOf', () => {
  it('reads the saved files of a generate_image result: path, file name, size', () => {
    expect(picsOf('generate_image', out([{ path: `${DIR}/cat-1.png`, width: 512, height: 512, bytes: 48213 }, { path: `${DIR}/cat-2.webp`, width: 1, height: 1, bytes: 0 }]))).toEqual({
      pics: [{ path: `${DIR}/cat-1.png`, name: 'cat-1.png', bytes: 48213 }, { path: `${DIR}/cat-2.webp`, name: 'cat-2.webp' }],
    });
  });
  it('another tool, a failed result, text that is no JSON, or an over-long result name nothing', () => {
    const good = out([{ path: `${DIR}/a.png` }]);
    expect(picsOf('bash', good)).toEqual({});
    expect(picsOf('generate_image', { ...good, is_error: true })).toEqual({});
    expect(picsOf('generate_image', { output: `saved ${DIR}/a.png` })).toEqual({});
    expect(picsOf('generate_image', { output: JSON.stringify({ images: [{ path: `${DIR}/a.png` }], pad: 'x'.repeat(70000) }) })).toEqual({});
    expect(picsOf('generate_image', { output: 5 })).toEqual({});
    expect(picsOf('generate_image', out('nope'))).toEqual({});
  });
  it.each([
    '/etc/passwd',
    '/home/ada/.ssh/id_ed25519',
    `${DIR}/../../.ssh/id_ed25519.png`,
    `${DIR}/sub/a.png`,
    `${DIR}/a.svg`,
    `${DIR}/a.png/`,
    `${DIR}/.hidden.png`,
    'generated-images/a.png',
    `${DIR}/a\nb.png`,
    `/home/./generated-images/a.png`,
    `${DIR}/a b.png`,
    'https://example.com/generated-images/a.png',
  ])('a path that is not one picture file inside the folder is never named: %j', (path) => {
    expect(picsOf('generate_image', out([{ path }]))).toEqual({});
  });
  it('keeps at most 8, each path once, and skips entries that are not objects with a path', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ path: `${DIR}/p${i}.png` }));
    expect(picsOf('generate_image', out([null, 7, { path: 3 }, many[0], many[0], ...many])).pics).toHaveLength(8);
  });
});
