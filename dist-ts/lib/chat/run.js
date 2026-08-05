/**
 * runChat — top-level dispatcher for `hoody chat` invocations. Handles the
 * one-shot path; delegates to ./repl.ts when no prompt is supplied.
 *
 * `hoody chat` asks Hoody's documentation assistant. There is no local model
 * and no API key: the question goes to the service, the service answers, and
 * this module renders the answer. That is the whole data flow.
 */
import { prepareChatsDir } from './prepare-dir.js';
import { createRenderer } from './markdown-renderer.js';
import { askHoody, renderSources, TRUNCATION_NOTICE } from './service-client.js';
import { docsLimiter } from './docs-singletons.js';
/**
 * One-shot entry point. With no prompt argument, falls through to the REPL.
 */
export async function runChat(args) {
    // Prepare the chats dir only when we may actually write to it. --private
    // and HOODY_CHAT_PRIVATE=1 must NOT touch disk, and an unwritable $HOME
    // shouldn't kill an otherwise-fine one-shot chat.
    const privateMode = args.opts.private === true || process.env.HOODY_CHAT_PRIVATE === '1';
    if (!privateMode) {
        try {
            await prepareChatsDir();
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            process.stderr.write(`hoody chat: could not prepare ${process.env.HOME ? `${process.env.HOME}/.hoody/chats` : '~/.hoody/chats'} (${msg}). Continuing without persistence.\n`);
        }
    }
    const prompt = args.promptParts.join(' ').trim();
    if (!prompt) {
        // No prompt → REPL mode. Piped stdin is acceptable — readline processes
        // lines until EOF.
        if (privateMode && args.opts.persist === true) {
            process.stderr.write('hoody chat: --private and --persist are mutually exclusive. Remove one.\n');
            process.exit(1);
        }
        const { runRepl } = await import('./repl.js');
        try {
            await runRepl({
                initialPrivate: privateMode,
                persist: args.opts.persist === true,
                // --new overrides --resume: the user asked for a fresh session
                // regardless of what resume would otherwise match.
                resume: args.opts.new === true ? undefined : args.opts.resume,
                acceptEndpointFlag: args.opts.acceptEndpoint,
                acceptEndpointEnv: process.env.HOODY_CHAT_ACCEPT_ENDPOINT,
                markdown: args.opts.markdown !== false,
                stream: args.opts.stream !== false,
            });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            process.stderr.write(`Error: ${msg}\n`);
            process.exit(1);
        }
        return;
    }
    const noStream = args.opts.stream === false; // Commander --no-stream
    const noMarkdown = args.opts.markdown === false; // Commander --no-markdown
    const renderer = createRenderer({ noMarkdown });
    const interactive = process.stdin.isTTY === true && process.stdout.isTTY === true;
    // A slow first token looks like a hang. stderr is separate from stdout, so
    // the notice never interleaves with the answer being written.
    const spinner = process.stderr.isTTY === true;
    if (spinner)
        process.stderr.write('\x1b[2m[hoody chat] asking…\x1b[0m\r');
    let cleared = false;
    const clearNotice = () => {
        if (spinner && !cleared) {
            process.stderr.write('\x1b[2K\r');
            cleared = true;
        }
    };
    const result = await askHoody({
        message: prompt,
        limiter: docsLimiter,
        acceptEndpointFlag: args.opts.acceptEndpoint,
        acceptEndpointEnv: process.env.HOODY_CHAT_ACCEPT_ENDPOINT,
        isTty: interactive,
        sessionOnly: privateMode,
        // Wire the confirmation the docs promise. Without a callback the gate can
        // only refuse, so an interactive user overriding HOODY_CHAT_URL never got
        // the prompt the privacy guide describes.
        onTtyPrompt: interactive
            ? async (origin) => {
                const { createInterface } = await import('node:readline');
                const rl = createInterface({ input: process.stdin, output: process.stdout });
                try {
                    const answer = await new Promise(resolve => rl.question(`hoody chat: send your question to ${origin}? [yes/no] `, resolve));
                    const a = answer.trim().toLowerCase();
                    return a === 'yes' || a === 'y';
                }
                finally {
                    rl.close();
                }
            }
            : undefined,
        // --no-stream buffers the whole answer and prints it once. The request is
        // identical either way: the service only speaks SSE.
        onDelta: noStream
            ? undefined
            : chunk => {
                clearNotice();
                renderer.write(chunk);
            },
    });
    clearNotice();
    if ('error' in result) {
        // Flush first: a failure that arrives MID-stream leaves already-received
        // text buffered in the renderer (partial line, open fence). Exiting without
        // end() drops it and leaves the terminal on an unterminated line.
        renderer.end();
        process.stderr.write(`hoody chat: ${result.message}\n`);
        process.exit(result.error === 'endpoint-not-accepted' ? 2 : 1);
    }
    if (noStream)
        renderer.write(result.text);
    // The notice is signalled by the flag, never streamed — otherwise it ends up
    // inside the caller's accumulated answer text.
    if (result.truncated)
        renderer.write(TRUNCATION_NOTICE);
    const citations = renderSources(result.sources);
    if (citations)
        renderer.write(citations);
    renderer.end();
}
