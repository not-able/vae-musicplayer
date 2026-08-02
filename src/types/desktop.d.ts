import type { PlatformInfo } from "../../electron/ipc/contracts";
import type { DesktopMusicLibraryApi } from "../../electron/music-library/types";

declare global {
  interface Window {
    readonly desktop: {
      readonly getPlatformInfo: () => Promise<PlatformInfo>;
      readonly musicLibrary: DesktopMusicLibraryApi;
    };
  }
}

export {};
