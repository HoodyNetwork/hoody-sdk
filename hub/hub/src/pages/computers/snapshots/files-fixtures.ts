// Fake files-program answers for the preview (Files as .zip): every folder counts under the limit except /var, and a small
// folder tree for the picker. Spread into the computers page's fixture states with snapshotRules.
import { answers, reply, type FixtureRequest, type FixtureRule } from '@core';
import { countRoute, folderRoute, rootRoute } from './files';

const TREE: Record<string, string[]> = { '/': ['root', 'home', 'etc', 'var', 'tmp'], '/root': ['code', 'notes'], '/root/code': ['site', 'tools'], '/home': ['dev'], '/etc': ['nginx', 'ssh'] };
const pathOf = (r: FixtureRequest, skip: number) => '/' + (r.path.split('?')[0] ?? '').split('/').slice(skip).map(decodeURIComponent).join('/');

export function filesRules(): FixtureRule[] {
  return [
    reply(rootRoute, () => answers.ok({ breadcrumb: '', paths: (TREE['/'] ?? []).map((name) => ({ path_type: 'Dir', name, mtime: 0, size: 0 })), allow_upload: false, allow_delete: false })),
    reply(countRoute, (r: FixtureRequest) =>
      answers.ok(pathOf(r, 5) === '/var' ? { total_scanned: 100_001, truncated: true, count: 0, entries: [] } : { total_scanned: 120, truncated: false, count: 0, entries: [] })),
    reply(folderRoute, (r: FixtureRequest) => {
      const p = pathOf(r, 4);
      return answers.ok({ path: p, count: 0, entries: (TREE[p] ?? []).map((name) => ({ name, is_dir: true, size: 0 })) });
    }),
  ];
}
