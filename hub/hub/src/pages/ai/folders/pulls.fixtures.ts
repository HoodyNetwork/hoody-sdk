// Fake agent answers for a folder's Pull requests and Issues, for the preview and the tests: two pull requests (one
// open, one merged), two issues, and each send answered as the agent does (a 200 carries gh's output with the new link; a
// ran-but-failed gh is 502 git_command_failed; a timed-out gh is 503 with timed_out). Names from the fixture world (Ada).
import { answers, reply, type FixtureAnswer, type FixtureRequest, type FixtureRule } from '@core';
import { prRoutes } from './pulls';
import { repoRoutes } from './routes';

// Records, not UI text: GitHub's own titles, built positionally.
const pull = (number: number, title: string, state: string, author: string, head: string) =>
  ({ number, title, state, draft: state === 'draft', merged: state === 'merged', author, head, url: `https://github.com/ada/shop/pull/${number}` });
const issue = (number: number, title: string, state: string, author: string) => ({ number, title, state, author, url: `https://github.com/ada/shop/issues/${number}` });
export const PULLS = [pull(12, 'Read the port from the environment', 'open', 'ada', 'try-port'), pull(9, 'Add the start script', 'merged', 'ada', 'start')];
export const ISSUES = [issue(31, 'Port is fixed at 8080', 'open', 'grace'), issue(30, 'Docs are old', 'closed', 'ada')];
/** gh's own words on a ran-but-failed create (the agent's details.output). */
export const GH_REFUSAL = 'GraphQL: Issues are disabled for this repo';

/** How a send answers: made (200), the command ran and failed (502 git_command_failed), timed out (503 timed_out), lost
 *  (5xx without proof, or no answer at all), a 200 that does not say gh succeeded (an older agent: success false, or cut
 *  short), refused before anything ran (400; the account store unreadable, 503), or an account failure. */
export type SendAnswer = 'made' | 'cmdFailed' | 'timedOut' | 'lost' | 'network' | 'okNotRan' | 'okCutShort' | 'badRequest' | 'storeUnavailable' | 'notLinked';
const sendAnswer = (a: SendAnswer, made: () => FixtureAnswer): FixtureAnswer => {
  if (a === 'cmdFailed') return { status: 502, body: { code: 'git_command_failed', message: GH_REFUSAL, details: { exit_code: 1, output: GH_REFUSAL } } };
  if (a === 'timedOut') return { status: 503, body: { code: 'service_unavailable', details: { timed_out: true } } };
  if (a === 'lost') return answers.pending5xx(502);
  if (a === 'network') return answers.lost(50);
  if (a === 'okNotRan') return answers.ok({ status: 'ok', success: false, exit_code: 1, output: '' });
  if (a === 'okCutShort') return answers.ok({ status: 'ok', success: true, timed_out: true, output: '' });
  if (a === 'notLinked') return answers.refused(409, 'github_not_linked');
  if (a === 'badRequest') return answers.refused(400, 'bad_request');
  if (a === 'storeUnavailable') return answers.refused(503, 'github_store_unavailable');
  return made();
};
const ran = (output: string) => answers.ok({ status: 'ok', success: true, exit_code: 0, timed_out: false, output });

export interface PrOpts {
  issue?: SendAnswer;
  pull?: SendAnswer;
  checkout?: SendAnswer;
  merge?: SendAnswer;
  /** Issues listed after a create (the list a Check reads), in place of ISSUES. */
  issues?: () => readonly Record<string, unknown>[];
  /** Pull requests listed, read at each request (a merge that shows later). */
  pulls?: () => readonly Record<string, unknown>[];
  /** The folder's repository as the identity read answers it, read at each request (a folder repointed later); in place of
   *  the folder fixtures' ada/shop. */
  identity?: () => { owner: string; repo: string };
  /** Tests only: the pulls list answers once this settles (a list still on its way). */
  pullsGate?: () => Promise<void>;
  /** Tests only: sees each request as it arrives. */
  onSend?: (r: FixtureRequest) => void;
}

const byState = (rows: readonly Record<string, unknown>[], state: string | undefined) =>
  rows.filter((r) => state === 'all' || (state === 'closed' ? r.state === 'closed' || r.state === 'merged' : r.state === 'open' || r.state === 'draft'));

export function prRules(o: PrOpts = {}): FixtureRule[] {
  const seen = (r: FixtureRequest) => { o.onSend?.(r); };
  return [
    ...(o.identity ? [reply(repoRoutes.identity, (r) => { seen(r); const i = o.identity!(); return answers.ok({ status: 'ok', ...i, full_name: `${i.owner}/${i.repo}` }); })] : []),
    reply(prRoutes.pulls, async (r) => { seen(r); if (o.pullsGate) await o.pullsGate(); return answers.ok({ status: 'ok', pulls: byState(o.pulls ? o.pulls() : PULLS, r.query.state) }); }),
    reply(prRoutes.issues, (r) => { seen(r); return answers.ok({ status: 'ok', issues: byState(o.issues ? o.issues() : ISSUES, r.query.state) }); }),
    reply(prRoutes.createIssue, (r) => { seen(r); return sendAnswer(o.issue ?? 'made', () => ran('Creating issue in ada/shop\n\nhttps://github.com/ada/shop/issues/32\n')); }),
    reply(prRoutes.createPull, (r) => { seen(r); return sendAnswer(o.pull ?? 'made', () => ran('https://github.com/ada/shop/pull/13\n')); }),
    reply(prRoutes.checkoutPull, (r) => { seen(r); return sendAnswer(o.checkout ?? 'made', () => ran('HEAD is now at 1a2b3c4 Read the port from the environment\n')); }),
    reply(prRoutes.mergePull, (r) => { seen(r); return sendAnswer(o.merge ?? 'made', () => ran('✓ Merged pull request #12\n')); }),
  ];
}
