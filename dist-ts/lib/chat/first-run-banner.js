/**
 * first-run-banner — one-time "storage defaults" hint shown before the
 * FIRST interactive REPL prompt ever. Gated by a zero-byte marker file.
 *
 * Shown ONLY when:
 *   - process.stdout is a TTY (interactive session)
 *   - ~/.hoody/chats/.seen-privacy-banner does NOT exist
 *
 * After display, the marker file is created so the banner never shows
 * again for this user. The marker is a UX gate, NOT a privacy guarantee
 * — privacy is enforced by `--private` / `HOODY_CHAT_PRIVATE=1` / `/private`.
 */
import { open } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { hoodyHomeDir, platformEnvHint } from './home-dir.js';
import { prepareChatsDir } from './prepare-dir.js';
function markerPath() {
    return join(hoodyHomeDir(), '.hoody', 'chats', '.seen-privacy-banner');
}
export function hasSeenBanner() {
    return existsSync(markerPath());
}
/** Write the zero-byte marker file atomically. Best-effort. */
async function writeMarker() {
    await prepareChatsDir();
    try {
        const fh = await open(markerPath(), 'wx', 0o600);
        await fh.close();
    }
    catch (e) {
        // EEXIST is fine (concurrent creation); anything else is best-effort.
        if (e?.code !== 'EEXIST') {
            process.stderr.write(`[hoody chat] Could not write banner marker: ${e?.message ?? e}\n`);
        }
    }
}
function renderBanner() {
    const cyan = chalk.cyan;
    const bold = chalk.bold;
    const green = chalk.green;
    const yellow = chalk.yellow;
    const dim = chalk.dim;
    const row = (icon, label, cmd) => `  ${icon}  ${label.padEnd(20)} ${cmd}`;
    return [
        '',
        `  ${bold.cyan('hoody chat')}  ${dim('·')}  ${bold.green('Welcome ✨')}`,
        '',
        `  ${bold('Privacy by default.')} ${dim('Sessions live in memory only and vanish')}`,
        `  ${dim('when you exit — opt in to persistence with')} ${green('--persist')}${dim('.')}`,
        '',
        `  ${bold('Privacy controls')}`,
        row(yellow('→'), 'This REPL only', green('/private')),
        row(yellow('→'), 'This invocation', green('--private')),
        row(yellow('→'), 'Every invocation', platformEnvHint('HOODY_CHAT_PRIVATE', '1')),
        '',
        `  ${bold('Sessions')}`,
        row(cyan('•'), 'Persist sessions', green('hoody chat --persist')),
        row(cyan('•'), 'Wipe everything', green('hoody chat sessions delete --all -y')),
        '',
        `  ${dim('Commands:')} ${cyan('hoody chat --help')}  ${dim('·')}  ${dim('In-REPL:')} ${cyan('/help')}  ${dim('·')}  ${dim('Exit:')} ${cyan('/exit')} ${dim('or Ctrl-C ×2')}`,
        '',
    ].join('\n');
}
/**
 * Show the banner if we haven't before. After showing, write the marker.
 * Safe to call unconditionally — the gate is internal.
 */
export async function showBannerIfNeeded(opts = {}) {
    const out = opts.out ?? process.stdout;
    const isTty = out.isTTY === true;
    const interactive = opts.isInteractive ?? isTty;
    if (!opts.force && !interactive)
        return false;
    if (!opts.force && hasSeenBanner())
        return false;
    out.write(renderBanner());
    await writeMarker();
    return true;
}
/** Unit-test helper: returns banner text without side-effects. */
export function getBannerText() {
    return renderBanner();
}
