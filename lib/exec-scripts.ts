/**
 * Exec scripts service extensions — module augmentation + prototype patching.
 *
 * Architecture:
 *   This module extends the auto-generated ScriptsService with high-level
 *   helpers (listFiles, readFile, writeFile, deleteFile) without modifying
 *   the generated code. It uses two TypeScript mechanisms:
 *
 *   1. `declare module` augmentation: adds new method signatures to
 *      ScriptsService's type so callers see them with full type safety.
 *   2. Prototype patching at import time: `patchExecScriptsServicePrototype()`
 *      is called as a side-effect of importing this module, attaching the
 *      actual implementations to ScriptsService.prototype.
 *
 * One action, one name; the content family is an option, `kind`:
 *   - 'file' (default) — a generic file, path used as given
 *   - 'markdown' — .md, auto-appends the extension, skips validation
 *   - 'schema' — .schema.json, auto-appends the extension, parses/serializes JSON
 *   - 'openapi' — .openapi.json, same as schema with a different extension
 *
 * All path arguments pass through assertBasePath (from exec-path-utils.ts) to
 * prevent directory traversal before reaching the generated service layer.
 */

import { ScriptsService } from '../generated/exec/scripts.service.js';
import type {
  ExecScriptsDeleteResponse,
  ExecScriptsListResponse,
  ExecScriptsReadResponse,
  ExecScriptsWriteResponse,
} from '../generated/types.js';
import { assertBasePath, decodePathRepeatedly } from './exec-path-utils.js';

/**
 * Type aliases extracted via `Parameters<>` from the generated ScriptsService methods.
 * This pattern keeps these types automatically in sync with the generated code —
 * if the generated method signatures change, these aliases follow without manual updates.
 */
type ListScriptsOptions = Exclude<Parameters<ScriptsService['list']>[0], undefined>;
type ReadScriptOptions = Exclude<Parameters<ScriptsService['read']>[0], undefined>;
type DeleteScriptOptions = Exclude<Parameters<ScriptsService['delete']>[0], undefined>;
type WriteScriptPayload = Parameters<ScriptsService['write']>[0];

export type ExecScriptsTemplateVars = Parameters<ScriptsService['write']>[2];
export type ExecScriptsRequestOptions = Parameters<ScriptsService['write']>[1];
/** The content family a helper works on: a generic file, markdown, a schema, or an OpenAPI document. */
export type ExecScriptFileKind = 'file' | 'markdown' | 'schema' | 'openapi';
/** The kinds whose content is JSON: read parses it, write serializes it. */
export type ExecScriptJsonKind = 'schema' | 'openapi';
export type ExecReadFileOptions = Omit<ReadScriptOptions, 'path'> & { kind?: ExecScriptFileKind };
export type ExecListFilesOptions = Omit<ListScriptsOptions, 'metadata'> & {
  metadata?: boolean | string;
  kind?: ExecScriptFileKind;
};
export type ExecDeleteFileOptions = Omit<DeleteScriptOptions, 'path' | 'confirm'> & {
  confirm?: string | boolean;
  kind?: ExecScriptFileKind;
};
export interface ExecWriteFileOptions {
  createDirs?: boolean;
  validate?: boolean;
  kind?: 'file' | 'markdown';
}
export interface ExecWriteJsonFileOptions {
  createDirs?: boolean;
  pretty?: boolean;
  space?: number;
  kind: ExecScriptJsonKind;
}
export interface ExecReadJsonFileResponse<TContent = Record<string, unknown>>
  extends Omit<ExecScriptsReadResponse, 'data'> {
  data: Omit<ExecScriptsReadResponse['data'], 'content'> & {
    content: TContent;
  };
}

/**
 * Module augmentation: extends the generated ScriptsService interface with
 * new method signatures. TypeScript merges this declaration with the original
 * interface in scripts.service.js, so callers see the full combined type.
 *
 * Four helpers, each taking the content family as `options.kind`:
 *   listFiles, readFile, writeFile, deleteFile
 *
 * The actual implementations are attached at runtime by patchExecScriptsServicePrototype().
 */
declare module '../generated/exec/scripts.service.js' {
  interface ScriptsService {
    listFiles(
      options?: ExecListFilesOptions,
      templateVars?: ExecScriptsTemplateVars,
    ): Promise<ExecScriptsListResponse>;

