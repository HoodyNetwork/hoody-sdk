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
        listFiles(options?: ExecListFilesOptions, templateVars?: ExecScriptsTemplateVars): Promise<ExecScriptsListResponse>;
        listMarkdown(options?: Omit<ExecListFilesOptions, 'filter'> & {
            filter?: string;
        }, templateVars?: ExecScriptsTemplateVars): Promise<ExecScriptsListResponse>;
        listSchemaJson(options?: Omit<ExecListFilesOptions, 'filter'> & {
            filter?: string;
        }, templateVars?: ExecScriptsTemplateVars): Promise<ExecScriptsListResponse>;
        listOpenApiJson(options?: Omit<ExecListFilesOptions, 'filter'> & {
            filter?: string;
        }, templateVars?: ExecScriptsTemplateVars): Promise<ExecScriptsListResponse>;
        readFile(path: string, options?: ExecReadFileOptions, templateVars?: ExecScriptsTemplateVars): Promise<ExecScriptsReadResponse>;
        readMarkdown(path: string, options?: ExecReadFileOptions, templateVars?: ExecScriptsTemplateVars): Promise<ExecScriptsReadResponse>;
        readSchemaJson<TSchema extends Record<string, unknown> = Record<string, unknown>>(path: string, options?: ExecReadFileOptions, templateVars?: ExecScriptsTemplateVars): Promise<ExecReadJsonFileResponse<TSchema>>;
        readOpenApiJson<TOpenApi extends Record<string, unknown> = Record<string, unknown>>(path: string, options?: ExecReadFileOptions, templateVars?: ExecScriptsTemplateVars): Promise<ExecReadJsonFileResponse<TOpenApi>>;
        writeFile(path: string, content: string, options?: ExecWriteFileOptions, requestOptions?: ExecScriptsRequestOptions, templateVars?: ExecScriptsTemplateVars): Promise<ExecScriptsWriteResponse>;
        writeMarkdown(path: string, content: string, options?: Omit<ExecWriteFileOptions, 'validate'>, requestOptions?: ExecScriptsRequestOptions, templateVars?: ExecScriptsTemplateVars): Promise<ExecScriptsWriteResponse>;
        writeSchemaJson<TSchema extends Record<string, unknown> = Record<string, unknown>>(path: string, schema: TSchema, options?: ExecWriteJsonFileOptions, requestOptions?: ExecScriptsRequestOptions, templateVars?: ExecScriptsTemplateVars): Promise<ExecScriptsWriteResponse>;
        writeOpenApiJson<TOpenApi extends Record<string, unknown> = Record<string, unknown>>(path: string, openapi: TOpenApi, options?: ExecWriteJsonFileOptions, requestOptions?: ExecScriptsRequestOptions, templateVars?: ExecScriptsTemplateVars): Promise<ExecScriptsWriteResponse>;
        deleteFile(path: string, options?: ExecDeleteFileOptions, templateVars?: ExecScriptsTemplateVars): Promise<ExecScriptsDeleteResponse>;
        deleteMarkdown(path: string, options?: ExecDeleteFileOptions, templateVars?: ExecScriptsTemplateVars): Promise<ExecScriptsDeleteResponse>;
        deleteSchemaJson(path: string, options?: ExecDeleteFileOptions, templateVars?: ExecScriptsTemplateVars): Promise<ExecScriptsDeleteResponse>;
        deleteOpenApiJson(path: string, options?: ExecDeleteFileOptions, templateVars?: ExecScriptsTemplateVars): Promise<ExecScriptsDeleteResponse>;
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
