import { contextBridge, ipcRenderer } from "electron";

import type { LocalAudioBinding } from "../src/types/localAudioBinding";
import { IPC_CHANNELS } from "./ipc/channels";
import type { PlatformInfo } from "./ipc/contracts";
import type {
  DesktopIpcResult,
  DesktopLocalAudioBindingApi,
  DesktopMusicDirectoryScanResult,
  DesktopMusicLibraryApi,
  LocalAudioBindingIdRequest,
  LocalAudioTrackIdRequest,
  SaveLocalAudioBindingRequest,
  ScanMusicDirectoryRequest,
  SelectedMusicDirectory
} from "./music-library/types";

type MusicLibraryIpcChannel =
  | typeof IPC_CHANNELS.selectMusicDirectory
  | typeof IPC_CHANNELS.listMusicDirectories
  | typeof IPC_CHANNELS.scanMusicDirectory
  | typeof IPC_CHANNELS.forgetMusicDirectory
  | typeof IPC_CHANNELS.listLocalAudioBindings
  | typeof IPC_CHANNELS.findLocalAudioBindingByBindingId
  | typeof IPC_CHANNELS.findLocalAudioBindingByTrackId
  | typeof IPC_CHANNELS.saveLocalAudioBinding
  | typeof IPC_CHANNELS.removeLocalAudioBindingByBindingId
  | typeof IPC_CHANNELS.removeLocalAudioBindingByTrackId;

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

const localAudioBindingApi: DesktopLocalAudioBindingApi = Object.freeze({
  list: (): Promise<readonly LocalAudioBinding[]> =>
    invokeMusicLibrary(IPC_CHANNELS.listLocalAudioBindings),
  findByBindingId: (
    request: LocalAudioBindingIdRequest
  ): Promise<LocalAudioBinding | undefined> =>
    invokeMusicLibrary(IPC_CHANNELS.findLocalAudioBindingByBindingId, request),
  findByTrackId: (
    request: LocalAudioTrackIdRequest
  ): Promise<LocalAudioBinding | undefined> =>
    invokeMusicLibrary(IPC_CHANNELS.findLocalAudioBindingByTrackId, request),
  save: (request: SaveLocalAudioBindingRequest): Promise<void> =>
    invokeMusicLibrary(IPC_CHANNELS.saveLocalAudioBinding, request),
  removeByBindingId: (request: LocalAudioBindingIdRequest): Promise<boolean> =>
    invokeMusicLibrary(IPC_CHANNELS.removeLocalAudioBindingByBindingId, request),
  removeByTrackId: (request: LocalAudioTrackIdRequest): Promise<boolean> =>
    invokeMusicLibrary(IPC_CHANNELS.removeLocalAudioBindingByTrackId, request)
});

const musicLibraryApi: DesktopMusicLibraryApi = Object.freeze({
  bindings: localAudioBindingApi,
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
