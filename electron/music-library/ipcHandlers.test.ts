import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { InMemoryLocalAudioBindingRepository } from "../../src/features/local-library/inMemoryLocalAudioBindingRepository";
import {
  createDesktopAudioSourceRef,
  isLocalAudioBindingId,
  isLocalAudioDirectoryId,
  isLocalAudioSourceId,
  isLocalAudioTrackId,
  type LocalAudioBinding,
  type LocalAudioBindingId,
  type LocalAudioDirectoryId,
  type LocalAudioSourceId,
  type LocalAudioTrackId
} from "../../src/types/localAudioBinding";
import { MusicDirectoryRegistry } from "./directoryRegistry";
import { createMusicLibraryIpcHandlers } from "./ipcHandlers";
import { DesktopMusicLibraryService } from "./musicLibraryService";

const temporaryRoots: string[] = [];
const BINDING_ID = "11111111-1111-4111-8111-111111111111";
const TRACK_ID = "track_sample_001";
const UNKNOWN_DIRECTORY_ID = "55555555-5555-4555-8555-555555555555";

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
    bindingRepository: new InMemoryLocalAudioBindingRepository(),
    selectDirectoryPath: selectDirectoryPath ?? (async () => musicDirectory)
  });
  const handlers = createMusicLibraryIpcHandlers(
    service,
    (senderUrl) => senderUrl === "trusted-renderer"
  );

  return { handlers, musicDirectory };
}

function bindingId(value: string): LocalAudioBindingId {
  if (!isLocalAudioBindingId(value)) {
    throw new Error(`Invalid test binding ID: ${value}`);
  }

  return value;
}

function trackId(value: string): LocalAudioTrackId {
  if (!isLocalAudioTrackId(value)) {
    throw new Error(`Invalid test track ID: ${value}`);
  }

  return value;
}

function sourceId(value: string): LocalAudioSourceId {
  if (!isLocalAudioSourceId(value)) {
    throw new Error(`Invalid test source ID: ${value}`);
  }

  return value;
}

function directoryId(value: string): LocalAudioDirectoryId {
  if (!isLocalAudioDirectoryId(value)) {
    throw new Error(`Invalid test directory ID: ${value}`);
  }

  return value;
}

function createBinding(directoryIdValue: string): LocalAudioBinding {
  return {
    bindingId: bindingId(BINDING_ID),
    trackId: trackId(TRACK_ID),
    source: createDesktopAudioSourceRef({
      directoryId: directoryId(directoryIdValue),
      relativePath: "album/sample.mp3"
    }),
    fileName: "sample.mp3",
    fileSize: 1024,
    modifiedAt: 1_765_000_000_000,
    availability: "unknown",
    createdAt: "2026-08-02T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z"
  };
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
    const unknownDirectoryId = UNKNOWN_DIRECTORY_ID;

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
        message: "已拒绝来自非受信 Renderer 的本地音乐库请求。"
      }
    });

    await expect(
      handlers.listLocalAudioBindings("https://untrusted.example/", [])
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "untrusted_sender" }
    });
  });

  it("returns null when the native directory dialog is canceled", async () => {
    const { handlers } = await createTestContext(async () => null);

    await expect(handlers.selectDirectory("trusted-renderer", [])).resolves.toEqual({
      ok: true,
      value: null
    });
  });

  it("saves, finds, lists and removes a desktop binding through narrow handlers", async () => {
    const { handlers } = await createTestContext();
    const selection = await handlers.selectDirectory("trusted-renderer", []);
    if (!selection.ok || selection.value === null) {
      throw new Error("Expected directory selection to succeed.");
    }

    const binding = createBinding(selection.value.directoryId);

    await expect(
      handlers.saveLocalAudioBinding("trusted-renderer", [{ binding }])
    ).resolves.toEqual({ ok: true, value: undefined });
    await expect(
      handlers.listLocalAudioBindings("trusted-renderer", [])
    ).resolves.toEqual({ ok: true, value: [binding] });
    await expect(
      handlers.findLocalAudioBindingByBindingId("trusted-renderer", [
        { bindingId: binding.bindingId }
      ])
    ).resolves.toEqual({ ok: true, value: binding });
    await expect(
      handlers.findLocalAudioBindingByTrackId("trusted-renderer", [
        { trackId: binding.trackId }
      ])
    ).resolves.toEqual({ ok: true, value: binding });
    await expect(
      handlers.removeLocalAudioBindingByTrackId("trusted-renderer", [
        { trackId: binding.trackId }
      ])
    ).resolves.toEqual({ ok: true, value: true });
    await expect(
      handlers.removeLocalAudioBindingByBindingId("trusted-renderer", [
        { bindingId: binding.bindingId }
      ])
    ).resolves.toEqual({ ok: true, value: false });
  });

  it("rejects invalid binding requests, web sources and unknown directories", async () => {
    const { handlers, musicDirectory } = await createTestContext();
    const unknownDirectoryBinding = createBinding(UNKNOWN_DIRECTORY_ID);
    const webBinding: LocalAudioBinding = {
      ...unknownDirectoryBinding,
      source: {
        type: "web-file-copy",
        sourceId: sourceId("local_audio_copy_001")
      }
    };

    await expect(
      handlers.saveLocalAudioBinding("trusted-renderer", [{ binding: webBinding }])
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid_request" }
    });
    await expect(
      handlers.saveLocalAudioBinding("trusted-renderer", [
        { binding: unknownDirectoryBinding, path: musicDirectory }
      ])
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid_request" }
    });
    await expect(
      handlers.saveLocalAudioBinding("trusted-renderer", [
        { binding: unknownDirectoryBinding }
      ])
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "unknown_directory" }
    });
    await expect(
      handlers.findLocalAudioBindingByBindingId("trusted-renderer", [
        { bindingId: "../escape" }
      ])
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid_request" }
    });
    await expect(
      handlers.listLocalAudioBindings("trusted-renderer", [])
    ).resolves.toEqual({ ok: true, value: [] });
  });
});
