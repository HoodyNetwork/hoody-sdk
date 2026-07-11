/**
 * Files service extensions — prototype patches for FilesService, ArchivesService,
 * ImageProcessingService (files namespace) and FilesService (notes namespace).
 *
 * Architecture:
 *   This module extends the auto-generated service classes with convenience
 *   helpers (classifyFile, getFileUrl, getDirectoryZipUrl, getThumbnailUrl)
 *   and JSON-default overrides (search, listDirectory) without
 *   modifying the generated code.
 *
 *   It uses the same declare-module + prototype-patch pattern as
 *   lib/exec-scripts.ts and lib/terminal-exec.ts.
 *
 *   1. `declare module` augmentation: adds new method signatures so callers
 *      see them with full type safety.
 *   2. Prototype patching: `patchFilesServiceExtensions()` attaches the
 *      implementations to each service prototype, guarded by Symbol.for()
 *      for idempotency.
 */
type TemplateVars = {
    projectId?: string;
    containerId?: string;
    serviceIndex?: string | number;
    server?: string;
};
declare module '../generated/files/files.service.js' {
    interface FilesService {
        classifyFile(filepath: string): 'renderable' | 'binary' | 'text';
        getFileUrl(absPath: string, options?: {
            download?: '';
        }, templateVars?: TemplateVars): string;
    }
}
declare module '../generated/notes/files.service.js' {
    interface FilesService {
        classifyFile(filepath: string): 'renderable' | 'binary' | 'text';
        getFileUrl(absPath: string, options?: {
            download?: '';
        }, templateVars?: TemplateVars): string;
    }
}
declare module '../generated/files/archives.service.js' {
    interface ArchivesService {
        getDirectoryZipUrl(directory: string, templateVars?: TemplateVars): string;
    }
}
declare module '../generated/files/image-processing.service.js' {
    interface ImageProcessingService {
        getThumbnailUrl(imagePath: string, options?: {
            width?: number;
            height?: number;
            format?: string;
            quality?: string;
        }, templateVars?: TemplateVars): string;
    }
}
export declare function patchFilesServiceExtensions(): void;
export {};
