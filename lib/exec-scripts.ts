/**
 * Exec scripts service extensions — module augmentation + prototype patching.
 *
 * Architecture:
 *   This module extends the auto-generated ScriptsService with high-level
 *   helpers (readFile, writeMarkdown, readSchemaJson, etc.) without modifying
 *   the generated code. It uses two TypeScript mechanisms:
 *
 *   1. `declare module` augmentation: adds new method signatures to
 *      ScriptsService's type so callers see them with full type safety.
 *   2. Prototype patching at import time: `patchExecScriptsServicePrototype()`
 *      is called as a side-effect of importing this module, attaching the
 *      actual implementations to ScriptsService.prototype.
 *
 * Four content-type families:
 *   - Generic files (readFile / writeFile / deleteFile / listFiles)
 *   - Markdown (.md) — auto-appends extension, skips validation
 *   - Schema JSON (.schema.json) — auto-appends extension, parses/serializes JSON
 *   - OpenAPI JSON (.openapi.json) — same as schema JSON with different extension
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
export type ExecReadFileOptions = Omit<ReadScriptOptions, 'path'>;
export type ExecListFilesOptions = Omit<ListScriptsOptions, 'metadata'> & {
  metadata?: boolean | string;
};
export type ExecDeleteFileOptions = Omit<DeleteScriptOptions, 'path' | 'confirm'> & {
  confirm?: string | boolean;
};
export interface ExecWriteFileOptions {
  createDirs?: boolean;
  validate?: boolean;
}
export interface ExecWriteJsonFileOptions extends Omit<ExecWriteFileOptions, 'validate'> {
  pretty?: boolean;
  space?: number;
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
 * The four content-type families each provide list/read/write/delete helpers:
 *   - Generic files: listFiles, readFile, writeFile, deleteFile
 *   - Markdown (.md): listMarkdown, readMarkdown, writeMarkdown, deleteMarkdown
 *   - Schema JSON (.schema.json): listSchemaJson, readSchemaJson, writeSchemaJson, deleteSchemaJson
 *   - OpenAPI JSON (.openapi.json): listOpenApiJson, readOpenApiJson, writeOpenApiJson, deleteOpenApiJson
 *
 * The actual implementations are attached at runtime by patchExecScriptsServicePrototype().
 */
declare module '../generated/exec/scripts.service.js' {
  interface ScriptsService {
    listFiles(
      options?: ExecListFilesOptions,
      templateVars?: ExecScriptsTemplateVars,
    ): Promise<ExecScriptsListResponse>;

    listMarkdown(
      options?: Omit<ExecListFilesOptions, 'filter'> & { filter?: string },
      templateVars?: ExecScriptsTemplateVars,
    ): Promise<ExecScriptsListResponse>;

    listSchemaJson(
      options?: Omit<ExecListFilesOptions, 'filter'> & { filter?: string },
      templateVars?: ExecScriptsTemplateVars,
    ): Promise<ExecScriptsListResponse>;

    listOpenApiJson(
      options?: Omit<ExecListFilesOptions, 'filter'> & { filter?: string },
      templateVars?: ExecScriptsTemplateVars,
    ): Promise<ExecScriptsListResponse>;

    readFile(
      path: string,
      options?: ExecReadFileOptions,
      templateVars?: ExecScriptsTemplateVars,
    ): Promise<ExecScriptsReadResponse>;

    readMarkdown(
      path: string,
      options?: ExecReadFileOptions,
      templateVars?: ExecScriptsTemplateVars,
    ): Promise<ExecScriptsReadResponse>;

    readSchemaJson<TSchema extends Record<string, unknown> = Record<string, unknown>>(
      path: string,
      options?: ExecReadFileOptions,
      templateVars?: ExecScriptsTemplateVars,
    ): Promise<ExecReadJsonFileResponse<TSchema>>;

    readOpenApiJson<TOpenApi extends Record<string, unknown> = Record<string, unknown>>(
      path: string,
      options?: ExecReadFileOptions,
      templateVars?: ExecScriptsTemplateVars,
    ): Promise<ExecReadJsonFileResponse<TOpenApi>>;

    writeFile(
      path: string,
      content: string,
      options?: ExecWriteFileOptions,
      requestOptions?: ExecScriptsRequestOptions,
      templateVars?: ExecScriptsTemplateVars,
    ): Promise<ExecScriptsWriteResponse>;

    writeMarkdown(
      path: string,
      content: string,
      options?: Omit<ExecWriteFileOptions, 'validate'>,
      requestOptions?: ExecScriptsRequestOptions,
      templateVars?: ExecScriptsTemplateVars,
    ): Promise<ExecScriptsWriteResponse>;

    writeSchemaJson<TSchema extends Record<string, unknown> = Record<string, unknown>>(
      path: string,
      schema: TSchema,
      options?: ExecWriteJsonFileOptions,
      requestOptions?: ExecScriptsRequestOptions,
      templateVars?: ExecScriptsTemplateVars,
    ): Promise<ExecScriptsWriteResponse>;

