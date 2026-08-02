import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  isLocalAudioBindingId,
  isLocalAudioTrackId,
  type LocalAudioBindingId,
  type LocalAudioTrackId
} from "../src/types/localAudioBinding";
import { IPC_CHANNELS } from "./ipc/channels";
import {
  isDesktopAudioCandidateId,
  type DesktopAudioCandidateId,
  type DesktopMusicLibraryApi
} from "./music-library/types";

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
const CANDIDATE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

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

function candidateId(value: string): DesktopAudioCandidateId {
  if (!isDesktopAudioCandidateId(value)) {
    throw new Error(`Invalid test candidate ID: ${value}`);
  }

  return value;
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
  it("exposes only named candidate binding methods on fixed channels", async () => {
    electronMocks.invoke.mockResolvedValue({ ok: true, value: undefined });
    const bindingApi = getExposedMusicLibraryApi().bindings;
    const bindingIdRequest = { bindingId: bindingId(BINDING_ID) };
    const trackIdRequest = { trackId: trackId(TRACK_ID) };
    const bindRequest = {
      candidateId: candidateId(CANDIDATE_ID),
      trackId: trackId(TRACK_ID),
      expectedExistingBindingId: bindingId(BINDING_ID)
    };
    const unbindRequest = {
      trackId: trackId(TRACK_ID),
      expectedBindingId: bindingId(BINDING_ID)
    };

    expect(Object.keys(bindingApi).sort()).toEqual([
      "bindCandidateToTrack",
      "findByBindingId",
      "findByTrackId",
      "list",
      "unbindTrack"
    ]);
    expect(bindingApi).not.toHaveProperty("invoke");
    expect(bindingApi).not.toHaveProperty("send");
    expect(bindingApi).not.toHaveProperty("save");
    expect(bindingApi).not.toHaveProperty("removeByBindingId");
    expect(bindingApi).not.toHaveProperty("removeByTrackId");

    await bindingApi.list();
    await bindingApi.findByBindingId(bindingIdRequest);
    await bindingApi.findByTrackId(trackIdRequest);
    await bindingApi.bindCandidateToTrack(bindRequest);
    await bindingApi.unbindTrack(unbindRequest);

    expect(electronMocks.invoke.mock.calls).toEqual([
      [IPC_CHANNELS.listLocalAudioBindings],
      [IPC_CHANNELS.findLocalAudioBindingByBindingId, bindingIdRequest],
      [IPC_CHANNELS.findLocalAudioBindingByTrackId, trackIdRequest],
      [IPC_CHANNELS.bindCandidateToTrack, bindRequest],
      [IPC_CHANNELS.unbindLocalAudioTrack, unbindRequest]
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