    readFile(
      path: string,
      options?: ExecReadFileOptions & { kind?: 'file' | 'markdown' },
      templateVars?: ExecScriptsTemplateVars,
    ): Promise<ExecScriptsReadResponse>;
    readFile<TContent extends Record<string, unknown> = Record<string, unknown>>(
      path: string,
      options: ExecReadFileOptions & { kind: ExecScriptJsonKind },
      templateVars?: ExecScriptsTemplateVars,
    ): Promise<ExecReadJsonFileResponse<TContent>>;

    writeFile(
      path: string,
      content: string,
      options?: ExecWriteFileOptions,
      requestOptions?: ExecScriptsRequestOptions,
      templateVars?: ExecScriptsTemplateVars,
    ): Promise<ExecScriptsWriteResponse>;
    writeFile<TContent extends Record<string, unknown> = Record<string, unknown>>(
      path: string,
      data: TContent,
      options: ExecWriteJsonFileOptions,
      requestOptions?: ExecScriptsRequestOptions,
      templateVars?: ExecScriptsTemplateVars,
    ): Promise<ExecScriptsWriteResponse>;

    deleteFile(
      path: string,
      options?: ExecDeleteFileOptions,
      templateVars?: ExecScriptsTemplateVars,
    ): Promise<ExecScriptsDeleteResponse>;
  }
}

/**
 * Idempotency guard for prototype patching.
 *
 * Uses `Symbol.for` (global symbol registry) rather than a plain `Symbol()` so the
 * marker survives HMR (Hot Module Replacement) and duplicate import scenarios where
 * the module body runs multiple times with different module identity. `Symbol.for`
 * always returns the same symbol for the same string key across all module instances.
 */
const EXEC_SCRIPTS_PATCH_MARKER = Symbol.for('hoody.sdk.exec.scripts.patch');

function parseBooleanLike(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return fallback;
}

/**
 * Normalize user-provided list options into the shape expected by the generated
 * listScripts method.
 *
 * Supplies safe defaults for all required query parameters so the generated
 * base validation does not reject the request. Notably:
 *   - dir: defaults to '' (root) and validates via assertPath if non-empty
 *   - filter: defaults to '*' (match all)
 *   - metadata: coerced to boolean (false by default)
 *   - label, tags, mode, enabled, websocket: default to '' (no constraint)
 *   - recursive, include_comments: default to 'false'
 *
 * An exhaustive listing (exhaustive true or 'true') gets none of these defaults,
 * not even the empty dir: the server refuses it with any option that could hide
 * an entry. The caller's own options are still sent, and still refused.
 */
function normalizeListScriptsOptions(options: unknown): ListScriptsOptions {
  const source =
    typeof options === 'object' && options !== null
      ? (options as Record<string, unknown>)
      : {};

  const normalized: Record<string, unknown> = {
    ...source,
  };
  const exhaustive = parseBooleanLike(normalized.exhaustive, false);

  if (normalized.dir === undefined || normalized.dir === null) {
    // A null dir would be sent as the text "null".
    if (exhaustive) delete normalized.dir;
    else normalized.dir = '';
  } else if (typeof normalized.dir === 'string') {
    const trimmedDir = normalized.dir.trim();
    normalized.dir = trimmedDir ? assertPath(trimmedDir, 'listFiles') : '';
  } else {
    normalized.dir = '';
  }

  if (exhaustive) return normalized as ListScriptsOptions;

  if (
    normalized.filter === undefined
    || normalized.filter === null
    || normalized.filter === ''
  ) {
    normalized.filter = '*';
  }

  normalized.metadata = parseBooleanLike(normalized.metadata, false);

  // Supply safe defaults for remaining required query params so the generated
  // base validation does not reject the request. These are pass-through filters
  // that the server treats as "no constraint" when empty or default-valued.
  normalized.label ??= '';
  normalized.tags ??= '';
  normalized.mode ??= '';
  normalized.enabled ??= '';
  normalized.websocket ??= '';
  normalized.recursive ??= 'false';
  normalized.include_comments ??= 'false';

  return normalized as ListScriptsOptions;
}

function normalizeConfirmQuery(confirm: string | boolean | undefined): string {
  if (typeof confirm === 'boolean') return confirm ? 'true' : 'false';
  if (typeof confirm === 'string' && confirm.trim().length > 0) return confirm;
  return 'true';
}

