import { contextBridge, ipcRenderer } from "electron";

import { IPC_CHANNELS } from "./ipc/channels";
import type { PlatformInfo } from "./ipc/contracts";
import type {
  BindCandidateToTrackRequest,
  DesktopLocalAudioBindingSummary,
  DesktopIpcResult,
  DesktopLocalAudioBindingApi,
  DesktopMusicDirectoryScanPreviewResult,
  DesktopMusicDirectorySummary,
  DesktopMusicLibraryApi,
  LocalAudioBindingIdRequest,
  LocalAudioTrackIdRequest,
  ScanMusicDirectoryRequest,
  UnbindLocalAudioTrackRequest
} from "./music-library/types";

type MusicLibraryIpcChannel =
  | typeof IPC_CHANNELS.selectMusicDirectory
  | typeof IPC_CHANNELS.listMusicDirectories
  | typeof IPC_CHANNELS.scanMusicDirectory
  | typeof IPC_CHANNELS.forgetMusicDirectory
  | typeof IPC_CHANNELS.listLocalAudioBindings
  | typeof IPC_CHANNELS.findLocalAudioBindingByBindingId
  | typeof IPC_CHANNELS.findLocalAudioBindingByTrackId
  | typeof IPC_CHANNELS.bindCandidateToTrack
  | typeof IPC_CHANNELS.unbindLocalAudioTrack;

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
  list: (): Promise<readonly DesktopLocalAudioBindingSummary[]> =>
    invokeMusicLibrary(IPC_CHANNELS.listLocalAudioBindings),
  findByBindingId: (
    request: LocalAudioBindingIdRequest
  ): Promise<DesktopLocalAudioBindingSummary | undefined> =>
    invokeMusicLibrary(IPC_CHANNELS.findLocalAudioBindingByBindingId, request),
  findByTrackId: (
    request: LocalAudioTrackIdRequest
  ): Promise<DesktopLocalAudioBindingSummary | undefined> =>
    invokeMusicLibrary(IPC_CHANNELS.findLocalAudioBindingByTrackId, request),
  bindCandidateToTrack: (
    request: BindCandidateToTrackRequest
  ): Promise<DesktopLocalAudioBindingSummary> =>
    invokeMusicLibrary(IPC_CHANNELS.bindCandidateToTrack, request),
  unbindTrack: (
    request: UnbindLocalAudioTrackRequest
  ): Promise<DesktopLocalAudioBindingSummary> =>
    invokeMusicLibrary(IPC_CHANNELS.unbindLocalAudioTrack, request)
});

const musicLibraryApi: DesktopMusicLibraryApi = Object.freeze({
  bindings: localAudioBindingApi,
  selectDirectory: (): Promise<DesktopMusicDirectorySummary | null> =>
    invokeMusicLibrary(IPC_CHANNELS.selectMusicDirectory),
  listDirectories: (): Promise<readonly DesktopMusicDirectorySummary[]> =>
    invokeMusicLibrary(IPC_CHANNELS.listMusicDirectories),
  scanDirectory: (
    request: ScanMusicDirectoryRequest
  ): Promise<DesktopMusicDirectoryScanPreviewResult> =>
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
