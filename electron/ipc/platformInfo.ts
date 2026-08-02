import { app, ipcMain } from "electron";

import { IPC_CHANNELS } from "./channels";
import type { PlatformInfo } from "./contracts";

type TrustedSenderCheck = (senderUrl: string) => boolean;

let isHandlerRegistered = false;

function getPlatformInfo(): PlatformInfo {
  return {
    platform: process.platform,
    arch: process.arch,
    electronVersion: process.versions.electron,
    appVersion: app.getVersion()
  };
}

export function registerPlatformInfoHandler(isTrustedSender: TrustedSenderCheck): void {
  if (isHandlerRegistered) {
    return;
  }

  ipcMain.handle(IPC_CHANNELS.getPlatformInfo, (event) => {
    const senderUrl = event.senderFrame?.url ?? event.sender.getURL();

    if (!isTrustedSender(senderUrl)) {
      throw new Error("Rejected platform info request from an untrusted renderer.");
    }

    return getPlatformInfo();
  });

  isHandlerRegistered = true;
}

export function unregisterPlatformInfoHandler(): void {
  if (!isHandlerRegistered) {
    return;
  }

  ipcMain.removeHandler(IPC_CHANNELS.getPlatformInfo);
  isHandlerRegistered = false;
}
