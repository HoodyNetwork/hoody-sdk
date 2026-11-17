// The changes this copy of run-open-core.js has that the SDK's lib/run-open-core.js does not have yet, as
// [the SDK's text, this copy's text]; run-open.test.ts checks the copies differ by exactly these.
// Leftover terminals:
//   C1  a terminal the core made and could not prove closed (its DELETE not answered 2xx, 404 or 409) is never dropped
//       silently: a refusal after the create (notSent) and a confirmed stop carry `leftover`; discard(leftover) sends
//       only that DELETE and answers removed only on the same proof (else remove_unconfirmed).
export const SDK_CARRY: ReadonlyArray<readonly [string, string]> = [
  [
    "//     anything else, a failed read included.\n//\n",
    "//     anything else, a failed read included.\n//   - A terminal the core made and could not prove closed is never dropped silently: a refusal after the\n//     create (still `notSent`: the app never ran) and a confirmed stop carry `leftover` ({terminal_id,\n//     incarnation, computer?, launch_tag?}) when its DELETE was not proven (deleted, already gone 404 or\n//     already replaced 409). `discard(leftover)` sends only that DELETE: `removed` on the same proof, else\n//     `remove_unconfirmed`, and the caller keeps it.\n//\n"
  ],
  [
    "    several_apps: 'Several apps are open in that terminal. Pick one by its full handle.',\n  });\n",
    "    several_apps: 'Several apps are open in that terminal. Pick one by its full handle.',\n    removed: 'The terminal was closed.',\n    remove_unconfirmed: 'We couldn\\'t confirm the terminal was closed.',\n  });\n"
  ],
  [
    "    }\n\n    async function cleanup(n, incarnation) {\n      if (!INCARNATION.test(incarnation || '')) return;\n      await call(TN(n), 'DELETE', '/api/v1/terminal/' + n, { incarnation: incarnation });\n    }\n",
    "    }\n\n    // Whether terminal N at that incarnation is proven closed: deleted, already gone (404) or already replaced (409).\n    // Anything else (no answer, refused, a 5xx, never sent) may leave it open.\n    async function cleanup(n, incarnation) {\n      if (!INCARNATION.test(incarnation || '')) return false;\n      var a = await call(TN(n), 'DELETE', '/api/v1/terminal/' + n, { incarnation: incarnation });\n      return a.kind === 'answer' && ((a.status >= 200 && a.status < 300) || a.status === 404 || a.status === 409);\n    }\n\n    // A terminal that may still be open, as discard() takes it (plus the launch tag of the launch that made it).\n    function leftoverOf(n, incarnation, tag, comp) {\n      var lo = { terminal_id: n, incarnation: incarnation };\n      var c = comp || computer;\n      if (isObj(c)) lo.computer = { project: c.project, computer_id: computerIdOf(c) };\n      if (typeof tag === 'string' && tag) lo.launch_tag = tag;\n      return lo;\n    }\n\n    // Deletes terminal N; result r carries the leftover unless the delete is proven. Returns r.\n    async function closeOr(r, n, incarnation, tag) {\n      if (!(await cleanup(n, incarnation))) r.leftover = leftoverOf(n, incarnation, tag);\n      return r;\n    }\n\n    // Closes a leftover terminal (open() or close() reported it): only its DELETE, at its incarnation.\n    async function discard(lo) {\n      if (!isObj(lo) || !launchTerminal(lo.terminal_id) || typeof lo.incarnation !== 'string' || !INCARNATION.test(lo.incarnation)) {\n        return fail('invalid_handle', { notSent: true });\n      }\n      if (isObj(lo.computer) && !sameComputer(lo)) return fail('wrong_computer', { notSent: true });\n      if (await cleanup(lo.terminal_id, lo.incarnation)) return { ok: true, code: 'removed', message: fill('removed') };\n      return { ok: false, code: 'remove_unconfirmed', message: fill('remove_unconfirmed') };\n    }\n"
  ],
  [
    "    // Returns {n, incarnation} or a failure. Only a definite answer moves on to the next id.\n    async function createTerminal(req, opts) {\n      var taken = await takenTerminals();\n",
    "    // Returns {n, incarnation} or a failure. Only a definite answer moves on to the next id.\n    async function createTerminal(req, opts, tag) {\n      var taken = await takenTerminals();\n"
  ],
  [
    "          }\n          if (!okUser) {\n            await cleanup(n, inc);\n            return fail('unsafe_setup', { notSent: true });\n          }\n          // The answer names the shell it started; a kit that ignores the field (no echo) started another one.\n          if (req.shell === 'bash' && a.body.shell !== 'bash') {\n            await cleanup(n, inc);\n            return fail('shell_unavailable', { notSent: true });\n          }\n          return { ok: true, n: n, incarnation: inc };\n",
    "          }\n          if (!okUser) return closeOr(fail('unsafe_setup', { notSent: true }), n, inc, tag);\n          // The answer names the shell it started; a kit that ignores the field (no echo) started another one.\n          if (req.shell === 'bash' && a.body.shell !== 'bash') return closeOr(fail('shell_unavailable', { notSent: true }), n, inc, tag);\n          return { ok: true, n: n, incarnation: inc };\n"
  ],
  [
    "\n      var created = await createTerminal(req, opts);\n      if (!created.ok) return created;\n",
    "\n      var created = await createTerminal(req, opts, launchTag);\n      if (!created.ok) return created;\n"
  ],
  [
    "      var inc = created.incarnation;\n      if (opts.signal && opts.signal.aborted) {\n        await cleanup(n, inc);\n        return fail('cancelled', { notSent: true });\n      }\n\n",
    "      var inc = created.incarnation;\n      if (opts.signal && opts.signal.aborted) return closeOr(fail('cancelled', { notSent: true }), n, inc, launchTag);\n\n"
  ],
  [
    "      if (ex.definite) {\n        if (!ex.replaced) await cleanup(n, inc);\n        ex.result.details = details;\n",
    "      if (ex.definite) {\n        if (!ex.replaced) await closeOr(ex.result, n, inc, launchTag);\n        ex.result.details = details;\n"
  ],
  [
    "      }\n      // Cleanup only. A 409 means the terminal was already replaced: nothing of ours to delete.\n      await cleanup(h.terminal_id, h.incarnation);\n      return { ok: true, state: 'stopped', code: 'stopped', message: fill('stopped', { name: name }), handle: h };\n    }\n",
    "      }\n      // Cleanup only. A 409 means the terminal was already replaced: nothing of ours to delete. The app ended; a delete\n      // not proven leaves its terminal as a leftover.\n      var stopped = { ok: true, state: 'stopped', code: 'stopped', message: fill('stopped', { name: name }), handle: h };\n      if (!(await cleanup(h.terminal_id, h.incarnation))) stopped.leftover = leftoverOf(h.terminal_id, h.incarnation, h.launch_tag, h.computer);\n      return stopped;\n    }\n"
  ],
  [
    "      find: findOne,\n    });\n",
    "      find: findOne,\n      discard: discard,\n    });\n"
  ]
];

/** text with every carry applied (an entry whose SDK text is absent is skipped). */
export function carried(text: string): string {
  let out = text;
  for (const [from, to] of SDK_CARRY) if (out.includes(from)) out = out.replace(from, () => to);
  return out;
}
