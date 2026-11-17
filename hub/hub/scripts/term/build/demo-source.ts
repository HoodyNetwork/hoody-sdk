// What the demo world's recorder (scripts/term/demo-record.ts) and its tests share. No import of hub/src and no runner.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const DEMO_WORLD_FILE = path.join(import.meta.dir, 'demo-world.gen.json');
/** The demo mount's proxy domain (src/term/app/boot.demo.ts DEMO_PROXY_DOMAIN; demo-client.term.test.ts holds them equal). */
export const DEMO_DOMAIN = 'demo.invalid';

/** sha256 over every fixture source the recording reads (the world, core's rules, each page's fixtures), by path. */
export function demoSourceHash(src: string): string {
  const files: string[] = [];
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else if (/(^|[./-])fixtures?([./-][\w.-]*)?\.tsx?$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) files.push(f);
    }
  };
  walk(src);
  files.push(path.join(src, 'core', 'world.ts'));
  const h = crypto.createHash('sha256');
  for (const f of [...new Set(files)].sort()) h.update(path.relative(src, f) + '\0').update(fs.readFileSync(f)).update('\0');
  return h.digest('hex');
}
