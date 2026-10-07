/**
 * hoodyHomeDir — user-home lookup that actually works under Bun.
 *
 * Bun's `node:os` homedir() uses getpwuid() directly and ignores
 * process.env.HOME. Node's honors $HOME. Tests that override HOME in a
 * beforeEach therefore silently pollute the real ~/ under Bun. By routing
 * every ~/.hoody path through this one helper, tests can isolate with
 * process.env.HOME and the production path is unchanged (the shell sets
 * HOME, so the env-var branch returns the same value homedir() would).
 *
 * Also exports platformEnvHint() — gives the user a copy-pasteable env-var
 * assignment in their current shell syntax (bash/zsh vs PowerShell vs cmd).
 */
import { homedir } from 'node:os';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
export function hoodyHomeDir() {
    // Use `||` (truthy) not `??` (nullish) so an empty-string HOME also
    // falls through to homedir(). An empty HOME would otherwise resolve
    // `~/.hoody/...` to `.hoody/...` under the current working directory,
    // silently writing sessions into the shell's cwd.
    return process.env.HOME || homedir();
}
/**
 * The API base URL of the account this process acts for, as the CLI resolves it without flags:
 * HOODY_BASE_URL or HOODY_API_URL, else the CLI's saved config (`~/.hoody/config.json`: the
 * default profile's `baseUrl`, else the top-level one). undefined when neither names an http(s)
 * URL, or the file is missing or unreadable: the caller then uses the default platform.
 *
 * `hoody chat` uses it to reach the documentation assistant, and to link the documentation, of
 * the platform the account is on (platformDomain in ../domain-utils.ts).
 */
export function accountApiBaseUrl(env = process.env) {
    const usable = (value) => {
        if (typeof value !== 'string' || value.trim() === '' || value.length > 256)
            return undefined;
        try {
            const u = new URL(value.trim());
            if ((u.protocol !== 'http:' && u.protocol !== 'https:') || u.username || u.password)
                return undefined;
            return u.toString().replace(/\/$/, '');
        }
        catch {
            return undefined;
        }
    };
    const fromEnv = usable(env.HOODY_BASE_URL) ?? usable(env.HOODY_API_URL);
    if (fromEnv)
        return fromEnv;
    try {
        const parsed = JSON.parse(readFileSync(join(env.HOME || hoodyHomeDir(), '.hoody', 'config.json'), 'utf-8'));
        const selected = typeof parsed.defaultProfile === 'string' ? parsed.profiles?.[parsed.defaultProfile] : undefined;
        return usable(selected?.baseUrl) ?? usable(parsed.baseUrl);
    }
    catch {
        return undefined;
    }
}
/**
 * Return a user-facing snippet to persist an env var in the CURRENT shell.
 * Best-effort shell detection — we only need "probably PowerShell" vs
 * "probably POSIX" vs "probably cmd.exe" to be close enough for a hint.
 *
 *   platformEnvHint('HOODY_CHAT_PRIVATE', '1')
 *     → bash/zsh:   "export HOODY_CHAT_PRIVATE=1   (add to ~/.bashrc or ~/.zshrc)"
 *     → PowerShell: "$env:HOODY_CHAT_PRIVATE=\"1\"   (add to $PROFILE)"
 *     → cmd.exe:    "setx HOODY_CHAT_PRIVATE 1   (permanent across sessions)"
 */
export function platformEnvHint(name, value) {
    if (process.platform === 'win32') {
        // PowerShell sets PSModulePath; cmd.exe usually does not.
        if (process.env.PSModulePath) {
            return `$env:${name}="${value}"   (add to $PROFILE)`;
        }
        return `setx ${name} ${value}   (permanent across sessions)`;
    }
    return `export ${name}=${value}   (add to ~/.bashrc or ~/.zshrc)`;
}
