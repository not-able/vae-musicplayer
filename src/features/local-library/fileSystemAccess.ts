import type { AudioMappingStatus } from "../../types";

export interface LocalDirectoryHandleFile {
  file: File;
  fileHandle: FileSystemFileHandle;
  relativePath: string;
}

export interface LocalDirectoryHandleSelection {
  directoryName: string;
  files: readonly LocalDirectoryHandleFile[];
  unreadableFileCount: number;
}

interface DirectoryPickerHost {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
}

interface FileSystemReadPermissionHandle {
  queryPermission(options?: { mode: "read" }): Promise<PermissionState>;
  requestPermission(options?: { mode: "read" }): Promise<PermissionState>;
}

export function supportsDirectoryHandleSelection(
  host: DirectoryPickerHost = getBrowserDirectoryPickerHost()
): boolean {
  return typeof host.showDirectoryPicker === "function";
}

export async function pickDirectoryWithFileHandles(
  host: DirectoryPickerHost = getBrowserDirectoryPickerHost()
): Promise<LocalDirectoryHandleSelection> {
  if (!supportsDirectoryHandleSelection(host)) {
    throw new Error("当前浏览器不支持直接引用本地目录。");
  }

  const directoryHandle = await host.showDirectoryPicker?.();

  if (!directoryHandle) {
    throw new Error("未能选择本地目录。");
  }

  const files: LocalDirectoryHandleFile[] = [];
  const unreadableFileCount = await collectDirectoryFiles(
    directoryHandle,
    [directoryHandle.name],
    files
  );

  return {
    directoryName: directoryHandle.name,
    files,
    unreadableFileCount
  };
}

export async function getFileHandleReadStatus(
  fileHandle: FileSystemFileHandle
): Promise<AudioMappingStatus> {
  try {
    const permission = await getReadPermissionHandle(fileHandle).queryPermission({
      mode: "read"
    });
    return permission === "granted" ? "available" : "permission_required";
  } catch {
    return "permission_required";
  }
}

export async function requestFileHandleReadAccess(
  fileHandle: FileSystemFileHandle
): Promise<AudioMappingStatus> {
  try {
    const permission = await getReadPermissionHandle(fileHandle).requestPermission({
      mode: "read"
    });
    return permission === "granted" ? "available" : "permission_required";
  } catch {
    return "permission_required";
  }
}

function getBrowserDirectoryPickerHost(): DirectoryPickerHost {
  return globalThis as unknown as DirectoryPickerHost;
}

function getReadPermissionHandle(
  fileHandle: FileSystemFileHandle
): FileSystemReadPermissionHandle {
  return fileHandle as unknown as FileSystemReadPermissionHandle;
}

async function collectDirectoryFiles(
  directoryHandle: FileSystemDirectoryHandle,
  parentSegments: readonly string[],
  files: LocalDirectoryHandleFile[]
): Promise<number> {
  let unreadableFileCount = 0;

  for await (const [entryName, entryHandle] of directoryHandle.entries()) {
    const relativeSegments = [...parentSegments, entryName];

    if (entryHandle.kind === "directory") {
      unreadableFileCount += await collectDirectoryFiles(
        entryHandle,
        relativeSegments,
        files
      );
      continue;
    }

    try {
      files.push({
        file: await entryHandle.getFile(),
        fileHandle: entryHandle,
        relativePath: relativeSegments.join("/")
      });
    } catch {
      unreadableFileCount += 1;
    }
  }

  return unreadableFileCount;
}
