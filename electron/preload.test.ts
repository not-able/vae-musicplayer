import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createDesktopAudioSourceRef,
  isLocalAudioBindingId,
  isLocalAudioDirectoryId,
  isLocalAudioTrackId,
  type LocalAudioBinding,
  type LocalAudioBindingId,
  type LocalAudioDirectoryId,
  type LocalAudioTrackId
} from "../src/types/localAudioBinding";
import { IPC_CHANNELS } from "./ipc/channels";
import type { DesktopMusicLibraryApi } from "./music-library/types";

const electronMocks = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn()
}));

vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld: electronMocks.exposeInMainWorld
  },
  ipcRenderer: {
    invoke: electronMocks.invoke
  }
}));

await import("./preload");

const BINDING_ID = "11111111-1111-4111-8111-111111111111";
const TRACK_ID = "track_sample_001";
const DIRECTORY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

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

function directoryId(value: string): LocalAudioDirectoryId {
  if (!isLocalAudioDirectoryId(value)) {
    throw new Error(`Invalid test directory ID: ${value}`);
  }

  return value;
}

function createBinding(): LocalAudioBinding {
  return {
    bindingId: bindingId(BINDING_ID),
    trackId: trackId(TRACK_ID),
    source: createDesktopAudioSourceRef({
      directoryId: directoryId(DIRECTORY_ID),
      relativePath: "album/sample.mp3"
    }),
    fileName: "sample.mp3",
    availability: "unknown",
    createdAt: "2026-08-02T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z"
  };
}

function getExposedMusicLibraryApi(): DesktopMusicLibraryApi {
  const exposeCall = electronMocks.exposeInMainWorld.mock.calls[0];

  if (exposeCall?.[0] !== "desktop") {
    throw new Error("Expected preload to expose the desktop API.");
  }

  return (exposeCall[1] as { musicLibrary: DesktopMusicLibraryApi }).musicLibrary;
}

beforeEach(() => {
  electronMocks.invoke.mockReset();
});

describe("preload local audio binding API", () => {
  it("exposes only named binding methods and routes them to fixed channels", async () => {
    electronMocks.invoke.mockResolvedValue({ ok: true, value: undefined });
    const musicLibraryApi = getExposedMusicLibraryApi();
    const binding = createBinding();
    const bindingIdRequest = { bindingId: binding.bindingId };
    const trackIdRequest = { trackId: binding.trackId };

    expect(Object.keys(musicLibraryApi.bindings).sort()).toEqual([
      "findByBindingId",
      "findByTrackId",
      "list",
      "removeByBindingId",
      "removeByTrackId",
      "save"
    ]);
    expect(musicLibraryApi.bindings).not.toHaveProperty("invoke");
    expect(musicLibraryApi.bindings).not.toHaveProperty("send");

    await musicLibraryApi.bindings.list();
    await musicLibraryApi.bindings.findByBindingId(bindingIdRequest);
    await musicLibraryApi.bindings.findByTrackId(trackIdRequest);
    await musicLibraryApi.bindings.save({ binding });
    await musicLibraryApi.bindings.removeByBindingId(bindingIdRequest);
    await musicLibraryApi.bindings.removeByTrackId(trackIdRequest);

    expect(electronMocks.invoke.mock.calls).toEqual([
      [IPC_CHANNELS.listLocalAudioBindings],
      [IPC_CHANNELS.findLocalAudioBindingByBindingId, bindingIdRequest],
      [IPC_CHANNELS.findLocalAudioBindingByTrackId, trackIdRequest],
      [IPC_CHANNELS.saveLocalAudioBinding, { binding }],
      [IPC_CHANNELS.removeLocalAudioBindingByBindingId, bindingIdRequest],
      [IPC_CHANNELS.removeLocalAudioBindingByTrackId, trackIdRequest]
    ]);
  });

  it("turns a stable IPC error payload into a renderer error", async () => {
    electronMocks.invoke.mockResolvedValue({
      ok: false,
      error: {
        code: "binding_store_read_failed",
        message: "无法读取本地音频绑定数据。"
      }
    });

    await expect(getExposedMusicLibraryApi().bindings.list()).rejects.toThrow(
      "[binding_store_read_failed] 无法读取本地音频绑定数据。"
    );
  });
});
