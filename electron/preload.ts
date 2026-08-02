import { contextBridge, ipcRenderer } from "electron";

import { IPC_CHANNELS } from "./ipc/channels";
import type { PlatformInfo } from "./ipc/contracts";
import type {
  DesktopIpcResult,
  DesktopMusicDirectoryScanResult,
  DesktopMusicLibraryApi,
  ScanMusicDirectoryRequest,
  SelectedMusicDirectory
} from "./music-library/types";

type MusicLibraryIpcChannel =
  | typeof IPC_CHANNELS.selectMusicDirectory
  | typeof IPC_CHANNELS.listMusicDirectories
  | typeof IPC_CHANNELS.scanMusicDirectory
  | typeof IPC_CHANNELS.forgetMusicDirectory;

async function invokeMusicLibrary<T>(
  channel: MusicLibraryIpcChannel,
  ...args: unknown[]
): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, ...args)) as DesktopIpcResult<T>;

  if (result.ok) {
    return result.value;
  }

  throw new Error(`[${result.error.code}] ${result.error.message}`);
}

const musicLibraryApi: DesktopMusicLibraryApi = Object.freeze({
  selectDirectory: (): Promise<SelectedMusicDirectory | null> =>
    invokeMusicLibrary(IPC_CHANNELS.selectMusicDirectory),
  listDirectories: (): Promise<readonly SelectedMusicDirectory[]> =>
    invokeMusicLibrary(IPC_CHANNELS.listMusicDirectories),
  scanDirectory: (
    request: ScanMusicDirectoryRequest
  ): Promise<DesktopMusicDirectoryScanResult> =>
    invokeMusicLibrary(IPC_CHANNELS.scanMusicDirectory, request),
  forgetDirectory: (directoryId: string): Promise<void> =>
    invokeMusicLibrary(IPC_CHANNELS.forgetMusicDirectory, directoryId)
});

const desktopApi = Object.freeze({
  getPlatformInfo: (): Promise<PlatformInfo> =>
    ipcRenderer.invoke(IPC_CHANNELS.getPlatformInfo),
  musicLibrary: musicLibraryApi
});

contextBridge.exposeInMainWorld("desktop", desktopApi);
