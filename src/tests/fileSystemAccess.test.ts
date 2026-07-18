import { describe, expect, it, vi } from "vitest";

import {
  getFileHandleReadStatus,
  pickDirectoryWithFileHandles,
  requestFileHandleReadAccess,
  supportsDirectoryHandleSelection
} from "../features/local-library/fileSystemAccess";

function createFileHandle(
  file: File,
  options: {
    queryPermission?: PermissionState;
    requestPermission?: PermissionState;
  } = {}
): FileSystemFileHandle {
  return {
    kind: "file",
    name: file.name,
    getFile: async () => file,
    isSameEntry: async () => true,
    queryPermission: vi.fn(async () => options.queryPermission ?? "granted"),
    requestPermission: vi.fn(async () => options.requestPermission ?? "granted")
  } as unknown as FileSystemFileHandle;
}

describe("File System Access local audio support", () => {
  it("detects an optional directory picker without making it a requirement", () => {
    expect(supportsDirectoryHandleSelection({})).toBe(false);
    expect(
      supportsDirectoryHandleSelection({
        showDirectoryPicker: async () => ({}) as FileSystemDirectoryHandle
      })
    ).toBe(true);
  });

  it("maps prompt and denied permissions to a safe reauthorization state", async () => {
    const promptHandle = createFileHandle(new File(["test"], "prompt.mp3"), {
      queryPermission: "prompt",
      requestPermission: "denied"
    });

    await expect(getFileHandleReadStatus(promptHandle)).resolves.toBe(
      "permission_required"
    );
    await expect(requestFileHandleReadAccess(promptHandle)).resolves.toBe(
      "permission_required"
    );
  });

  it("reads nested directory files with relative paths and skips unreadable files", async () => {
    const readableFile = new File(["test"], "歌曲.mp3", { type: "audio/mpeg" });
    const readableHandle = createFileHandle(readableFile);
    const unreadableHandle = {
      kind: "file",
      name: "无法读取.flac",
      getFile: async () =>
        Promise.reject(new DOMException("denied", "NotAllowedError")),
      isSameEntry: async () => true
    } as unknown as FileSystemFileHandle;
    const albumDirectory = {
      kind: "directory",
      name: "专辑甲",
      isSameEntry: async () => true,
      async *entries() {
        yield [readableFile.name, readableHandle] as [string, FileSystemFileHandle];
        yield ["无法读取.flac", unreadableHandle] as [string, FileSystemFileHandle];
      }
    } as unknown as FileSystemDirectoryHandle;
    const rootDirectory = {
      kind: "directory",
      name: "音乐库",
      isSameEntry: async () => true,
      async *entries() {
        yield [albumDirectory.name, albumDirectory] as [
          string,
          FileSystemDirectoryHandle
        ];
      }
    } as unknown as FileSystemDirectoryHandle;

    const result = await pickDirectoryWithFileHandles({
      showDirectoryPicker: async () => rootDirectory
    });

    expect(result).toEqual({
      directoryName: "音乐库",
      files: [
        {
          file: readableFile,
          fileHandle: readableHandle,
          relativePath: "音乐库/专辑甲/歌曲.mp3"
        }
      ],
      unreadableFileCount: 1
    });
  });
});
