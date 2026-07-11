/**
 * runChat — top-level dispatcher for `hoody chat` invocations. Handles the
 * one-shot path; delegates to ./repl.ts when no prompt is supplied.
 *
 * Initialization order is LOAD-BEARING:
 *   1. prepareChatsDir() — idempotent, runs before any disk write.
 *   2. resolveProvider('chat') — fail fast with exit(2) on no-config.
 *      MUST happen before any network call; prevents a missing-key path
 *      from making an unintended network request.
 *   3. Build the system prompt with selective reference injection.
 *   4. Wrap --context as <user-context untrusted="true">.
 *   5. Stream the completion to stdout via the markdown renderer.
 */

import { resolveProvider, isResolverError, formatResolverError } from '../ai/provider-resolve.js';
import { streamCompletion, completeOnce } from '../ai/openai-client.js';
import type { Msg } from '../ai/types.js';
import { buildSystemPrompt } from './system-prompt.js';
import { prepareChatsDir } from './prepare-dir.js';
import { createRenderer } from './markdown-renderer.js';
import {
  executeDocsSearch,
  type DocsSearchResult,
} from './docs-search-tool.js';
import { dispatchTurn } from './tool-dispatch.js';
import { detectTrigger, escapeXmlLike } from './trigger-parse.js';
import { docsLimiter, triggerDedupe } from './docs-singletons.js';
export { escapeXmlLike }; // re-export for existing unit tests

export interface RunChatOptions {
  promptParts: string[];
  opts: {
    model?: string;
    stream?: boolean;
    markdown?: boolean;
    persist?: boolean;
    new?: boolean;
    resume?: string | boolean;
    private?: boolean;
    tools?: boolean;
    context?: string;
    acceptEndpoint?: string;
    maxTokens?: number;
    temperature?: number;
  };
}

const USER_CONTEXT_MAX_CHARS = 1000;

// docsLimiter + triggerDedupe are process-wide singletons from
// ./docs-singletons.js so runChat and runRepl share ONE rate bucket and
// ONE dedupe cache per process.

/**
 * One-shot entry point. With no prompt argument, falls through to the REPL.
 */
