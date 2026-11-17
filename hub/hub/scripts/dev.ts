// bun run dev [--page <id>] [--port <n>] [--agent <name>]   (from the package root, hub/)
// Fixtures-mode Vite on a free port: the router keeps that page plus the shell, and the dev
// toolbar switches its fixture states. Cache in the work dir (HUB_WORK_DIR, else node_modules/.cache/hub-work/<agent>/). Stop it with Ctrl-C or
// by killing the printed PID.
import fs from 'node:fs';
import path from 'node:path';
import { agentName, assertPage, parseArgs, startDevServer, str } from './lib';

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const agent = agentName(args);
  const page = str(args.page) ? assertPage(str(args.page)) : undefined;
  const port = str(args.port) ? Number(args.port) : undefined;
  const server = await startDevServer({ page, agent, port, quiet: false });
  let pagePath = '';
  if (page) {
    const manifest = fs.readFileSync(path.join('hub', 'src', 'pages', page, 'page.ts'), 'utf8');
    pagePath = /path:\s*'([^']+)'/.exec(manifest)?.[1] ?? `/${page}`;
  }
  console.log('');
  console.log(`hub:dev ${page ? `page ${page}` : 'all pages'}  pid ${server.pid}`);
  console.log(`  ${server.url}/#${pagePath || '/'}`);
  console.log(`  kit gallery: ${server.url}/#/_kit`);
  console.log('');
  const stop = async () => {
    await server.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());
  await new Promise(() => undefined);
  return 0;
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