    writeOpenApiJson<TOpenApi extends Record<string, unknown> = Record<string, unknown>>(
      path: string,
      openapi: TOpenApi,
      options?: ExecWriteJsonFileOptions,
      requestOptions?: ExecScriptsRequestOptions,
      templateVars?: ExecScriptsTemplateVars,
    ): Promise<ExecScriptsWriteResponse>;

    deleteFile(
      path: string,
      options?: ExecDeleteFileOptions,
      templateVars?: ExecScriptsTemplateVars,
    ): Promise<ExecScriptsDeleteResponse>;

    deleteMarkdown(
      path: string,
      options?: ExecDeleteFileOptions,
      templateVars?: ExecScriptsTemplateVars,
    ): Promise<ExecScriptsDeleteResponse>;

    deleteSchemaJson(
      path: string,
      options?: ExecDeleteFileOptions,
      templateVars?: ExecScriptsTemplateVars,
    ): Promise<ExecScriptsDeleteResponse>;

    deleteOpenApiJson(
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
 */
function normalizeListScriptsOptions(options: unknown): ListScriptsOptions {
  const source =
    typeof options === 'object' && options !== null
      ? (options as Record<string, unknown>)
      : {};

  const normalized: Record<string, unknown> = {
    ...source,
  };

  if (normalized.dir === undefined || normalized.dir === null) {
    normalized.dir = '';
  } else if (typeof normalized.dir === 'string') {
    const trimmedDir = normalized.dir.trim();
    normalized.dir = trimmedDir ? assertPath(trimmedDir, 'listFiles') : '';
  } else {
    normalized.dir = '';
  }

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

function normalizeMarkdownPath(path: string, helperName: string): string {
  return normalizePathWithExtension(path, '.md', helperName);
}

function normalizeSchemaJsonPath(path: string, helperName: string): string {
  return normalizePathWithExtension(path, '.schema.json', helperName);
}

function normalizeOpenApiJsonPath(path: string, helperName: string): string {
  return normalizePathWithExtension(path, '.openapi.json', helperName);
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
    return this.list(options as ListScriptsOptions, templateVars);
  };

  prototype.listMarkdown = function listMarkdown(
    this: ScriptsService,
    options?: Omit<ExecListFilesOptions, 'filter'> & { filter?: string },
    templateVars?: ExecScriptsTemplateVars,
  ): Promise<ExecScriptsListResponse> {
    const normalizedOptions: ExecListFilesOptions = {
      ...(options || {}),
      filter: options?.filter ?? '*.md',
    };
    return this.list(normalizedOptions as ListScriptsOptions, templateVars);
  };

  prototype.listSchemaJson = function listSchemaJson(
    this: ScriptsService,
    options?: Omit<ExecListFilesOptions, 'filter'> & { filter?: string },
    templateVars?: ExecScriptsTemplateVars,
  ): Promise<ExecScriptsListResponse> {
    return this.listFiles(
      {
        ...(options || {}),
        filter: options?.filter ?? '*.schema.json',
      },
      templateVars,
    );
  };

  prototype.listOpenApiJson = function listOpenApiJson(
    this: ScriptsService,
    options?: Omit<ExecListFilesOptions, 'filter'> & { filter?: string },
    templateVars?: ExecScriptsTemplateVars,
  ): Promise<ExecScriptsListResponse> {
    return this.listFiles(
      {
        ...(options || {}),
        filter: options?.filter ?? '*.openapi.json',
      },
      templateVars,
    );
  };

  prototype.readFile = function readFile(
    this: ScriptsService,
    path: string,
    options?: ExecReadFileOptions,
    templateVars?: ExecScriptsTemplateVars,
  ): Promise<ExecScriptsReadResponse> {
    const request: ReadScriptOptions = {
      ...(options || {}),
      path: assertPath(path, 'readFile'),
    };
    return this.read(request, templateVars);
  };

  prototype.readMarkdown = function readMarkdown(
    this: ScriptsService,
    path: string,
    options?: ExecReadFileOptions,
    templateVars?: ExecScriptsTemplateVars,
  ): Promise<ExecScriptsReadResponse> {
    return this.readFile(normalizeMarkdownPath(path, 'readMarkdown'), options, templateVars);
  };

  prototype.readSchemaJson = async function readSchemaJson<TSchema extends Record<string, unknown> = Record<string, unknown>>(
    this: ScriptsService,
    path: string,
    options?: ExecReadFileOptions,
    templateVars?: ExecScriptsTemplateVars,
  ): Promise<ExecReadJsonFileResponse<TSchema>> {
    const normalizedPath = normalizeSchemaJsonPath(path, 'readSchemaJson');
    const response = await this.readFile(normalizedPath, options, templateVars);
    const parsed = parseJsonContent<TSchema>(response.data?.content, normalizedPath, 'readSchemaJson');

    return {
      ...response,
      data: {
        ...response.data,
        content: parsed,
      },
    };
  };

  prototype.readOpenApiJson = async function readOpenApiJson<TOpenApi extends Record<string, unknown> = Record<string, unknown>>(
    this: ScriptsService,
    path: string,
    options?: ExecReadFileOptions,
    templateVars?: ExecScriptsTemplateVars,
  ): Promise<ExecReadJsonFileResponse<TOpenApi>> {
    const normalizedPath = normalizeOpenApiJsonPath(path, 'readOpenApiJson');
    const response = await this.readFile(normalizedPath, options, templateVars);
    const parsed = parseJsonContent<TOpenApi>(response.data?.content, normalizedPath, 'readOpenApiJson');

    return {
      ...response,
      data: {
        ...response.data,
        content: parsed,
      },
    };
  };

  prototype.writeFile = function writeFile(
    this: ScriptsService,
    path: string,
    content: string,
    options?: ExecWriteFileOptions,
    requestOptions?: ExecScriptsRequestOptions,
    templateVars?: ExecScriptsTemplateVars,
  ): Promise<ExecScriptsWriteResponse> {
    const payload: Record<string, unknown> = {
      path: assertPath(path, 'writeFile'),
      content,
      createDirs: options?.createDirs ?? true,
      validate: parseBooleanLike(options?.validate, false),
    };

    return this.write(payload as unknown as WriteScriptPayload, requestOptions, templateVars);
  };

  prototype.writeMarkdown = function writeMarkdown(
    this: ScriptsService,
    path: string,
    content: string,
    options?: Omit<ExecWriteFileOptions, 'validate'>,
    requestOptions?: ExecScriptsRequestOptions,
    templateVars?: ExecScriptsTemplateVars,
  ): Promise<ExecScriptsWriteResponse> {
    return this.writeFile(
      normalizeMarkdownPath(path, 'writeMarkdown'),
      content,
      {
        createDirs: options?.createDirs ?? true,
        validate: false,
      },
      requestOptions,
      templateVars,
    );
  };

  prototype.writeSchemaJson = function writeSchemaJson<TSchema extends Record<string, unknown> = Record<string, unknown>>(
    this: ScriptsService,
    path: string,
    schema: TSchema,
    options?: ExecWriteJsonFileOptions,
    requestOptions?: ExecScriptsRequestOptions,
    templateVars?: ExecScriptsTemplateVars,
  ): Promise<ExecScriptsWriteResponse> {
    const normalizedPath = normalizeSchemaJsonPath(path, 'writeSchemaJson');
    return this.writeFile(
      normalizedPath,
      stringifyJson(schema, options),
      {
        createDirs: options?.createDirs ?? true,
        validate: false,
      },
      requestOptions,
      templateVars,
    );
  };

  prototype.writeOpenApiJson = function writeOpenApiJson<TOpenApi extends Record<string, unknown> = Record<string, unknown>>(
    this: ScriptsService,
    path: string,
    openapi: TOpenApi,
    options?: ExecWriteJsonFileOptions,
    requestOptions?: ExecScriptsRequestOptions,
    templateVars?: ExecScriptsTemplateVars,
  ): Promise<ExecScriptsWriteResponse> {
    const normalizedPath = normalizeOpenApiJsonPath(path, 'writeOpenApiJson');
    return this.writeFile(
      normalizedPath,
      stringifyJson(openapi, options),
      {
        createDirs: options?.createDirs ?? true,
        validate: false,
      },
      requestOptions,
      templateVars,
    );
  };

  prototype.deleteFile = function deleteFile(
    this: ScriptsService,
    path: string,
    options?: ExecDeleteFileOptions,
    templateVars?: ExecScriptsTemplateVars,
  ): Promise<ExecScriptsDeleteResponse> {
    const request: DeleteScriptOptions = {
      ...(options || {}),
      path: assertPath(path, 'deleteFile'),
      confirm: normalizeConfirmQuery(options?.confirm),
    };

    return this.delete(request, templateVars);
  };

  prototype.deleteMarkdown = function deleteMarkdown(
    this: ScriptsService,
    path: string,
    options?: ExecDeleteFileOptions,
    templateVars?: ExecScriptsTemplateVars,
  ): Promise<ExecScriptsDeleteResponse> {
    return this.deleteFile(normalizeMarkdownPath(path, 'deleteMarkdown'), options, templateVars);
  };

  prototype.deleteSchemaJson = function deleteSchemaJson(
    this: ScriptsService,
    path: string,
    options?: ExecDeleteFileOptions,
    templateVars?: ExecScriptsTemplateVars,
  ): Promise<ExecScriptsDeleteResponse> {
    return this.deleteFile(normalizeSchemaJsonPath(path, 'deleteSchemaJson'), options, templateVars);
  };

  prototype.deleteOpenApiJson = function deleteOpenApiJson(
    this: ScriptsService,
    path: string,
    options?: ExecDeleteFileOptions,
    templateVars?: ExecScriptsTemplateVars,
  ): Promise<ExecScriptsDeleteResponse> {
    return this.deleteFile(normalizeOpenApiJsonPath(path, 'deleteOpenApiJson'), options, templateVars);
  };

  prototype[EXEC_SCRIPTS_PATCH_MARKER] = true;
}

// Auto-invoke at import time: importing this module patches ScriptsService.prototype.
patchExecScriptsServicePrototype();
