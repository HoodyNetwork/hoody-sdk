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
export declare function hoodyHomeDir(): string;
/**
 * The API base URL of the account this process acts for, as the CLI resolves it without flags:
 * HOODY_BASE_URL or HOODY_API_URL, else the CLI's saved config (`~/.hoody/config.json`: the
 * default profile's `baseUrl`, else the top-level one). undefined when neither names an http(s)
 * URL, or the file is missing or unreadable: the caller then uses the default platform.
 *
 * `hoody chat` uses it to reach the documentation assistant, and to link the documentation, of
 * the platform the account is on (platformDomain in ../domain-utils.ts).
 */
export declare function accountApiBaseUrl(env?: Record<string, string | undefined>): string | undefined;
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
export declare function platformEnvHint(name: string, value: string): string;
