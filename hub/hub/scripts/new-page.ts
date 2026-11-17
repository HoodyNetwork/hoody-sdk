// bun run hub:new-page <id> --layout <layout> [--title "Title"]
// Copies hub/templates/page-<layout>/ into hub/src/pages/<id>/ and fills in the id and title.
import fs from 'node:fs';
import path from 'node:path';
import { HUB, pageDir, parseArgs, str } from './lib';

const LAYOUTS = ['list-detail', 'table', 'detail', 'settings', 'dashboard', 'wizard'];

function pascal(id: string): string {
  return id
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
}

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  const id = args._[0];
  const layout = str(args.layout) ?? 'list-detail';
  if (!id || !/^[a-z][a-z0-9-]{0,39}$/.test(id)) {
    console.error('usage: bun run hub:new-page <id> --layout <layout> [--title "Title"]   (id: lowercase letters, digits, dashes)');
    return 2;
  }
  if (!LAYOUTS.includes(layout)) {
    console.error(`unknown layout "${layout}"; one of: ${LAYOUTS.join(', ')}`);
    return 2;
  }
  const title = str(args.title) ?? pascal(id).replace(/([a-z])([A-Z])/g, '$1 $2');
  const src = path.join(HUB, 'templates', `page-${layout}`);
  if (!fs.existsSync(src)) {
    console.error(`no template for "${layout}" yet (hub/templates/page-${layout}); start from --layout list-detail`);
    return 2;
  }
  const dst = pageDir(id);
  if (fs.existsSync(dst)) {
    console.error(`hub/src/pages/${id} already exists; nothing written`);
    return 1;
  }
  const fill = (text: string) =>
    text.replaceAll('__ID__', id).replaceAll('__TITLE__', title.replaceAll('"', '\\"')).replaceAll('__PASCAL__', pascal(id));
  const copy = (from: string, to: string) => {
    fs.mkdirSync(to, { recursive: true });
    for (const e of fs.readdirSync(from, { withFileTypes: true })) {
      const a = path.join(from, e.name);
      const b = path.join(to, e.name);
      if (e.isDirectory()) copy(a, b);
      else fs.writeFileSync(b, fill(fs.readFileSync(a, 'utf8')));
    }
  };
  copy(src, dst);
  console.log(`created hub/src/pages/${id}/ from the ${layout} template`);
  console.log('');
  console.log(`  preview:  bun run hub:dev --page ${id}`);
  console.log(`  check:    bun run hub:check --page ${id}`);
  console.log(`  shots:    bun run hub:shots --page ${id}`);
  console.log('');
  console.log('Terminal (the same page runs in the terminal Hub; src/term/README.md):');
  console.log(`  look:     cd hub && NODE_ENV=test bun scripts/term/render.ts --page ${id}   (80x24 and 120x40: --cols/--rows)`);
  console.log(`  decide:   the template view is kit-only, so it draws as it is; write view.term.tsx only for a part the`);
  console.log(`            terminal cannot show (bun scripts/term/new.ts hub/src/pages/${id}/<file>), or hand the page`);
  console.log(`            off with \`handoff: { reason }\` in page.ts (src/term/docs/handoff.md)`);
  console.log(`  record:   hub:check --page ${id} fails (no golden, no allowance) until`);
  console.log(`            NODE_ENV=test bun scripts/term/check.ts --page ${id} --update, and you review the frames it writes`);
  console.log('');
  console.log(`It lands dark (status 'hidden' in page.ts).`);
  return 0;
}

process.exit(main());
