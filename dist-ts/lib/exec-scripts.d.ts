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
import type { ExecScriptsDeleteResponse, ExecScriptsListResponse, ExecScriptsReadResponse, ExecScriptsWriteResponse } from '../generated/types.js';
/**
 * Type aliases extracted via `Parameters<>` from the generated ScriptsService methods.
 * This pattern keeps these types automatically in sync with the generated code —
 * if the generated method signatures change, these aliases follow without manual updates.
 */
type ListScriptsOptions = Exclude<Parameters<ScriptsService['list']>[0], undefined>;
type ReadScriptOptions = Exclude<Parameters<ScriptsService['read']>[0], undefined>;
type DeleteScriptOptions = Exclude<Parameters<ScriptsService['delete']>[0], undefined>;
export type ExecScriptsTemplateVars = Parameters<ScriptsService['write']>[2];
export type ExecScriptsRequestOptions = Parameters<ScriptsService['write']>[1];
/** The content family a helper works on: a generic file, markdown, a schema, or an OpenAPI document. */
export type ExecScriptFileKind = 'file' | 'markdown' | 'schema' | 'openapi';
/** The kinds whose content is JSON: read parses it, write serializes it. */
export type ExecScriptJsonKind = 'schema' | 'openapi';
export type ExecReadFileOptions = Omit<ReadScriptOptions, 'path'> & {
    kind?: ExecScriptFileKind;
};
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
export interface ExecReadJsonFileResponse<TContent = Record<string, unknown>> extends Omit<ExecScriptsReadResponse, 'data'> {
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
        listFiles(options?: ExecListFilesOptions, templateVars?: ExecScriptsTemplateVars): Promise<ExecScriptsListResponse>;
        readFile(path: string, options?: ExecReadFileOptions & {
            kind?: 'file' | 'markdown';
        }, templateVars?: ExecScriptsTemplateVars): Promise<ExecScriptsReadResponse>;
        readFile<TContent extends Record<string, unknown> = Record<string, unknown>>(path: string, options: ExecReadFileOptions & {
            kind: ExecScriptJsonKind;
        }, templateVars?: ExecScriptsTemplateVars): Promise<ExecReadJsonFileResponse<TContent>>;
        writeFile(path: string, content: string, options?: ExecWriteFileOptions, requestOptions?: ExecScriptsRequestOptions, templateVars?: ExecScriptsTemplateVars): Promise<ExecScriptsWriteResponse>;
        writeFile<TContent extends Record<string, unknown> = Record<string, unknown>>(path: string, data: TContent, options: ExecWriteJsonFileOptions, requestOptions?: ExecScriptsRequestOptions, templateVars?: ExecScriptsTemplateVars): Promise<ExecScriptsWriteResponse>;
        deleteFile(path: string, options?: ExecDeleteFileOptions, templateVars?: ExecScriptsTemplateVars): Promise<ExecScriptsDeleteResponse>;
    }
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
export declare function patchExecScriptsServicePrototype(): void;
export {};
