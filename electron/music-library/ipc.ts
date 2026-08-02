import { ipcMain } from "electron";

import { IPC_CHANNELS } from "../ipc/channels";
import { createMusicLibraryIpcHandlers } from "./ipcHandlers";
import type { DesktopMusicLibraryService } from "./musicLibraryService";

type TrustedSenderCheck = (senderUrl: string) => boolean;

let areHandlersRegistered = false;
const trackedCandidateOwners = new WeakSet<Electron.WebContents>();

export function registerMusicLibraryIpcHandlers(
  service: DesktopMusicLibraryService,
  isTrustedSender: TrustedSenderCheck
): void {
  if (areHandlersRegistered) {
    return;
  }

  const handlers = createMusicLibraryIpcHandlers(service, isTrustedSender);
  ipcMain.handle(IPC_CHANNELS.selectMusicDirectory, (event, ...args: unknown[]) =>
    handlers.selectDirectory(getSender(event), args)
  );
  ipcMain.handle(IPC_CHANNELS.listMusicDirectories, (event, ...args: unknown[]) =>
    handlers.listDirectories(getSender(event), args)
  );
  ipcMain.handle(IPC_CHANNELS.scanMusicDirectory, (event, ...args: unknown[]) => {
    trackCandidateOwner(event.sender, service);
    return handlers.scanDirectory(getSender(event), args);
  });
  ipcMain.handle(IPC_CHANNELS.forgetMusicDirectory, (event, ...args: unknown[]) =>
    handlers.forgetDirectory(getSender(event), args)
  );
  ipcMain.handle(IPC_CHANNELS.listLocalAudioBindings, (event, ...args: unknown[]) =>
    handlers.listLocalAudioBindings(getSender(event), args)
  );
  ipcMain.handle(
    IPC_CHANNELS.findLocalAudioBindingByBindingId,
    (event, ...args: unknown[]) =>
      handlers.findLocalAudioBindingByBindingId(getSender(event), args)
  );
  ipcMain.handle(
    IPC_CHANNELS.findLocalAudioBindingByTrackId,
    (event, ...args: unknown[]) =>
      handlers.findLocalAudioBindingByTrackId(getSender(event), args)
  );
  ipcMain.handle(IPC_CHANNELS.bindCandidateToTrack, (event, ...args: unknown[]) =>
    handlers.bindCandidateToTrack(getSender(event), args)
  );
  ipcMain.handle(IPC_CHANNELS.unbindLocalAudioTrack, (event, ...args: unknown[]) =>
    handlers.unbindTrack(getSender(event), args)
  );
  areHandlersRegistered = true;
}

export function unregisterMusicLibraryIpcHandlers(): void {
  if (!areHandlersRegistered) {
    return;
  }

  ipcMain.removeHandler(IPC_CHANNELS.selectMusicDirectory);
  ipcMain.removeHandler(IPC_CHANNELS.listMusicDirectories);
  ipcMain.removeHandler(IPC_CHANNELS.scanMusicDirectory);
  ipcMain.removeHandler(IPC_CHANNELS.forgetMusicDirectory);
  ipcMain.removeHandler(IPC_CHANNELS.listLocalAudioBindings);
  ipcMain.removeHandler(IPC_CHANNELS.findLocalAudioBindingByBindingId);
  ipcMain.removeHandler(IPC_CHANNELS.findLocalAudioBindingByTrackId);
  ipcMain.removeHandler(IPC_CHANNELS.bindCandidateToTrack);
  ipcMain.removeHandler(IPC_CHANNELS.unbindLocalAudioTrack);
  areHandlersRegistered = false;
}

function getSender(event: Electron.IpcMainInvokeEvent) {
  return {
    webContentsId: event.sender.id,
    url: event.senderFrame?.url ?? event.sender.getURL()
  };
}

function trackCandidateOwner(
  sender: Electron.WebContents,
  service: DesktopMusicLibraryService
): void {
  if (trackedCandidateOwners.has(sender)) {
    return;
  }

  trackedCandidateOwners.add(sender);
  const ownerId = sender.id;
  sender.once("destroyed", () => {
    service.invalidateCandidatesForOwner(ownerId);
  });
}