export async function runChat(args: RunChatOptions): Promise<void> {
  // Bootstrap: prepare the chats dir only when we may actually write to it.
  // --private + HOODY_CHAT_PRIVATE=1 must NOT touch disk, and an unwritable
  // $HOME shouldn't kill an otherwise-fine one-shot chat. prepareChatsDir
  // is idempotent, so session-write sites call it again defensively.
  const privateMode =
    args.opts.private === true || process.env.HOODY_CHAT_PRIVATE === '1';
  if (!privateMode) {
    try {
      await prepareChatsDir();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(
        `hoody chat: could not prepare ${
          process.env.HOME ? `${process.env.HOME}/.hoody/chats` : '~/.hoody/chats'
        } (${msg}). Continuing without persistence.\n`,
      );
    }
  }

  // Validate numeric flags BEFORE any provider resolution or network activity.
  // A bad --max-tokens/--temperature must fail-fast with exit 64 (usage error)
  // rather than leak through to an acceptance prompt or HTTP call.
  const maxTokens = validateFiniteInt('max-tokens', args.opts.maxTokens, 1024, 1, 128_000);
  const temperature = validateFiniteFloat('temperature', args.opts.temperature, 0.3, 0, 2);

  const provider = resolveProvider('chat');
  if (isResolverError(provider)) {
    process.stderr.write(formatResolverError(provider));
    process.exit(2);
  }

  // LLM endpoint acceptance — mirrors the docs-search gate to ensure API keys
  // are never forwarded to an unrecognized origin. Built-in tiers
  // (api.minimax.io, ai.hoody.com) and local/RFC1918 origins pass silently.
  //
  // TTY gate: require BOTH stdin and stdout to be TTY. Treating stdout.isTTY
  // alone as interactive lets piped stdin answer "yes" to the prompt (and
  // stealing REPL's first line), so we refuse to prompt unless the user is
  // truly in front of an interactive terminal. Private mode bypasses the
  // accept file entirely — no disk reads/writes.
  {
    const { checkAcceptance, confirmAcceptance } = await import('./endpoint-accept.js');
    const interactive = process.stdin.isTTY === true && process.stdout.isTTY === true;
    const provStatus = await checkAcceptance(provider.url, {
      flagValue: args.opts.acceptEndpoint,
      envValue: process.env.HOODY_CHAT_ACCEPT_ENDPOINT,
      isTty: interactive,
      sessionOnly: privateMode,
    });
    if (provStatus.status === 'needs-tty-prompt') {
      const { createInterface } = await import('node:readline');
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const accepted = await new Promise<boolean>(resolve => {
        rl.question(
          `hoody chat: Allow connecting to LLM provider at ${provStatus.origin}? [yes/no] `,
          answer => {
            rl.close();
            resolve(answer.trim().toLowerCase() === 'yes' || answer.trim().toLowerCase() === 'y');
          },
        );
      });
      if (!accepted) {
        process.stderr.write(
          `hoody chat: LLM provider at ${provStatus.origin} not accepted. Exiting.\n`,
        );
        process.exit(2);
      }
      if (!privateMode) {
        await confirmAcceptance(provStatus.origin);
      }
    } else if (provStatus.status === 'refused') {
      process.stderr.write(
        `hoody chat: LLM endpoint ${provStatus.origin} not accepted.\n` +
        `  Re-run with --accept-endpoint ${provStatus.origin} to allow it.\n`,
      );
      process.exit(2);
    }
  }

  // Allow --model to override the tier-resolved model.
  const model = args.opts.model ?? provider.model;

  const rawPrompt = args.promptParts.join(' ').trim();
  if (!rawPrompt) {
    // No prompt → REPL mode. Piped stdin is acceptable — readline will
    // process lines until EOF. Fully-closed stdin without TTY exits cleanly
    // via readline's close event. The renderer, docs tool, resolver, and
    // tier acceptance built for the one-shot path are reused there.
    const { runRepl } = await import('./repl.js');
    const toolsEnabled =
      args.opts.tools !== false && process.env.HOODY_CHAT_DOCS_TOOL !== '0';
    if (privateMode && args.opts.persist === true) {
      process.stderr.write(
        'hoody chat: --private and --persist are mutually exclusive. Remove one.\n',
      );
      process.exit(1);
    }
    try {
      await runRepl({
        provider,
        model,
        maxTokens: args.opts.maxTokens ?? 1024,
        temperature: args.opts.temperature ?? 0.3,
        initialToolsEnabled: toolsEnabled,
        initialPrivate: privateMode,
        persist: args.opts.persist === true,
        // --new overrides --resume: user asked for a fresh session
        // regardless of what resume would otherwise match.
        resume: args.opts.new === true ? undefined : args.opts.resume,
        acceptEndpointFlag: args.opts.acceptEndpoint,
        acceptEndpointEnv: process.env.HOODY_CHAT_ACCEPT_ENDPOINT,
        contextPreface: args.opts.context,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Error: ${msg}\n`);
      process.exit(1);
    }
    return;
  }

  // Tool enablement: HOODY_CHAT_DOCS_TOOL env (default on) + --no-tools flag.
  // The REPL adds a `/tool on|off` slash command on top of these gates.
  const toolsEnabled =
    args.opts.tools !== false && // Commander --no-tools flips this to false
    process.env.HOODY_CHAT_DOCS_TOOL !== '0';

  // @hoody.com client-side pre-parse. Fires BEFORE provider network call,
  // AFTER resolver success (so the missing-key path makes zero fetches).
  // Bounded-query guard: stripped query < 8 chars → skip injection.
  let docsPrefetch: DocsSearchResult | undefined;
  let prefetchedQuery = '';
  if (toolsEnabled) {
    const trig = detectTrigger({ userMessage: rawPrompt });
    if (trig.hit) {
      if (trig.query.length >= 8) {
        prefetchedQuery = trig.query;
        const cached = triggerDedupe.get(prefetchedQuery);
        if (cached) {
          docsPrefetch = cached;
        } else {
          // UX hint: the pre-fetch can take several seconds against a slow
          // docs service. Emit a dim notice to stderr so the user doesn't
          // see a silent hang. stderr/stdout are separate, so the first LLM
          // delta on stdout doesn't need to clear it.
          if (process.stderr.isTTY === true) {
            process.stderr.write('\x1b[2m[hoody chat] searching docs…\x1b[0m\r');
          }
          docsPrefetch = await executeDocsSearch({
            query: prefetchedQuery,
            limiter: docsLimiter,
            acceptEndpointFlag: args.opts.acceptEndpoint,
            acceptEndpointEnv: process.env.HOODY_CHAT_ACCEPT_ENDPOINT,
            isTty: process.stdin.isTTY === true && process.stdout.isTTY === true,
            sessionOnly: privateMode,
          });
          // Clear the progress line.
          if (process.stderr.isTTY === true) {
            process.stderr.write('\x1b[2K\r');
          }
          triggerDedupe.set(prefetchedQuery, docsPrefetch);
        }
      } else {
        // Non-TTY: refuse silently. The REPL handles the TTY prompt path.
        process.stderr.write(
          'hoody chat: @hoody.com trigger detected but no query (< 8 chars) — skipping fetch.\n',
        );
      }
    }
  }

  // Build system prompt (SECURITY_HEADER + CORE_INSTRUCTIONS + BLURB + group
  // index only) and the per-turn retrieval block. The selective reference
  // injection goes in the USER message as <retrieved-context>, NOT in the
  // system role — keeps the guardrail immutable across turns.
  const { systemPrompt, retrievalText } = buildSystemPrompt({ userMessage: rawPrompt });

  // Wrap --context as UNTRUSTED user data prefix (capped + escaped so a
  // crafted `</user-context>` cannot break out of the wrapper).
  const ctxRaw = args.opts.context?.slice(0, USER_CONTEXT_MAX_CHARS) ?? '';
  const ctxBlock = ctxRaw.length > 0
    ? `<user-context untrusted="true">\n${escapeXmlLike(ctxRaw)}\n</user-context>\n\n`
    : '';

  const retrievalBlock = retrievalText
    ? `<retrieved-context source="cli-reference">\n${retrievalText}\n</retrieved-context>\n\n`
    : '';

  // If we prefetched docs, inject as <hoody-docs-result untrusted="true">
  // in the user message — model is instructed (§system-prompt) NOT to re-call
  // the tool when this block is present.
  const docsBlock = docsPrefetch
    ? `<hoody-docs-result untrusted="true" source="https://docs.hoody.com" query=${JSON.stringify(prefetchedQuery)}>\n${
        'error' in docsPrefetch
          ? `<error code="${docsPrefetch.error}">${escapeXmlLike(docsPrefetch.message)}</error>`
          : escapeXmlLike(docsPrefetch.text)
      }\n</hoody-docs-result>\n\n`
    : '';

  const userContent = `${retrievalBlock}${docsBlock}${ctxBlock}${rawPrompt}`;

  const messages: Msg[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
  ];

  const noStream = args.opts.stream === false; // Commander '--no-stream' flips this to false
  const noMarkdown = args.opts.markdown === false; // Commander '--no-markdown' flips this to false
  const renderer = createRenderer({ noMarkdown });

  try {
    if (noStream) {
      // --no-stream: send stream:false to the provider (completeOnce path).
      // NOT equivalent to streamCompletion + buffer — that would still request
      // text/event-stream and consume the provider's streaming budget.
      //
      // Contract note: `completeOnce` does NOT drive tool_calls. Buffered
      // chat therefore cannot use `hoody_docs_search` (the docs-search tool
      // is only available in streaming mode via the dispatcher). If the
      // caller enabled tools AND asked for non-streaming, surface a one-time
      // stderr notice so they aren't surprised when docs aren't consulted.
      if (toolsEnabled) {
        process.stderr.write(
          'hoody chat: --no-stream disables the docs-search tool (tool_calls require streaming mode). ' +
          'Drop --no-stream, or pass --no-tools to silence this notice.\n',
        );
      }
      const { text } = await completeOnce({
        url: provider.url,
        key: provider.key,
        model,
        messages,
        maxTokens,
        temperature,
        timeoutMs: 60_000,
      });
      renderer.write(text);
      renderer.end();
      return;
    }

    // Streaming path: uses the tool-dispatch orchestrator so the model's
    // tool_calls round-trip through executeDocsSearch under the same
    // MAX_TOOL_CALLS_PER_TURN=1 invariant as the @hoody.com pre-parse.
    await dispatchTurn({
      url: provider.url,
      key: provider.key,
      model,
      messages,
      maxTokens,
      temperature,
      onDelta: chunk => renderer.write(chunk),
      toolsEnabled,
      limiter: docsLimiter,
      acceptEndpointFlag: args.opts.acceptEndpoint,
      acceptEndpointEnv: process.env.HOODY_CHAT_ACCEPT_ENDPOINT,
      isTty: process.stdin.isTTY === true && process.stdout.isTTY === true,
      sessionOnly: privateMode,
    });
    renderer.end();
  } catch (err) {
    // Surface as a clean one-line stderr message — no stack trace.
    // Propagation to the root unhandledRejection handler would print the stack,
    // which leaks bundler paths and is unfriendly for users.
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${msg}\n`);
    process.exit(1);
  }
}

/** Parse a positive integer flag with range validation; exit 64 on bad input. */
function validateFiniteInt(
  flag: string,
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined || value === null) return fallback;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) {
    process.stderr.write(
      `Error: --${flag} must be an integer in [${min}, ${max}] (got ${JSON.stringify(value)})\n`,
    );
    process.exit(64);
  }
  return n;
}

/** Parse a float flag with range validation; exit 64 on bad input. */
function validateFiniteFloat(
  flag: string,
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined || value === null) return fallback;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    process.stderr.write(
      `Error: --${flag} must be a number in [${min}, ${max}] (got ${JSON.stringify(value)})\n`,
    );
    process.exit(64);
  }
  return n;
}
