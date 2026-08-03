import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../app/App";
import { mockCatalog } from "../data/catalog/mockCatalog";
import { createEmptyUserCatalogChanges } from "../features/catalog/catalogMutations";
import type { CatalogDeletionIntentRepository } from "../features/catalog/catalogDeletionRepository";
import type { LocalCatalogRepository } from "../features/catalog/localCatalogRepository";
import type { LocalAudioFileRepository } from "../features/local-library/localAudioRepository";
import type { TemporaryPlaylistRepository } from "../features/playlist/playlistRepository";
import type { LocalAudioFileRecord, UserCatalogChanges } from "../types";

function createDirectoryFile(relativePath: string): File {
  const file = new File(
    ["self-created test bytes"],
    relativePath.split("/").at(-1) ?? "",
    {
      type: "audio/mpeg"
    }
  );
  Object.defineProperty(file, "webkitRelativePath", { value: relativePath });
  return file;
}

function createCatalogRepository(options: { failSave?: boolean } = {}): {
  repository: LocalCatalogRepository;
  save: ReturnType<typeof vi.fn>;
} {
  const save = vi.fn(async (changes: UserCatalogChanges) => {
    void changes;
    if (options.failSave) {
      throw new Error("storage failed");
    }
  });

  return {
    repository: {
      load: vi.fn(async () => createEmptyUserCatalogChanges()),
      save,
      clear: vi.fn(async () => undefined)
    },
    save
  };
}

function createAudioRepository(
  save: (record: LocalAudioFileRecord) => Promise<void> = async () => undefined
): LocalAudioFileRepository {
  return {
    list: vi.fn(async () => []),
    save: vi.fn(save),
    remove: vi.fn(async () => undefined)
  };
}

function createPlaylistRepository(): TemporaryPlaylistRepository {
  return {
    load: vi.fn(async () => null),
    save: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined)
  };
}

function createDeletionIntentRepository(): CatalogDeletionIntentRepository {
  return {
    load: vi.fn(async () => null),
    save: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined)
  };
}

function selectDirectory(container: HTMLElement, files: readonly File[]) {
  const input = container.querySelector<HTMLInputElement>(
    'input[aria-label="选择本地音乐目录"]'
  );

  if (!input) {
    throw new Error("Directory input is unavailable.");
  }

  Object.defineProperty(input, "files", {
    configurable: true,
    value: files
  });
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function openLocalDirectoryImport(container: HTMLElement): HTMLButtonElement {
  const button = findButtonByText(container, "批量绑定音频");

  button.click();
  return button;
}

function findButtonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find(
    (element) => element.textContent?.trim() === text
  );

  if (!button) {
    throw new Error(`Missing button: ${text}`);
  }
  return button;
}

async function flushCatalogDeletionRecovery(container: HTMLElement) {
  await act(async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      const input = container.querySelector<HTMLInputElement>(
        'input[aria-label="选择本地音乐目录"]'
      );
      if (input && !input.disabled) {
        return;
      }
    }
  });
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "desktop");
  vi.restoreAllMocks();
});