function assertPath(path: string, helperName: string): string {
  return assertBasePath(path, helperName);
}

function normalizePathWithExtension(path: string, extension: string, helperName: string): string {
  const normalized = assertPath(path, helperName);
  if (normalized.toLowerCase().endsWith(extension.toLowerCase())) return normalized;

  const fileName = normalized.split('/').pop() || normalized;
  if (fileName.includes('.')) {
    throw new Error(`${helperName} expects a ${extension} path. Received "${path}"`);
  }

  return `${normalized}${extension}`;
}

const KIND_EXTENSION: Record<Exclude<ExecScriptFileKind, 'file'>, string> = {
  markdown: '.md',
  schema: '.schema.json',
  openapi: '.openapi.json',
};

/** The path a helper sends for a kind: a generic file as given, the others with their extension. */
function pathForKind(path: string, kind: ExecScriptFileKind | undefined, helperName: string): string {
  if (kind === undefined || kind === 'file') return assertPath(path, helperName);
  const extension = KIND_EXTENSION[kind];
  if (extension === undefined) {
    throw new Error(`${helperName}: unknown kind ${JSON.stringify(kind)}; expected file, markdown, schema or openapi`);
  }
  return normalizePathWithExtension(path, extension, helperName);
}

function isJsonKind(kind: ExecScriptFileKind | undefined): kind is ExecScriptJsonKind {
  return kind === 'schema' || kind === 'openapi';
}

function normalizeJsonSpace(options?: ExecWriteJsonFileOptions): number {
  const requested = options?.space;
  if (typeof requested === 'number' && Number.isFinite(requested)) {
    return Math.max(0, Math.floor(requested));
  }
  return options?.pretty === false ? 0 : 2;
}

function stringifyJson(value: Record<string, unknown>, options?: ExecWriteJsonFileOptions): string {
  const space = normalizeJsonSpace(options);
  const serialized = JSON.stringify(value, null, space);
  if (serialized === undefined) {
    throw new Error('JSON payload is not serializable');
  }
  return space > 0 ? `${serialized}\n` : serialized;
}

