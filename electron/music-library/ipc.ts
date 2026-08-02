import { ipcMain } from "electron";

import { IPC_CHANNELS } from "../ipc/channels";
import { createMusicLibraryIpcHandlers } from "./ipcHandlers";
import type { DesktopMusicLibraryService } from "./musicLibraryService";

type TrustedSenderCheck = (senderUrl: string) => boolean;

let areHandlersRegistered = false;

export function registerMusicLibraryIpcHandlers(
  service: DesktopMusicLibraryService,
  isTrustedSender: TrustedSenderCheck
): void {
  if (areHandlersRegistered) {
    return;
  }

  const handlers = createMusicLibraryIpcHandlers(service, isTrustedSender);
  ipcMain.handle(IPC_CHANNELS.selectMusicDirectory, (event, ...args: unknown[]) =>
    handlers.selectDirectory(getSenderUrl(event), args)
  );
  ipcMain.handle(IPC_CHANNELS.listMusicDirectories, (event, ...args: unknown[]) =>
    handlers.listDirectories(getSenderUrl(event), args)
  );
  ipcMain.handle(IPC_CHANNELS.scanMusicDirectory, (event, ...args: unknown[]) =>
    handlers.scanDirectory(getSenderUrl(event), args)
  );
  ipcMain.handle(IPC_CHANNELS.forgetMusicDirectory, (event, ...args: unknown[]) =>
    handlers.forgetDirectory(getSenderUrl(event), args)
  );
  ipcMain.handle(IPC_CHANNELS.listLocalAudioBindings, (event, ...args: unknown[]) =>
    handlers.listLocalAudioBindings(getSenderUrl(event), args)
  );
  ipcMain.handle(
    IPC_CHANNELS.findLocalAudioBindingByBindingId,
    (event, ...args: unknown[]) =>
      handlers.findLocalAudioBindingByBindingId(getSenderUrl(event), args)
  );
  ipcMain.handle(
    IPC_CHANNELS.findLocalAudioBindingByTrackId,
    (event, ...args: unknown[]) =>
      handlers.findLocalAudioBindingByTrackId(getSenderUrl(event), args)
  );
  ipcMain.handle(IPC_CHANNELS.saveLocalAudioBinding, (event, ...args: unknown[]) =>
    handlers.saveLocalAudioBinding(getSenderUrl(event), args)
  );
  ipcMain.handle(
    IPC_CHANNELS.removeLocalAudioBindingByBindingId,
    (event, ...args: unknown[]) =>
      handlers.removeLocalAudioBindingByBindingId(getSenderUrl(event), args)
  );
  ipcMain.handle(
    IPC_CHANNELS.removeLocalAudioBindingByTrackId,
    (event, ...args: unknown[]) =>
      handlers.removeLocalAudioBindingByTrackId(getSenderUrl(event), args)
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
  ipcMain.removeHandler(IPC_CHANNELS.saveLocalAudioBinding);
  ipcMain.removeHandler(IPC_CHANNELS.removeLocalAudioBindingByBindingId);
  ipcMain.removeHandler(IPC_CHANNELS.removeLocalAudioBindingByTrackId);
  areHandlersRegistered = false;
}

function getSenderUrl(event: Electron.IpcMainInvokeEvent): string {
  return event.senderFrame?.url ?? event.sender.getURL();
}
