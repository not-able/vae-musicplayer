export const IPC_CHANNELS = {
  getPlatformInfo: "desktop:get-platform-info",
  selectMusicDirectory: "desktop:music-library:select-directory",
  listMusicDirectories: "desktop:music-library:list-directories",
  scanMusicDirectory: "desktop:music-library:scan-directory",
  forgetMusicDirectory: "desktop:music-library:forget-directory"
} as const;
