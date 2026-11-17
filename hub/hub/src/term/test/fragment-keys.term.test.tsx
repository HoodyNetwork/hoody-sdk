// The compat runtime opens fragments among an element's children (dom.ts flatChildren). Children.toArray keys every
// level from ".0", so the fragment's children are re-keyed under the fragment's key: an element followed by a fragment
// (PlanCard: head, then `<>price lead…</>`) draws every child once and logs no duplicate-key warning.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../prim/testing';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

test('children after a fragment keep distinct keys and all draw', async () => {
  const seen: string[] = [];
  const real = console.error;
  console.error = (...a: unknown[]) => { seen.push(a.map(String).join(' ')); };
  try {
    t = await drawTest(
      <div>
        <div>HEAD</div>
        <>
          <p>PRICE</p>
          {false}
          <p>LEAD</p>
          <><p>DEEP</p></>
        </>
        <div>TAIL</div>
      </div>, { width: 30, height: 8 });
    const f = await t.settle();
    for (const w of ['HEAD', 'PRICE', 'LEAD', 'DEEP', 'TAIL']) expect(f.split(w).length - 1).toBe(1);
    expect(seen.filter((e) => /same key/.test(e))).toEqual([]);
  } finally {
    console.error = real;
  }
});
