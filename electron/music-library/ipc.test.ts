import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

beforeEach(() => {
  unregisterMusicLibraryIpcHandlers();
  electronMocks.handle.mockReset();
  electronMocks.removeHandler.mockReset();
});

afterEach(() => {
  unregisterMusicLibraryIpcHandlers();
});

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
      IPC_CHANNELS.bindCandidateToTrack,
      IPC_CHANNELS.unbindLocalAudioTrack
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

  it("uses the event webContents ID as candidate owner and expires it on destroy", async () => {
    const scanDirectory = vi.fn(async () => ({
      scannedAt: "2026-08-02T00:00:00.000Z",
      totalFileCount: 0,
      supportedFileCount: 0,
      ignoredFileCount: 0,
      errorCount: 0,
      candidates: [],
      errors: []
    }));
    const invalidateCandidatesForOwner = vi.fn();
    const service = {
      scanDirectory,
      invalidateCandidatesForOwner
    } as unknown as DesktopMusicLibraryService;
    registerMusicLibraryIpcHandlers(service, () => true);
    const scanRegistration = electronMocks.handle.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.scanMusicDirectory
    );
    const scanHandler = scanRegistration?.[1] as
      ((event: unknown, request: unknown) => Promise<unknown>) | undefined;
    let destroyedCallback: (() => void) | undefined;
    const sender = {
      id: 77,
      getURL: () => "trusted-renderer",
      once: vi.fn((eventName: string, callback: () => void) => {
        if (eventName === "destroyed") {
          destroyedCallback = callback;
        }
      })
    };

    await expect(
      scanHandler?.(
        { sender, senderFrame: { url: "trusted-renderer" } },
        { directoryId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }
      )
    ).resolves.toMatchObject({ ok: true });
    expect(scanDirectory).toHaveBeenCalledWith(
      77,
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    );
    expect(sender.once).toHaveBeenCalledTimes(1);

    destroyedCallback?.();
    expect(invalidateCandidatesForOwner).toHaveBeenCalledWith(77);
  });
});
