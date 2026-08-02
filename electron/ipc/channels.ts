export const IPC_CHANNELS = {
  getPlatformInfo: "desktop:get-platform-info",
  selectMusicDirectory: "desktop:music-library:select-directory",
  listMusicDirectories: "desktop:music-library:list-directories",
  scanMusicDirectory: "desktop:music-library:scan-directory",
  forgetMusicDirectory: "desktop:music-library:forget-directory",
  listLocalAudioBindings: "desktop:music-library:bindings:list",
  findLocalAudioBindingByBindingId: "desktop:music-library:bindings:find-by-binding-id",
  findLocalAudioBindingByTrackId: "desktop:music-library:bindings:find-by-track-id",
  bindCandidateToTrack: "desktop:music-library:bindings:bind-candidate-to-track",
  unbindLocalAudioTrack: "desktop:music-library:bindings:unbind-track"
} as const;