describe("local directory import integration", () => {
  it("uses the desktop scan preview branch without invoking binding writes", async () => {
    const listDirectories = vi.fn(async () => []);
    const bindCandidateToTrack = vi.fn(async () => undefined);
    Object.defineProperty(globalThis, "desktop", {
      configurable: true,
      value: {
        musicLibrary: {
          listDirectories,
          selectDirectory: vi.fn(async () => null),
          scanDirectory: vi.fn(),
          bindings: {
            list: vi.fn(async () => []),
            findByBindingId: vi.fn(async () => undefined),
            findByTrackId: vi.fn(async () => undefined),
            bindCandidateToTrack,
            unbindTrack: vi.fn(async () => undefined)
          }
        }
      }
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(App, {
          catalogRepository: createCatalogRepository().repository,
          localAudioRepository: createAudioRepository(),
          playlistRepository: createPlaylistRepository(),
          deletionIntentRepository: createDeletionIntentRepository()
        })
      );
    });
    await flushCatalogDeletionRecovery(container);

    await act(async () => {
      findButtonByText(container, "扫描本地音频").click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain("扫描并绑定本地音频");
    expect(
      container.querySelector('[aria-label="桌面音乐目录扫描预览"]')
    ).not.toBeNull();
    expect(container.querySelector('input[aria-label="选择本地音乐目录"]')).toBeNull();
    expect(listDirectories).toHaveBeenCalledTimes(1);
    expect(bindCandidateToTrack).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    container.remove();
  });

  it("opens and closes the compact batch-binding dialog without losing keyboard focus", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(App, {
          catalogRepository: createCatalogRepository().repository,
          localAudioRepository: createAudioRepository(),
          playlistRepository: createPlaylistRepository(),
          deletionIntentRepository: createDeletionIntentRepository()
        })
      );
    });
    await flushCatalogDeletionRecovery(container);

    let trigger!: HTMLButtonElement;
    await act(async () => {
      trigger = openLocalDirectoryImport(container);
    });
    const dialog = container.querySelector<HTMLElement>(
      "#local-directory-import-dialog"
    );
    const backdrop = dialog?.parentElement;

    expect(backdrop?.hidden).toBe(false);
    expect(dialog?.getAttribute("role")).toBe("dialog");

    const closeButton = dialog?.querySelector<HTMLButtonElement>(
      'button[aria-label="关闭批量绑定本地音频"]'
    );
    expect(closeButton).toBeDefined();

    await act(async () => {
      closeButton?.click();
    });

    expect(backdrop?.hidden).toBe(true);
    expect(backdrop && getComputedStyle(backdrop).display).toBe("none");
    expect(document.activeElement).toBe(trigger);

    await act(async () => root.unmount());
    container.remove();
  });

  it("cancels a preview without writing catalog or audio storage", async () => {
    const { repository: catalogRepository, save: saveCatalog } =
      createCatalogRepository();
    const audioRepository = createAudioRepository();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const album = mockCatalog.albums[0];
    const track = mockCatalog.tracks[0];

    await act(async () => {
      root.render(
        createElement(App, {
          catalogRepository,
          localAudioRepository: audioRepository,
          playlistRepository: createPlaylistRepository(),
          deletionIntentRepository: createDeletionIntentRepository()
        })
      );
    });
    await flushCatalogDeletionRecovery(container);
    await act(async () => {
      selectDirectory(container, [
        createDirectoryFile(`${album.title}/${track.title}.mp3`)
      ]);
    });

    expect(container.querySelector(".directory-import-preview")).not.toBeNull();
    await act(async () => {
      findButtonByText(container, "取消预览").click();
    });

    expect(container.querySelector(".directory-import-preview")).toBeNull();
    expect(saveCatalog).not.toHaveBeenCalled();
    expect(audioRepository.save).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    container.remove();
  });

  it("reports partial audio saves while retaining successful bindings", async () => {
    const { repository: catalogRepository, save: saveCatalog } =
      createCatalogRepository();
    let attempts = 0;
    const audioRepository = createAudioRepository(async () => {
      attempts += 1;
      if (attempts === 2) {
        throw new Error("quota");
      }
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const album = mockCatalog.albums[0];
    const tracks = mockCatalog.tracks.filter((track) => track.albumId === album.id);

    await act(async () => {
      root.render(
        createElement(App, {
          catalogRepository,
          localAudioRepository: audioRepository,
          playlistRepository: createPlaylistRepository(),
          deletionIntentRepository: createDeletionIntentRepository()
        })
      );
    });
    await flushCatalogDeletionRecovery(container);
    await act(async () => {
      selectDirectory(
        container,
        tracks.map((track) => createDirectoryFile(`${album.title}/${track.title}.mp3`))
      );
    });
    await act(async () => {
      const confirmButton = findButtonByText(container, "确认导入 2 个文件");
      expect(confirmButton.disabled).toBe(false);
      confirmButton.click();
    });

    expect(saveCatalog).not.toHaveBeenCalled();
    expect(audioRepository.save).toHaveBeenCalledTimes(2);
    expect(container.querySelector(".directory-import-result")?.textContent).toContain(
      "成功保存音频 1 个、失败 1 个"
    );

    await act(async () => root.unmount());
    container.remove();
  });

  it("creates confirmed new-album metadata once before saving its local file", async () => {
    const { repository: catalogRepository, save: saveCatalog } =
      createCatalogRepository();
    const audioRepository = createAudioRepository();
    const entityIds = ["album_new", "track_new"];
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(App, {
          catalogRepository,
          catalogEntityIdFactory: () => entityIds.shift() ?? "unexpected_id",
          localAudioRepository: audioRepository,
          playlistRepository: createPlaylistRepository(),
          deletionIntentRepository: createDeletionIntentRepository()
        })
      );
    });
    await flushCatalogDeletionRecovery(container);
    await act(async () => {
      selectDirectory(container, [createDirectoryFile("New Album/New Song.mp3")]);
    });
    const draftCheckbox = container.querySelector<HTMLInputElement>(
      ".directory-import-draft input"
    );
    if (!draftCheckbox) {
      throw new Error("New-album draft was not rendered.");
    }
    await act(async () => {
      draftCheckbox.click();
    });
    await act(async () => {
      const confirmButton = findButtonByText(container, "确认导入 1 个文件");
      expect(confirmButton.disabled).toBe(false);
      confirmButton.click();
    });

    expect(saveCatalog).toHaveBeenCalledTimes(1);
    expect(audioRepository.save).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".directory-import-result")?.textContent).toContain(
      "新建专辑 1 张、新建歌曲 1 首"
    );

    await act(async () => root.unmount());
    container.remove();
  });

  it("does not write a new album's audio file when metadata storage fails", async () => {
    const { repository: catalogRepository, save: saveCatalog } =
      createCatalogRepository({
        failSave: true
      });
    const audioRepository = createAudioRepository();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const entityIds = ["album_failure", "track_failure"];

    await act(async () => {
      root.render(
        createElement(App, {
          catalogRepository,
          catalogEntityIdFactory: () => entityIds.shift() ?? "unexpected_id",
          localAudioRepository: audioRepository,
          playlistRepository: createPlaylistRepository(),
          deletionIntentRepository: createDeletionIntentRepository()
        })
      );
    });
    await flushCatalogDeletionRecovery(container);
    await act(async () => {
      selectDirectory(container, [createDirectoryFile("Fail Album/Fail Song.mp3")]);
    });
    const draftCheckbox = container.querySelector<HTMLInputElement>(
      ".directory-import-draft input"
    );
    if (!draftCheckbox) {
      throw new Error("New-album draft was not rendered.");
    }
    await act(async () => {
      draftCheckbox.click();
    });
    await act(async () => {
      const confirmButton = findButtonByText(container, "确认导入 1 个文件");
      expect(confirmButton.disabled).toBe(false);
      confirmButton.click();
    });

    expect(saveCatalog).toHaveBeenCalledTimes(1);
    expect(audioRepository.save).not.toHaveBeenCalled();
    expect(container.querySelector(".directory-import-result")?.textContent).toContain(
      "未写入音频"
    );

    await act(async () => root.unmount());
    container.remove();
  });
});
