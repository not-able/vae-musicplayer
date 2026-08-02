import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { MusicDirectoryRegistry } from "./directoryRegistry";
import { createMusicLibraryIpcHandlers } from "./ipcHandlers";
import { DesktopMusicLibraryService } from "./musicLibraryService";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((directoryPath) => rm(directoryPath, { recursive: true, force: true }))
  );
});

async function createTestContext(selectDirectoryPath?: () => Promise<string | null>) {
  const root = await mkdtemp(path.join(tmpdir(), "music-ipc-test-"));
  temporaryRoots.push(root);
  const musicDirectory = path.join(root, "音乐库");
  await mkdir(musicDirectory);
  const registry = new MusicDirectoryRegistry({
    filePath: path.join(root, "registry.json")
  });
  const service = new DesktopMusicLibraryService({
    registry,
    selectDirectoryPath: selectDirectoryPath ?? (async () => musicDirectory)
  });
  const handlers = createMusicLibraryIpcHandlers(
    service,
    (senderUrl) => senderUrl === "trusted-renderer"
  );

  return { handlers, musicDirectory };
}

describe("music library IPC handlers", () => {
  it("selects, restores and forgets a directory using only its opaque ID", async () => {
    const { handlers } = await createTestContext();
    const firstSelection = await handlers.selectDirectory("trusted-renderer", []);
    const duplicateSelection = await handlers.selectDirectory("trusted-renderer", []);

    expect(firstSelection.ok).toBe(true);
    expect(duplicateSelection).toEqual(firstSelection);
    if (!firstSelection.ok) {
      throw new Error("Expected directory selection to succeed.");
    }

    const directoryId = firstSelection.value?.directoryId;
    expect(directoryId).toMatch(/^[0-9a-f-]{36}$/i);
    const listResult = await handlers.listDirectories("trusted-renderer", []);
    expect(listResult).toMatchObject({
      ok: true,
      value: [{ directoryId }]
    });

    await expect(
      handlers.scanDirectory("trusted-renderer", [{ directoryId }])
    ).resolves.toMatchObject({ ok: true, value: { directoryId } });
    await expect(
      handlers.forgetDirectory("trusted-renderer", [directoryId])
    ).resolves.toEqual({ ok: true, value: undefined });
    await expect(
      handlers.scanDirectory("trusted-renderer", [{ directoryId }])
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "unknown_directory" }
    });
  });

  it("rejects invalid IDs, unknown IDs and requests that include a path", async () => {
    const { handlers, musicDirectory } = await createTestContext();
    const unknownDirectoryId = "55555555-5555-4555-8555-555555555555";

    await expect(
      handlers.scanDirectory("trusted-renderer", [{ directoryId: "../escape" }])
    ).resolves.toMatchObject({ ok: false, error: { code: "invalid_request" } });
    await expect(
      handlers.scanDirectory("trusted-renderer", [
        { directoryId: unknownDirectoryId, path: musicDirectory }
      ])
    ).resolves.toMatchObject({ ok: false, error: { code: "invalid_request" } });
    await expect(
      handlers.scanDirectory("trusted-renderer", [{ directoryId: unknownDirectoryId }])
    ).resolves.toMatchObject({ ok: false, error: { code: "unknown_directory" } });
  });

  it("rejects an otherwise valid request from an untrusted sender", async () => {
    const { handlers } = await createTestContext();

    await expect(
      handlers.listDirectories("https://untrusted.example/", [])
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "untrusted_sender",
        message: "已拒绝来自非受信 Renderer 的本地目录请求。"
      }
    });
  });

  it("returns null when the native directory dialog is canceled", async () => {
    const { handlers } = await createTestContext(async () => null);

    await expect(handlers.selectDirectory("trusted-renderer", [])).resolves.toEqual({
      ok: true,
      value: null
    });
  });
});
