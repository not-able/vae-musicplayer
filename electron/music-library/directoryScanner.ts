import type { Dirent } from "node:fs";
import { lstat, readdir, realpath } from "node:fs/promises";
import path from "node:path";

import {
  isValidLocalDirectoryRelativePath,
  scanLocalDirectoryEntries,
  type LocalDirectoryScanOptions
} from "../../src/features/local-library/localDirectoryEntryScanner";
import { MusicLibraryError } from "./errors";
import type {
  DesktopDirectoryScanError,
  DesktopMusicDirectoryScanResult,
  DesktopScannedAudioFile
} from "./types";

export interface ScanDesktopMusicDirectoryOptions {
  directoryId: string;
  directoryPath: string;
  clock?: () => Date;
  parseOptions?: LocalDirectoryScanOptions;
}

interface ScanAccumulator {
  totalFileCount: number;
  ignoredFileCount: number;
  candidates: DesktopScannedAudioFile[];
  errors: DesktopDirectoryScanError[];
}

export async function scanDesktopMusicDirectory(
  options: ScanDesktopMusicDirectoryOptions
): Promise<DesktopMusicDirectoryScanResult> {
  const rootPath = await resolveScanRoot(options.directoryPath);
  const accumulator: ScanAccumulator = {
    totalFileCount: 0,
    ignoredFileCount: 0,
    candidates: [],
    errors: []
  };

  await scanDirectory(rootPath, rootPath, [], options, accumulator);
  accumulator.candidates.sort((left, right) =>
    comparePortablePaths(left.relativePath, right.relativePath)
  );
  accumulator.errors.sort((left, right) =>
    comparePortablePaths(left.relativePath ?? "", right.relativePath ?? "")
  );

  return {
    directoryId: options.directoryId,
    scannedAt: (options.clock ?? (() => new Date()))().toISOString(),
    totalFileCount: accumulator.totalFileCount,
    supportedFileCount: accumulator.candidates.length,
    ignoredFileCount: accumulator.ignoredFileCount,
    errorCount: accumulator.errors.length,
    candidates: accumulator.candidates,
    errors: accumulator.errors
  };
}

export function isPathInsideRoot(rootPath: string, candidatePath: string): boolean {
  const relativePath = path.relative(
    path.resolve(rootPath),
    path.resolve(candidatePath)
  );

  return (
    relativePath === "" ||
    (!path.isAbsolute(relativePath) &&
      relativePath !== ".." &&
      !relativePath.startsWith(`..${path.sep}`))
  );
}

async function resolveScanRoot(directoryPath: string): Promise<string> {
  try {
    const selectedRootPath = path.resolve(directoryPath);
    const selectedRootStats = await lstat(selectedRootPath);

    if (selectedRootStats.isSymbolicLink()) {
      throw new MusicLibraryError(
        "directory_unreadable",
        "音乐目录授权位置已变更，无法安全扫描。"
      );
    }

    const rootPath = await realpath(selectedRootPath);
    const rootStats = await lstat(rootPath);

    if (!rootStats.isDirectory()) {
      throw new MusicLibraryError("directory_unreadable", "音乐目录当前不可读取。");
    }

    return rootPath;
  } catch (error) {
    if (error instanceof MusicLibraryError) {
      throw error;
    }

    if (isMissingFileSystemError(error)) {
      throw new MusicLibraryError("directory_missing", "音乐目录已不存在。");
    }

    throw new MusicLibraryError("directory_unreadable", "音乐目录当前不可读取。");
  }
}

async function scanDirectory(
  rootPath: string,
  directoryPath: string,
  relativeSegments: readonly string[],
  options: ScanDesktopMusicDirectoryOptions,
  accumulator: ScanAccumulator
): Promise<void> {
  let entries: Dirent<string>[];

  try {
    const canonicalDirectoryPath = await realpath(directoryPath);

    if (!isPathInsideRoot(rootPath, canonicalDirectoryPath)) {
      accumulator.errors.push({
        relativePath: toPortableRelativePath(relativeSegments),
        code: "path_escape_blocked",
        message: "已阻止目录扫描越过授权根目录。"
      });
      return;
    }

    entries = await readdir(canonicalDirectoryPath, { withFileTypes: true });
  } catch {
    accumulator.errors.push({
      ...(relativeSegments.length > 0
        ? { relativePath: toPortableRelativePath(relativeSegments) }
        : {}),
      code: "read_directory_failed",
      message: "无法读取该目录，已跳过并继续扫描。"
    });
    return;
  }

  entries.sort((left, right) => comparePortablePaths(left.name, right.name));

  for (const entry of entries) {
    const entrySegments = [...relativeSegments, entry.name];
    const relativePath = toPortableRelativePath(entrySegments);
    const entryPath = path.resolve(directoryPath, entry.name);

    if (
      !isPathInsideRoot(rootPath, entryPath) ||
      !isValidLocalDirectoryRelativePath(relativePath)
    ) {
      accumulator.errors.push({
        relativePath,
        code: "path_escape_blocked",
        message: "已阻止目录条目越过授权根目录。"
      });
      continue;
    }

    try {
      const entryStats = await lstat(entryPath);

      if (entryStats.isSymbolicLink()) {
        continue;
      }

      const canonicalEntryPath = await realpath(entryPath);

      if (!isPathInsideRoot(rootPath, canonicalEntryPath)) {
        accumulator.errors.push({
          relativePath,
          code: "path_escape_blocked",
          message: "已阻止目录条目越过授权根目录。"
        });
        continue;
      }

      if (entryStats.isDirectory()) {
        await scanDirectory(
          rootPath,
          canonicalEntryPath,
          entrySegments,
          options,
          accumulator
        );
        continue;
      }

      if (!entryStats.isFile()) {
        continue;
      }

      accumulator.totalFileCount += 1;
      const entryScan = scanLocalDirectoryEntries(
        [{ fileName: entry.name, relativePath }],
        options.parseOptions
      );
      const parsedCandidate = entryScan.candidates[0];

      if (!parsedCandidate) {
        accumulator.ignoredFileCount += 1;
        continue;
      }

      accumulator.candidates.push({
        sourceRef: {
          directoryId: options.directoryId,
          relativePath
        },
        fileName: parsedCandidate.fileName,
        relativePath,
        fileExtension: parsedCandidate.fileExtension,
        fileSize: entryStats.size,
        modifiedAt: entryStats.mtimeMs,
        albumTitle: parsedCandidate.albumTitle,
        artistName: parsedCandidate.artistName,
        trackTitle: parsedCandidate.trackTitle,
        parseStatus: parsedCandidate.parseStatus,
        issues: parsedCandidate.issues
      });
    } catch {
      accumulator.errors.push({
        relativePath,
        code: "read_file_status_failed",
        message: "无法读取该文件状态，已跳过并继续扫描。"
      });
    }
  }
}

function toPortableRelativePath(segments: readonly string[]): string {
  return segments.join("/");
}

function comparePortablePaths(left: string, right: string): number {
  const normalizedLeft = left.normalize("NFC").toLocaleLowerCase("en-US");
  const normalizedRight = right.normalize("NFC").toLocaleLowerCase("en-US");

  if (normalizedLeft < normalizedRight) {
    return -1;
  }

  if (normalizedLeft > normalizedRight) {
    return 1;
  }

  return left < right ? -1 : left > right ? 1 : 0;
}

function isMissingFileSystemError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }

  const code = error.code;
  return code === "ENOENT" || code === "ENOTDIR";
}
