import { constants } from "node:fs";
import {
  access,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { MusicLibraryError } from "./errors";
import {
  isValidMusicDirectoryId,
  type MusicDirectoryAvailability,
  type RegisteredMusicDirectory
} from "./types";

const DIRECTORY_REGISTRY_SCHEMA_VERSION = 1 as const;

interface PersistedMusicDirectory {
  directoryId: string;
  directoryPath: string;
  displayName: string;
  selectedAt: string;
}

interface PersistedDirectoryRegistry {
  schemaVersion: typeof DIRECTORY_REGISTRY_SCHEMA_VERSION;
  directories: PersistedMusicDirectory[];
}

export interface DirectoryRegistryIssue {
  code: "invalid_registry" | "registry_read_failed";
  message: string;
}

export interface DirectoryRegistryOptions {
  filePath: string;
  clock?: () => Date;
  idFactory?: () => string;
  platform?: NodeJS.Platform;
  reportIssue?: (issue: DirectoryRegistryIssue) => void;
}

export const MUSIC_DIRECTORY_REGISTRY_FILE_NAME = "music-directory-registry.json";

export class MusicDirectoryRegistry {
  private readonly filePath: string;
  private readonly clock: () => Date;
  private readonly idFactory: () => string;
  private readonly platform: NodeJS.Platform;
  private readonly reportIssue: (issue: DirectoryRegistryIssue) => void;
  private loadPromise: Promise<PersistedDirectoryRegistry> | null = null;
  private mutationTail: Promise<void> = Promise.resolve();

  constructor(options: DirectoryRegistryOptions) {
    this.filePath = options.filePath;
    this.clock = options.clock ?? (() => new Date());
    this.idFactory = options.idFactory ?? randomUUID;
    this.platform = options.platform ?? process.platform;
    this.reportIssue = options.reportIssue ?? reportDirectoryRegistryIssue;
  }

  async registerDirectory(directoryPath: string): Promise<RegisteredMusicDirectory> {
    return this.runMutation(async () => {
      const registry = await this.load();
      const canonicalPath = await resolveSelectedDirectory(directoryPath);
      const comparisonKey = normalizeDirectoryPathForComparison(
        canonicalPath,
        this.platform
      );
      const existing = registry.directories.find(
        (directory) =>
          normalizeDirectoryPathForComparison(
            directory.directoryPath,
            this.platform
          ) === comparisonKey
      );

      if (existing) {
        return toSelectedDirectory(existing, "available");
      }

      const directoryId = this.idFactory();

      if (!isValidMusicDirectoryId(directoryId)) {
        throw new MusicLibraryError(
          "registry_write_failed",
          "无法为所选音乐目录创建安全标识。"
        );
      }

      const record: PersistedMusicDirectory = {
        directoryId,
        directoryPath: canonicalPath,
        displayName: path.basename(canonicalPath) || "音乐目录",
        selectedAt: this.clock().toISOString()
      };

      registry.directories.push(record);
      await this.persist(registry);
      return toSelectedDirectory(record, "available");
    });
  }

  async listDirectories(): Promise<readonly RegisteredMusicDirectory[]> {
    await this.mutationTail;
    const registry = await this.load();

    return Promise.all(
      registry.directories.map(async (directory) =>
        toSelectedDirectory(
          directory,
          await getMusicDirectoryAvailability(directory.directoryPath)
        )
      )
    );
  }

  async resolveDirectoryPath(directoryId: string): Promise<string> {
    await this.mutationTail;
    const registry = await this.load();
    const directory = registry.directories.find(
      (candidate) => candidate.directoryId === directoryId
    );

    if (!directory) {
      throw new MusicLibraryError("unknown_directory", "未找到该音乐目录授权记录。");
    }

    return directory.directoryPath;
  }

  async forgetDirectory(directoryId: string): Promise<void> {
    await this.runMutation(async () => {
      const registry = await this.load();
      const nextDirectories = registry.directories.filter(
        (directory) => directory.directoryId !== directoryId
      );

      if (nextDirectories.length === registry.directories.length) {
        throw new MusicLibraryError("unknown_directory", "未找到该音乐目录授权记录。");
      }

      registry.directories = nextDirectories;
      await this.persist(registry);
    });
  }

  private load(): Promise<PersistedDirectoryRegistry> {
    this.loadPromise ??= this.readRegistry();
    return this.loadPromise;
  }

  private async readRegistry(): Promise<PersistedDirectoryRegistry> {
    try {
      const content = await readFile(this.filePath, "utf8");
      const parsed: unknown = JSON.parse(content);

      if (!isPersistedDirectoryRegistry(parsed, this.platform)) {
        this.reportIssue({
          code: "invalid_registry",
          message: "音乐目录注册表格式无效，已安全回退为空记录。"
        });
        return createEmptyRegistry();
      }

      return parsed;
    } catch (error) {
      if (getFileSystemErrorCode(error) === "ENOENT") {
        return createEmptyRegistry();
      }

      this.reportIssue({
        code:
          error instanceof SyntaxError ? "invalid_registry" : "registry_read_failed",
        message:
          error instanceof SyntaxError
            ? "音乐目录注册表 JSON 已损坏，已安全回退为空记录。"
            : "无法读取音乐目录注册表，已安全回退为空记录。"
      });
      return createEmptyRegistry();
    }
  }

  private async persist(registry: PersistedDirectoryRegistry): Promise<void> {
    const parentDirectory = path.dirname(this.filePath);
    const temporaryPath = path.join(
      parentDirectory,
      `${path.basename(this.filePath)}.${randomUUID()}.tmp`
    );

    try {
      await mkdir(parentDirectory, { recursive: true });
      await writeFile(temporaryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
      await rename(temporaryPath, this.filePath);
    } catch {
      throw new MusicLibraryError(
        "registry_write_failed",
        "无法保存音乐目录授权记录。"
      );
    } finally {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }

  private runMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationTail.then(operation, operation);
    this.mutationTail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
}

export function normalizeDirectoryPathForComparison(
  directoryPath: string,
  platform: NodeJS.Platform = process.platform
): string {
  const pathApi = platform === "win32" ? path.win32 : path;
  const normalized = pathApi.normalize(pathApi.resolve(directoryPath));
  const root = pathApi.parse(normalized).root;
  const withoutTrailingSeparators =
    normalized.length > root.length ? normalized.replace(/[\\/]+$/, "") : normalized;

  return platform === "win32"
    ? withoutTrailingSeparators.toLocaleLowerCase("en-US")
    : withoutTrailingSeparators;
}

async function resolveSelectedDirectory(directoryPath: string): Promise<string> {
  try {
    const resolvedPath = await realpath(path.resolve(directoryPath));
    const directoryStats = await stat(resolvedPath);

    if (!directoryStats.isDirectory()) {
      throw new MusicLibraryError("directory_unreadable", "所选项目不是可读取的目录。");
    }

    await access(resolvedPath, constants.R_OK);
    return path.normalize(resolvedPath);
  } catch (error) {
    if (error instanceof MusicLibraryError) {
      throw error;
    }

    if (isMissingFileSystemError(error)) {
      throw new MusicLibraryError("directory_missing", "所选音乐目录不存在。");
    }

    throw new MusicLibraryError("directory_unreadable", "无法读取所选音乐目录。");
  }
}

async function getMusicDirectoryAvailability(
  directoryPath: string
): Promise<MusicDirectoryAvailability> {
  try {
    const directoryStats = await stat(directoryPath);

    if (!directoryStats.isDirectory()) {
      return "missing";
    }

    await access(directoryPath, constants.R_OK);
    return "available";
  } catch (error) {
    return isMissingFileSystemError(error) ? "missing" : "unreadable";
  }
}

function createEmptyRegistry(): PersistedDirectoryRegistry {
  return {
    schemaVersion: DIRECTORY_REGISTRY_SCHEMA_VERSION,
    directories: []
  };
}

function toSelectedDirectory(
  directory: PersistedMusicDirectory,
  availability: MusicDirectoryAvailability
): RegisteredMusicDirectory {
  return {
    directoryId: directory.directoryId,
    displayName: directory.displayName,
    displayPath: directory.directoryPath,
    selectedAt: directory.selectedAt,
    availability
  };
}

function isPersistedDirectoryRegistry(
  value: unknown,
  platform: NodeJS.Platform
): value is PersistedDirectoryRegistry {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.directories)
  ) {
    return false;
  }

  const directoryIds = new Set<string>();
  const directoryKeys = new Set<string>();

  for (const directory of value.directories) {
    if (
      !isRecord(directory) ||
      !isValidMusicDirectoryId(directory.directoryId) ||
      typeof directory.directoryPath !== "string" ||
      !path.isAbsolute(directory.directoryPath) ||
      typeof directory.displayName !== "string" ||
      directory.displayName.length === 0 ||
      typeof directory.selectedAt !== "string" ||
      !Number.isFinite(Date.parse(directory.selectedAt))
    ) {
      return false;
    }

    const directoryKey = normalizeDirectoryPathForComparison(
      directory.directoryPath,
      platform
    );

    if (directoryIds.has(directory.directoryId) || directoryKeys.has(directoryKey)) {
      return false;
    }

    directoryIds.add(directory.directoryId);
    directoryKeys.add(directoryKey);
  }

  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getFileSystemErrorCode(error: unknown): string | undefined {
  return isRecord(error) && typeof error.code === "string" ? error.code : undefined;
}

function isMissingFileSystemError(error: unknown): boolean {
  const code = getFileSystemErrorCode(error);
  return code === "ENOENT" || code === "ENOTDIR";
}

function reportDirectoryRegistryIssue(issue: DirectoryRegistryIssue): void {
  console.error(`[music-library] ${issue.code}: ${issue.message}`);
}
