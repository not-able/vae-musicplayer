import { describe, expect, it, vi } from "vitest";

import { IPC_CHANNELS } from "../ipc/channels";
import {
  registerMusicLibraryIpcHandlers,
  unregisterMusicLibraryIpcHandlers
} from "./ipc";
import type { DesktopMusicLibraryService } from "./musicLibraryService";

const electronMocks = vi.hoisted(() => ({
  handle: vi.fn(),
  removeHandler: vi.fn()
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: electronMocks.handle,
    removeHandler: electronMocks.removeHandler
  }
}));

describe("music library IPC registration", () => {
  it("registers and removes every fixed binding channel exactly once", () => {
    const service = {} as DesktopMusicLibraryService;
    const expectedChannels = [
      IPC_CHANNELS.selectMusicDirectory,
      IPC_CHANNELS.listMusicDirectories,
      IPC_CHANNELS.scanMusicDirectory,
      IPC_CHANNELS.forgetMusicDirectory,
      IPC_CHANNELS.listLocalAudioBindings,
      IPC_CHANNELS.findLocalAudioBindingByBindingId,
      IPC_CHANNELS.findLocalAudioBindingByTrackId,
      IPC_CHANNELS.saveLocalAudioBinding,
      IPC_CHANNELS.removeLocalAudioBindingByBindingId,
      IPC_CHANNELS.removeLocalAudioBindingByTrackId
    ];

    registerMusicLibraryIpcHandlers(service, () => true);
    registerMusicLibraryIpcHandlers(service, () => true);

    expect(electronMocks.handle.mock.calls.map(([channel]) => channel)).toEqual(
      expectedChannels
    );

    unregisterMusicLibraryIpcHandlers();
    unregisterMusicLibraryIpcHandlers();

    expect(electronMocks.removeHandler.mock.calls.map(([channel]) => channel)).toEqual(
      expectedChannels
    );
  });
});
