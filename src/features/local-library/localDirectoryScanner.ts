import {
  scanLocalDirectoryEntries,
  type LocalDirectoryEntryAudioCandidate,
  type LocalDirectoryEntryScanError,
  type LocalDirectoryIgnoredEntry,
  type LocalDirectoryScanOptions
} from "./localDirectoryEntryScanner";

export {
  isValidLocalDirectoryRelativePath,
  normalizeDirectoryCandidateKey,
  normalizeDirectoryCandidateText,
  scanLocalDirectoryEntries
} from "./localDirectoryEntryScanner";
export type {
  LocalDirectoryCandidateIssueCode,
  LocalDirectoryCandidateParseStatus,
  LocalDirectoryEntryAudioCandidate,
  LocalDirectoryEntryDescriptor,
  LocalDirectoryEntryScanError,
  LocalDirectoryEntryScanResult,
  LocalDirectoryIgnoredEntry,
  LocalDirectoryScanOptions
} from "./localDirectoryEntryScanner";

export interface LocalDirectorySelectedFile {
  file: File;
  relativePath?: string;
  fileHandle?: FileSystemFileHandle;
}

export interface LocalDirectoryAudioCandidate extends LocalDirectoryEntryAudioCandidate {
  file: File;
  fileHandle?: FileSystemFileHandle;
}

export type LocalDirectoryIgnoredFile = LocalDirectoryIgnoredEntry;
export type LocalDirectoryScanError = LocalDirectoryEntryScanError;

export interface LocalDirectoryScanResult {
  totalFileCount: number;
  candidates: readonly LocalDirectoryAudioCandidate[];
  ignoredFiles: readonly LocalDirectoryIgnoredFile[];
  errors: readonly LocalDirectoryScanError[];
}

export function scanLocalDirectory(
  files: Iterable<File | LocalDirectorySelectedFile>,
  options: LocalDirectoryScanOptions = {}
): LocalDirectoryScanResult {
  const candidates: LocalDirectoryAudioCandidate[] = [];
  const ignoredFiles: LocalDirectoryIgnoredFile[] = [];
  const errors: LocalDirectoryScanError[] = [];
  let totalFileCount = 0;

  for (const selectedFile of files) {
    const { file, fileHandle, relativePath } = toSelectedFile(selectedFile);
    const entryScan = scanLocalDirectoryEntries(
      [
        {
          fileName: file.name,
          relativePath: relativePath ?? file.webkitRelativePath
        }
      ],
      options
    );

    totalFileCount += entryScan.totalFileCount;
    ignoredFiles.push(...entryScan.ignoredFiles);
    errors.push(...entryScan.errors);

    const parsedCandidate = entryScan.candidates[0];

    if (parsedCandidate) {
      candidates.push({
        ...parsedCandidate,
        file,
        ...(fileHandle ? { fileHandle } : {})
      });
    }
  }

  return {
    totalFileCount,
    candidates,
    ignoredFiles,
    errors
  };
}

function toSelectedFile(
  selectedFile: File | LocalDirectorySelectedFile
): LocalDirectorySelectedFile {
  return selectedFile instanceof File ? { file: selectedFile } : selectedFile;
}
