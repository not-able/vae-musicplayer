import { contextBridge, ipcRenderer } from "electron";

import { IPC_CHANNELS } from "./ipc/channels";
import type { PlatformInfo } from "./ipc/contracts";

const desktopApi = Object.freeze({
  getPlatformInfo: (): Promise<PlatformInfo> =>
    ipcRenderer.invoke(IPC_CHANNELS.getPlatformInfo)
});

contextBridge.exposeInMainWorld("desktop", desktopApi);
