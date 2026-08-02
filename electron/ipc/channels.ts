export const IPC_CHANNELS = {
  getPlatformInfo: "desktop:get-platform-info",
  selectMusicDirectory: "desktop:music-library:select-directory",
  listMusicDirectories: "desktop:music-library:list-directories",
  scanMusicDirectory: "desktop:music-library:scan-directory",
  forgetMusicDirectory: "desktop:music-library:forget-directory",
  listLocalAudioBindings: "desktop:music-library:bindings:list",
  findLocalAudioBindingByBindingId: "desktop:music-library:bindings:find-by-binding-id",
  findLocalAudioBindingByTrackId: "desktop:music-library:bindings:find-by-track-id",
  saveLocalAudioBinding: "desktop:music-library:bindings:save",
  removeLocalAudioBindingByBindingId:
    "desktop:music-library:bindings:remove-by-binding-id",
  removeLocalAudioBindingByTrackId: "desktop:music-library:bindings:remove-by-track-id"
} as const;
