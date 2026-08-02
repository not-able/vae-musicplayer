import path from "node:path";
import { pathToFileURL } from "node:url";

import { app, BrowserWindow, dialog, shell } from "electron";

import {
  registerPlatformInfoHandler,
  unregisterPlatformInfoHandler
} from "./ipc/platformInfo";
import {
  getDevelopmentRendererUrl,
  getExternalHttpsUrl,
  isTrustedRendererUrl
} from "./security/navigation";
import {
  registerMusicLibraryIpcHandlers,
  unregisterMusicLibraryIpcHandlers
} from "./music-library/ipc";
import {
  createDesktopMusicLibraryService,
  type DesktopMusicLibraryServiceFactoryOptions
} from "./music-library/musicLibraryServiceFactory";
import type { DesktopMusicLibraryService } from "./music-library/musicLibraryService";

interface RendererTarget {
  expectedUrl: string;
  developmentUrl: URL | null;
  filePath: string | null;
}

let mainWindow: BrowserWindow | null = null;
let rendererTarget: RendererTarget | null = null;

function getRendererTarget(): RendererTarget {
  const developmentUrl = getDevelopmentRendererUrl(process.env.ELECTRON_RENDERER_URL);

  if (developmentUrl !== null) {
    return {
      expectedUrl: developmentUrl.href,
      developmentUrl,
      filePath: null
    };
  }

  const filePath = path.join(__dirname, "..", "dist", "index.html");

  return {
    expectedUrl: pathToFileURL(filePath).href,
    developmentUrl: null,
    filePath
  };
}

function openExternalHttpsLink(value: string): void {
  const externalUrl = getExternalHttpsUrl(value);

  if (externalUrl === null) {
    return;
  }

  void shell.openExternal(externalUrl).catch((error: unknown) => {
    console.error("Failed to open the external HTTPS link.", error);
  });
}

function configureNavigation(window: BrowserWindow, expectedUrl: string): void {
  const handleNavigation = (event: Electron.Event, navigationUrl: string): void => {
    if (isTrustedRendererUrl(navigationUrl, expectedUrl)) {
      return;
    }

    event.preventDefault();
    openExternalHttpsLink(navigationUrl);
  };

  window.webContents.on("will-navigate", handleNavigation);
  window.webContents.on("will-redirect", handleNavigation);
  window.webContents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternalHttpsLink(url);
    return { action: "deny" };
  });
}

async function logDevelopmentSecurityProbe(window: BrowserWindow): Promise<void> {
  const result: unknown = await window.webContents.executeJavaScript(`
    (async () => ({
      requireType: typeof globalThis.require,
      processType: typeof globalThis.process,
      desktopType: typeof globalThis.desktop,
      musicLibraryApi: {
        selectDirectoryType: typeof globalThis.desktop?.musicLibrary?.selectDirectory,
        listDirectoriesType: typeof globalThis.desktop?.musicLibrary?.listDirectories,
        scanDirectoryType: typeof globalThis.desktop?.musicLibrary?.scanDirectory,
        forgetDirectoryType: typeof globalThis.desktop?.musicLibrary?.forgetDirectory,
        bindings: {
          listType: typeof globalThis.desktop?.musicLibrary?.bindings?.list,
          findByBindingIdType: typeof globalThis.desktop?.musicLibrary?.bindings?.findByBindingId,
          findByTrackIdType: typeof globalThis.desktop?.musicLibrary?.bindings?.findByTrackId,
          bindCandidateToTrackType: typeof globalThis.desktop?.musicLibrary?.bindings?.bindCandidateToTrack,
          unbindTrackType: typeof globalThis.desktop?.musicLibrary?.bindings?.unbindTrack
        }
      },
      documentReadyState: globalThis.document.readyState,
      rootChildCount: globalThis.document.querySelector("#root")?.childElementCount ?? 0,
      platformInfo: await globalThis.desktop.getPlatformInfo()
    }))()
  `);

  console.info("[desktop] renderer security probe", result);
}

async function createMainWindow(): Promise<BrowserWindow> {
  if (rendererTarget === null) {
    throw new Error("Renderer target was not initialized.");
  }

  const preloadPath = path.join(__dirname, "preload.cjs");
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: preloadPath
    }
  });

  mainWindow = window;
  configureNavigation(window, rendererTarget.expectedUrl);

  window.once("ready-to-show", () => {
    window.show();
  });
  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  if (rendererTarget.developmentUrl !== null) {
    await window.loadURL(rendererTarget.developmentUrl.href);
    window.webContents.openDevTools({ mode: "detach" });
    await logDevelopmentSecurityProbe(window);
  } else if (rendererTarget.filePath !== null) {
    await window.loadFile(rendererTarget.filePath);
  } else {
    throw new Error("Renderer target does not contain a loadable location.");
  }

  return window;
}

function reportWindowCreationError(error: unknown): void {
  console.error("Failed to create the Electron main window.", error);
}

function createMusicLibraryService(): DesktopMusicLibraryService {
  const options: DesktopMusicLibraryServiceFactoryOptions = {
    userDataPath: app.getPath("userData"),
    selectDirectoryPath: async () => {
      const options: Electron.OpenDialogOptions = {
        title: "选择本地音乐目录",
        properties: ["openDirectory"]
      };
      const result = mainWindow
        ? await dialog.showOpenDialog(mainWindow, options)
        : await dialog.showOpenDialog(options);

      return result.canceled ? null : (result.filePaths[0] ?? null);
    }
  };

  return createDesktopMusicLibraryService(options);
}

if (process.platform === "win32") {
  app.setAppUserModelId("com.vaemusic.desktop");
}

void app
  .whenReady()
  .then(async () => {
    rendererTarget = getRendererTarget();
    const isTrustedSender = (senderUrl: string) =>
      isTrustedRendererUrl(senderUrl, rendererTarget?.expectedUrl ?? "");

    registerPlatformInfoHandler(isTrustedSender);
    registerMusicLibraryIpcHandlers(createMusicLibraryService(), isTrustedSender);
    await createMainWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void createMainWindow().catch(reportWindowCreationError);
      }
    });
  })
  .catch((error: unknown) => {
    console.error("Electron application startup failed.", error);
    app.exit(1);
  });

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  unregisterPlatformInfoHandler();
  unregisterMusicLibraryIpcHandlers();
});
