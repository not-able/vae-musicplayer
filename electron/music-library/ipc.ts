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
  areHandlersRegistered = false;
}

function getSenderUrl(event: Electron.IpcMainInvokeEvent): string {
  return event.senderFrame?.url ?? event.sender.getURL();
}