function parseJsonContent<TContent extends Record<string, unknown>>(
  content: unknown,
  path: string,
  helperName: string,
): TContent {
  if (typeof content === 'object' && content !== null) {
    return content as TContent;
  }
  if (typeof content !== 'string') {
    throw new Error(`${helperName} expected string or object content for "${path}"`);
  }
  try {
    return JSON.parse(content) as TContent;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${helperName} could not parse JSON at "${path}": ${message}`);
  }
}

function asAnyRecord(value: unknown): Record<string, unknown> {
  return (value || {}) as Record<string, unknown>;
}

/**
 * Attach all extension methods to ScriptsService.prototype.
 *
 * This function is called as a side-effect at the bottom of this module
 * (auto-invoked at import time). The EXEC_SCRIPTS_PATCH_MARKER guard
 * ensures it only runs once even if the module is imported multiple times.
 *
 * It also monkey-patches the original `listScripts` and `writeScript` to
 * inject normalization (safe defaults, path validation) transparently.
 */
export function patchExecScriptsServicePrototype(): void {
  const prototype = ScriptsService.prototype as ScriptsService & Record<string | symbol, unknown>;
  if (prototype[EXEC_SCRIPTS_PATCH_MARKER]) return;

  const originalList = prototype.list as ScriptsService['list'];
  const originalWrite = prototype.write as ScriptsService['write'];

  prototype.list = function patchedList(
    this: ScriptsService,
    options?: Parameters<ScriptsService['list']>[0],
    templateVars?: ExecScriptsTemplateVars,
  ): Promise<ExecScriptsListResponse> {
    return originalList.call(this, normalizeListScriptsOptions(options), templateVars);
  };

  // Patched write: validates path, applies default behaviors:
  //   - createDirs defaults to true (auto-create parent directories)
  //   - validate defaults to false, except forced false for .md files
  //     (Markdown files should not go through script validation)
  prototype.write = function patchedWrite(
    this: ScriptsService,
    data: WriteScriptPayload,
    requestOptions?: ExecScriptsRequestOptions,
    templateVars?: ExecScriptsTemplateVars,
  ): Promise<ExecScriptsWriteResponse> {
    const source = asAnyRecord(data);

    // Validate path to prevent traversal through the base writeScript method
    if (typeof source.path === 'string' && source.path.trim()) {
      assertPath(source.path, 'writeScript');
    }

    const normalizedPath =
      typeof source.path === 'string'
        ? source.path.trim().toLowerCase()
        : '';
    const isMarkdown = normalizedPath.endsWith('.md');

    const normalizedPayload: Record<string, unknown> = {
      ...source,
      createDirs: source.createDirs ?? true,
      validate: isMarkdown ? false : parseBooleanLike(source.validate, false),
    };

    return originalWrite.call(
      this,
      normalizedPayload as unknown as WriteScriptPayload,
      requestOptions,
      templateVars,
    );
  };

  prototype.listFiles = function listFiles(
    this: ScriptsService,
    options?: ExecListFilesOptions,
    templateVars?: ExecScriptsTemplateVars,
  ): Promise<ExecScriptsListResponse> {
    const { kind, ...rest } = options ?? {};
    const filter = rest.filter
      ?? (kind === undefined || kind === 'file' ? undefined : `*${KIND_EXTENSION[kind]}`);
    return this.list({ ...rest, ...(filter !== undefined ? { filter } : {}) } as ListScriptsOptions, templateVars);
  };

  prototype.readFile = async function readFile(
    this: ScriptsService,
    path: string,
    options?: ExecReadFileOptions,
    templateVars?: ExecScriptsTemplateVars,
  ): Promise<never> {
    const { kind, ...rest } = options ?? {};
    const target = pathForKind(path, kind, 'readFile');
    const response = await this.read({ ...rest, path: target } as ReadScriptOptions, templateVars);
    if (!isJsonKind(kind)) return response as never;
    const parsed = parseJsonContent<Record<string, unknown>>(response.data?.content, target, 'readFile');
    return { ...response, data: { ...response.data, content: parsed } } as never;
  } as ScriptsService['readFile'];

  prototype.writeFile = function writeFile(
    this: ScriptsService,
    path: string,
    data: string | Record<string, unknown>,
    options?: ExecWriteFileOptions | ExecWriteJsonFileOptions,
    requestOptions?: ExecScriptsRequestOptions,
    templateVars?: ExecScriptsTemplateVars,
  ): Promise<ExecScriptsWriteResponse> {
    const kind = options?.kind;
    const target = pathForKind(path, kind, 'writeFile');
    let content: string;
    if (isJsonKind(kind)) {
      if (typeof data !== 'object' || data === null) {
        throw new Error(`writeFile with kind "${kind}" takes an object, not ${typeof data}`);
      }
      content = stringifyJson(data, options as ExecWriteJsonFileOptions);
    } else {
      if (typeof data !== 'string') {
        throw new Error(`writeFile with kind "${kind ?? 'file'}" takes a string of content, not ${typeof data}`);
      }
      content = data;
    }
    const payload: Record<string, unknown> = {
      path: target,
      content,
      createDirs: options?.createDirs ?? true,
      // Only a generic file may ask for script validation; every other kind is data.
      validate: kind === undefined || kind === 'file'
        ? parseBooleanLike((options as ExecWriteFileOptions | undefined)?.validate, false)
        : false,
    };

    return this.write(payload as unknown as WriteScriptPayload, requestOptions, templateVars);
  } as ScriptsService['writeFile'];

  prototype.deleteFile = function deleteFile(
    this: ScriptsService,
    path: string,
    options?: ExecDeleteFileOptions,
    templateVars?: ExecScriptsTemplateVars,
  ): Promise<ExecScriptsDeleteResponse> {
    const { kind, ...rest } = options ?? {};
    const request: DeleteScriptOptions = {
      ...rest,
      path: pathForKind(path, kind, 'deleteFile'),
      // The spec admits only "true"; any other value a caller passes is sent as given and the
      // server refuses it, rather than being silently turned into a confirmation.
      confirm: normalizeConfirmQuery(options?.confirm) as DeleteScriptOptions['confirm'],
    };

    return this.delete(request, templateVars);
  };

  prototype[EXEC_SCRIPTS_PATCH_MARKER] = true;
}

// Auto-invoke at import time: importing this module patches ScriptsService.prototype.
patchExecScriptsServicePrototype();
