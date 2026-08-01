/**
 * File System Access API pickers.
 *
 * `FileSystemFileHandle` ships in TypeScript's DOM lib, but the `window`
 * picker entry points do not (they are not in every engine). Declared here as
 * optional so `src/files.ts` can feature-detect them rather than assume them.
 */
interface FilePickerType {
  description?: string;
  accept: Record<string, string[]>;
}

interface OpenFilePickerOptions {
  types?: FilePickerType[];
  multiple?: boolean;
  excludeAcceptAllOption?: boolean;
}

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: FilePickerType[];
  excludeAcceptAllOption?: boolean;
}

declare function showOpenFilePicker(
  options?: OpenFilePickerOptions,
): Promise<FileSystemFileHandle[]>;

declare function showSaveFilePicker(
  options?: SaveFilePickerOptions,
): Promise<FileSystemFileHandle>;
