import type { PlatformInfo } from "../../electron/ipc/contracts";

declare global {
  interface Window {
    readonly desktop: {
      readonly getPlatformInfo: () => Promise<PlatformInfo>;
    };
  }
}

export {};
