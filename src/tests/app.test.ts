import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../app/App";
import { mockCatalog } from "../data/catalog/mockCatalog";
import {
  addAlbumToUserCatalog,
  addTrackToUserCatalog,
  createEmptyUserCatalogChanges
} from "../features/catalog/catalogMutations";
import type { LocalCatalogRepository } from "../features/catalog/localCatalogRepository";
import { createLocalAudioFileRecord } from "../features/local-library/localAudioFile";
import type { LocalAudioFileRepository } from "../features/local-library/localAudioRepository";
import type { LocalAudioFileRecord, UserCatalogChanges } from "../types";
import {
  ALBUM_DRAG_MIME_TYPE,
  PLAYLIST_ITEM_DRAG_MIME_TYPE,
  TRACK_DRAG_MIME_TYPE
} from "../utils/albumDrag";

function findButton(container: HTMLElement, ariaLabel: string) {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => button.getAttribute("aria-label") === ariaLabel
  );
}

function createDataTransfer(): DataTransfer {
  const values = new Map<string, string>();

  return {
    dropEffect: "none",
    effectAllowed: "uninitialized",
    get types() {
      return [...values.keys()];
    },
    getData(type: string) {
      return values.get(type) ?? "";
    },
    setData(type: string, value: string) {
      values.set(type, value);
    }
  } as unknown as DataTransfer;
}

function dispatchDragEvent(
  target: Element,
  type: string,
  dataTransfer: DataTransfer,
  clientY = 0
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
  Object.defineProperty(event, "clientY", { value: clientY });
  target.dispatchEvent(event);

  return event;
}

function setVerticalBounds(element: Element, top: number, height = 80) {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () =>
      ({
        x: 0,
        y: top,
        top,
        right: 320,
        bottom: top + height,
        left: 0,
        width: 320,
        height,
        toJSON: () => ({})
      }) satisfies DOMRect
  });
}

function changeInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;

  valueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
}

function getVisualQueueTitles(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      ".queue-item:not(.is-preview-source), .queue-item-order-ghost"
    )
  )
    .sort((firstItem, secondItem) => {
      return Number(firstItem.style.order) - Number(secondItem.style.order);
    })
    .map((item) => item.querySelector("h3")?.textContent?.trim());
}

let restoreObjectUrlMocks: (() => void) | undefined;

afterEach(() => {
  restoreObjectUrlMocks?.();
  restoreObjectUrlMocks = undefined;
  vi.restoreAllMocks();
});

function createMemoryLocalAudioRepository(
  initialRecords: readonly LocalAudioFileRecord[] = []
): LocalAudioFileRepository {
  const recordsByTrackId = new Map(
    initialRecords.map((record) => [record.trackId, record])
  );

  return {
    list: vi.fn(async () => [...recordsByTrackId.values()]),
    save: vi.fn(async (record) => {
      recordsByTrackId.set(record.trackId, record);
    }),
    remove: vi.fn(async (trackId) => {
      recordsByTrackId.delete(trackId);
    })
  };
}

function createMemoryLocalCatalogRepository(load: () => Promise<UserCatalogChanges>) {
  return {
    load: vi.fn(load),
    save: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined)
  } satisfies LocalCatalogRepository;
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

function createUserCatalogChanges(): UserCatalogChanges {
  const albumChanges = addAlbumToUserCatalog(
    mockCatalog,
    createEmptyUserCatalogChanges(),
    {
      artistId: "artist_vae",
      title: "用户专辑",
      type: "other",
      sortOrder: 3
    },
    () => "album_user_001"
  );

  return addTrackToUserCatalog(
    mockCatalog,
    albumChanges,
    {
      artistId: "artist_vae",
      albumId: "album_user_001",
      title: "用户歌曲",
      trackNumber: 1
    },
    () => "track_user_001"
  );
}

function installAudioElementMocks() {
  const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(
    URL,
    "createObjectURL"
  );
  const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(
    URL,
    "revokeObjectURL"
  );
  let objectUrlSequence = 0;
  const createObjectURL = vi.fn((file: Blob) => {
    objectUrlSequence += 1;
    return `blob:test/${(file as File).name}/${objectUrlSequence}`;
  });
  const revokeObjectURL = vi.fn();

  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: createObjectURL
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: revokeObjectURL
  });

  restoreObjectUrlMocks = () => {
    restoreProperty(URL, "createObjectURL", originalCreateObjectUrl);
    restoreProperty(URL, "revokeObjectURL", originalRevokeObjectUrl);
  };

  const play = vi
    .spyOn(HTMLMediaElement.prototype, "play")
    .mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);

  return { createObjectURL, revokeObjectURL, play };
}

function restoreProperty(
  target: typeof URL,
  propertyName: "createObjectURL" | "revokeObjectURL",
  descriptor: PropertyDescriptor | undefined
) {
  if (descriptor) {
    Object.defineProperty(target, propertyName, descriptor);
  } else {
    Reflect.deleteProperty(target, propertyName);
  }
}

function selectFile(input: HTMLInputElement, file: File) {
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [file]
  });
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("persistent catalog integration", () => {
  it("shows the built-in catalog immediately and keeps existing behavior for empty changes", async () => {
    const deferred = createDeferred<UserCatalogChanges>();
    const catalogRepository = createMemoryLocalCatalogRepository(
      () => deferred.promise
    );
    const localAudioRepository = createMemoryLocalAudioRepository();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(App, {
          catalogRepository,
          localAudioRepository
        })
      );
    });

    expect(container.textContent).toContain("示例专辑 A");
    expect(container.textContent).toContain("正在读取用户目录，当前先显示内置目录。");

    await act(async () => {
      deferred.resolve(createEmptyUserCatalogChanges());
    });

    expect(container.textContent).toContain("示例专辑 A");
    expect(container.textContent).not.toContain("正在读取用户目录");

    await act(async () => {
      findButton(container, "将示例歌曲一加入临时歌单")?.click();
    });

    expect(container.querySelector(".queue-item h3")?.textContent).toBe("示例歌曲一");
    expect(catalogRepository.save).not.toHaveBeenCalled();
    expect(catalogRepository.clear).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("uses loaded albums and tracks for catalog, queue, and player actions", async () => {
    const deferred = createDeferred<UserCatalogChanges>();
    const catalogRepository = createMemoryLocalCatalogRepository(
      () => deferred.promise
    );
    const localAudioRepository = createMemoryLocalAudioRepository();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(App, {
          catalogRepository,
          localAudioRepository
        })
      );
    });

    expect(container.textContent).not.toContain("用户专辑");

    await act(async () => {
      deferred.resolve(createUserCatalogChanges());
    });

    const userAlbumButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".album-list-button")
    ).find((button) => button.textContent?.includes("用户专辑"));

    expect(userAlbumButton).toBeDefined();

    await act(async () => {
      userAlbumButton?.click();
    });

    expect(container.querySelector("#album-detail-heading")?.textContent).toBe(
      "用户专辑"
    );

    await act(async () => {
      findButton(container, "将用户歌曲加入临时歌单")?.click();
    });

    expect(container.querySelector(".queue-item h3")?.textContent).toBe("用户歌曲");
    expect(container.querySelector(".player-now-playing strong")?.textContent).toBe(
      "用户歌曲"
    );

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".danger-button")?.click();
      container.querySelector<HTMLButtonElement>(".add-album-button")?.click();
    });

    expect(container.querySelectorAll(".queue-item")).toHaveLength(1);
    expect(container.querySelector(".queue-item h3")?.textContent).toBe("用户歌曲");
    expect(container.querySelector(".player-now-playing strong")?.textContent).toBe(
      "用户歌曲"
    );
    expect(catalogRepository.load).toHaveBeenCalledOnce();
    expect(catalogRepository.save).not.toHaveBeenCalled();
    expect(catalogRepository.clear).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("preserves the queue and player when user changes finish loading", async () => {
    const deferred = createDeferred<UserCatalogChanges>();
    const catalogRepository = createMemoryLocalCatalogRepository(
      () => deferred.promise
    );
    const localAudioRepository = createMemoryLocalAudioRepository();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(App, {
          catalogRepository,
          localAudioRepository
        })
      );
    });
    await act(async () => {
      findButton(container, "将示例歌曲一加入临时歌单")?.click();
    });

    expect(container.querySelector(".queue-item h3")?.textContent).toBe("示例歌曲一");
    expect(container.querySelector(".player-now-playing strong")?.textContent).toBe(
      "示例歌曲一"
    );

    await act(async () => {
      deferred.resolve(createUserCatalogChanges());
    });

    expect(container.textContent).toContain("用户专辑");
    expect(container.querySelector(".queue-item h3")?.textContent).toBe("示例歌曲一");
    expect(container.querySelector(".player-now-playing strong")?.textContent).toBe(
      "示例歌曲一"
    );
    expect(catalogRepository.save).not.toHaveBeenCalled();
    expect(catalogRepository.clear).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("keeps the built-in catalog usable and shows a non-blocking message after load failure", async () => {
    const catalogRepository = createMemoryLocalCatalogRepository(async () => {
      throw new Error("catalog unavailable");
    });
    const localAudioRepository = createMemoryLocalAudioRepository();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(App, {
          catalogRepository,
          localAudioRepository
        })
      );
    });

    const statusMessages = Array.from(
      container.querySelectorAll<HTMLElement>('[role="status"]')
    );

    expect(
      statusMessages.some((message) =>
        message.textContent?.includes("无法读取用户目录，已继续使用内置目录。")
      )
    ).toBe(true);
    expect(container.textContent).toContain("示例专辑 A");

    await act(async () => {
      findButton(container, "将示例歌曲一加入临时歌单")?.click();
    });

    expect(container.querySelector(".queue-item h3")?.textContent).toBe("示例歌曲一");
    expect(catalogRepository.save).not.toHaveBeenCalled();
    expect(catalogRepository.clear).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});

describe("temporary playlist workflow", () => {
  it("connects catalog actions to repeat, ordering, removal, and clear controls", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(App));
    });

    expect(container.querySelector(".queue-empty")).not.toBeNull();

    await act(async () => {
      findButton(container, "将示例歌曲一加入临时歌单")?.click();
    });

    expect(container.querySelectorAll(".queue-item")).toHaveLength(1);
    expect(container.querySelector(".queue-item")?.textContent).toContain("示例歌曲一");
    expect(container.querySelector(".queue-item")?.textContent).not.toContain(
      "示例专辑 A"
    );
    expect(container.querySelector(".queue-repeat-count")?.textContent).toBe("×1");

    await act(async () => {
      findButton(container, "打开示例歌曲一的更多操作")?.click();
    });

    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    expect(
      document.body.querySelector<HTMLInputElement>(".repeat-stepper input")?.value
    ).toBe("1");

    await act(async () => {
      findButton(document.body, "增加示例歌曲一的播放次数")?.click();
    });

    expect(container.querySelector(".queue-repeat-count")?.textContent).toBe("×2");
    expect(container.querySelector(".playlist-heading-actions")?.textContent).toContain(
      "1 首 · 2 次"
    );

    await act(async () => {
      findButton(container, "将示例歌曲二加入临时歌单")?.click();
    });

    await act(async () => {
      findButton(document.body, "下移示例歌曲一")?.click();
    });

    expect(
      Array.from(container.querySelectorAll(".queue-item h3"), (heading) =>
        heading.textContent?.trim()
      )
    ).toEqual(["示例歌曲二", "示例歌曲一"]);

    await act(async () => {
      findButton(container, "打开示例歌曲二的更多操作")?.click();
    });

    await act(async () => {
      findButton(document.body, "删除示例歌曲二")?.click();
    });

    expect(container.querySelectorAll(".queue-item")).toHaveLength(1);

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".danger-button")?.click();
    });

    expect(container.querySelector(".queue-empty")).not.toBeNull();

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".add-album-button")?.click();
    });

    expect(
      Array.from(container.querySelectorAll(".queue-item h3"), (heading) =>
        heading.textContent?.trim()
      )
    ).toEqual(["示例歌曲一", "示例歌曲二"]);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("opens a compact item menu for top, up, down, and dismiss actions", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(App));
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".add-album-button")?.click();
    });

    const firstTrigger = findButton(container, "打开示例歌曲一的更多操作");
    const secondTrigger = findButton(container, "打开示例歌曲二的更多操作");

    expect(firstTrigger?.getAttribute("aria-expanded")).toBe("false");

    await act(async () => {
      firstTrigger?.click();
    });

    expect(firstTrigger?.getAttribute("aria-expanded")).toBe("true");
    expect(document.body.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(
      document.body.querySelector('[role="dialog"]')?.getAttribute("aria-label")
    ).toBe("示例歌曲一的歌单项设置");
    expect(findButton(document.body, "置顶示例歌曲一")?.disabled).toBe(true);
    expect(findButton(document.body, "上移示例歌曲一")?.disabled).toBe(true);
    expect(findButton(document.body, "下移示例歌曲一")?.disabled).toBe(false);

    await act(async () => {
      secondTrigger?.click();
    });

    expect(firstTrigger?.getAttribute("aria-expanded")).toBe("false");
    expect(secondTrigger?.getAttribute("aria-expanded")).toBe("true");
    expect(document.body.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(findButton(document.body, "下移示例歌曲二")?.disabled).toBe(true);

    await act(async () => {
      findButton(document.body, "置顶示例歌曲二")?.click();
    });

    expect(
      Array.from(container.querySelectorAll(".queue-item h3"), (heading) =>
        heading.textContent?.trim()
      )
    ).toEqual(["示例歌曲二", "示例歌曲一"]);
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();

    await act(async () => {
      firstTrigger?.click();
    });
    await act(async () => {
      findButton(document.body, "上移示例歌曲一")?.click();
    });

    expect(
      Array.from(container.querySelectorAll(".queue-item h3"), (heading) =>
        heading.textContent?.trim()
      )
    ).toEqual(["示例歌曲一", "示例歌曲二"]);

    await act(async () => {
      firstTrigger?.click();
    });
    await act(async () => {
      findButton(document.body, "下移示例歌曲一")?.click();
    });

    expect(
      Array.from(container.querySelectorAll(".queue-item h3"), (heading) =>
        heading.textContent?.trim()
      )
    ).toEqual(["示例歌曲二", "示例歌曲一"]);

    await act(async () => {
      secondTrigger?.click();
    });
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });

    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(secondTrigger?.getAttribute("aria-expanded")).toBe("false");

    await act(async () => {
      firstTrigger?.click();
    });
    await act(async () => {
      container
        .querySelector(".workspace")
        ?.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });

    expect(document.body.querySelector('[role="dialog"]')).toBeNull();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("updates the playback sequence immediately and preserves it for invalid input", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(App));
    });

    await act(async () => {
      findButton(container, "将示例歌曲一加入临时歌单")?.click();
    });

    await act(async () => {
      findButton(container, "打开示例歌曲一的更多操作")?.click();
    });

    const repeatDialog = document.body.querySelector(
      '[role="dialog"][aria-label="示例歌曲一的歌单项设置"]'
    );
    const input = repeatDialog?.querySelector<HTMLInputElement>(
      ".repeat-stepper input"
    );
    const sequenceSummary = () =>
      container.querySelector(".playlist-heading-actions .pill")?.textContent;

    expect(input).not.toBeNull();
    expect(input?.value).toBe("1");
    expect(input?.labels?.[0]?.textContent).toContain("播放次数");
    expect(input?.getAttribute("aria-label")).toBe("示例歌曲一的播放次数");
    expect(sequenceSummary()).toContain("1 首 · 1 次");

    await act(async () => {
      changeInputValue(input as HTMLInputElement, "3");
    });

    expect(input?.value).toBe("3");
    expect(input?.getAttribute("aria-invalid")).toBe("false");
    expect(sequenceSummary()).toContain("1 首 · 3 次");

    const invalidInputs = [
      ["", "请输入播放次数"],
      ["0", "播放次数需要是正整数"],
      ["-2", "播放次数需要是正整数"],
      ["abc", "播放次数需要是正整数"],
      ["1.5", "播放次数需要是正整数"],
      ["100", "播放次数最多为 99"]
    ] as const;

    for (const [value, message] of invalidInputs) {
      await act(async () => {
        changeInputValue(input as HTMLInputElement, value);
      });

      const error = document.body.querySelector(".repeat-count-error");

      expect(input?.value).toBe(value);
      expect(input?.getAttribute("aria-invalid")).toBe("true");
      expect(error?.textContent).toContain(message);
      expect(error?.textContent).toContain("当前仍按 3 次播放");
      expect(input?.getAttribute("aria-describedby")).toBe(error?.id);
      expect(sequenceSummary()).toContain("1 首 · 3 次");
    }

    await act(async () => {
      changeInputValue(input as HTMLInputElement, "2");
    });

    expect(input?.value).toBe("2");
    expect(input?.getAttribute("aria-invalid")).toBe("false");
    expect(document.body.querySelector(".repeat-count-error")).toBeNull();
    expect(sequenceSummary()).toContain("1 首 · 2 次");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("blocks unbound playback and supports binding and unbinding a local file", async () => {
    const repository = createMemoryLocalAudioRepository();
    const mediaMocks = installAudioElementMocks();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(App, { localAudioRepository: repository }));
    });

    await act(async () => {
      findButton(container, "将示例歌曲一加入临时歌单")?.click();
    });

    expect(container.querySelector(".player-audio-binding")?.textContent).toBe(
      "未绑定音频文件"
    );
    expect(findButton(container, "播放")?.disabled).toBe(true);
    expect(mediaMocks.play).not.toHaveBeenCalled();

    const audioInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="为示例歌曲一选择本地音频文件"]'
    );
    const localFile = new File(["self-created test bytes"], "sample-one.mp3", {
      type: "audio/mpeg"
    });

    expect(audioInput).not.toBeNull();

    await act(async () => {
      selectFile(audioInput as HTMLInputElement, localFile);
    });

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        trackId: "track_sample_001",
        fileName: "sample-one.mp3",
        file: localFile
      })
    );
    expect(container.querySelector(".player-audio-binding")?.textContent).toBe(
      "已绑定：sample-one.mp3"
    );
    expect(findButton(container, "播放")?.disabled).toBe(false);

    await act(async () => {
      findButton(container, "播放")?.click();
    });

    expect(mediaMocks.createObjectURL).toHaveBeenCalledWith(localFile);
    expect(mediaMocks.play).toHaveBeenCalled();
    expect(container.querySelector(".player-status")?.textContent).toContain(
      "正在播放"
    );

    await act(async () => {
      findButton(container, "解除示例歌曲一的本地音频绑定")?.click();
    });

    expect(repository.remove).toHaveBeenCalledWith("track_sample_001");
    expect(container.querySelector(".player-audio-binding")?.textContent).toBe(
      "未绑定音频文件"
    );
    expect(container.querySelector(".player-status")?.textContent).toContain(
      "未绑定音频文件"
    );
    expect(findButton(container, "播放")?.disabled).toBe(true);
    expect(mediaMocks.revokeObjectURL).toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("pauses instead of playing when automatic advance reaches an unbound track", async () => {
    const firstFile = new File(["first test file"], "sample-one.mp3", {
      type: "audio/mpeg"
    });
    const repository = createMemoryLocalAudioRepository([
      createLocalAudioFileRecord(
        "track_sample_001",
        firstFile,
        "2026-07-15T00:00:00.000Z"
      )
    ]);
    const mediaMocks = installAudioElementMocks();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(App, { localAudioRepository: repository }));
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".add-album-button")?.click();
    });

    await act(async () => {
      findButton(container, "播放")?.click();
    });

    const playCallCountBeforeEnded = mediaMocks.play.mock.calls.length;

    await act(async () => {
      container
        .querySelector("audio")
        ?.dispatchEvent(new Event("ended", { bubbles: true }));
    });

    expect(container.querySelector(".player-now-playing strong")?.textContent).toBe(
      "示例歌曲二"
    );
    expect(container.querySelector(".player-audio-binding")?.textContent).toBe(
      "未绑定音频文件"
    );
    expect(container.querySelector(".player-status")?.textContent).toContain(
      "未绑定音频文件"
    );
    expect(mediaMocks.play).toHaveBeenCalledTimes(playCallCountBeforeEnded);
    expect(findButton(container, "播放")?.disabled).toBe(true);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("plays local files through an expanded repeatCount sequence", async () => {
    const firstFile = new File(["first test file"], "sample-one.mp3", {
      type: "audio/mpeg"
    });
    const secondFile = new File(["second test file"], "sample-two.ogg", {
      type: "audio/ogg"
    });
    const repository = createMemoryLocalAudioRepository([
      createLocalAudioFileRecord(
        "track_sample_001",
        firstFile,
        "2026-07-15T00:00:00.000Z"
      ),
      createLocalAudioFileRecord(
        "track_sample_002",
        secondFile,
        "2026-07-15T00:00:00.000Z"
      )
    ]);
    const mediaMocks = installAudioElementMocks();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(App, { localAudioRepository: repository }));
    });

    const playerTitle = () =>
      container.querySelector(".player-now-playing strong")?.textContent;
    const playerMeta = () =>
      container.querySelector(".player-sequence-meta")?.textContent;
    const playerStatus = () => container.querySelector(".player-status")?.textContent;

    expect(playerTitle()).toBe("播放队列为空");
    expect(
      Array.from(
        container.querySelectorAll<HTMLButtonElement>(".player-actions button"),
        (button) => button.disabled
      )
    ).toEqual([true, true, true, true]);

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".add-album-button")?.click();
    });

    expect(playerTitle()).toBe("示例歌曲一");
    expect(playerMeta()).toContain("播放序列 1 / 2");
    expect(playerStatus()).toContain("已暂停");
    expect(container.querySelector(".player-audio-binding")?.textContent).toBe(
      "已绑定：sample-one.mp3"
    );

    await act(async () => {
      findButton(container, "打开示例歌曲一的更多操作")?.click();
    });
    await act(async () => {
      findButton(document.body, "增加示例歌曲一的播放次数")?.click();
    });

    expect(playerMeta()).toContain("播放序列 1 / 3");
    expect(playerMeta()).toContain("本项第 1 / 2 次");

    await act(async () => {
      findButton(container, "打开示例歌曲一的更多操作")?.click();
    });
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();

    await act(async () => {
      findButton(container, "播放")?.click();
    });

    expect(playerStatus()).toContain("正在播放");
    expect(findButton(container, "暂停")).not.toBeUndefined();
    expect(mediaMocks.play).toHaveBeenCalled();

    const audioElement = container.querySelector("audio");

    expect(audioElement).not.toBeNull();

    await act(async () => {
      audioElement?.dispatchEvent(new Event("ended", { bubbles: true }));
    });

    expect(playerTitle()).toBe("示例歌曲一");
    expect(playerMeta()).toContain("播放序列 2 / 3");
    expect(playerMeta()).toContain("本项第 2 / 2 次");

    await act(async () => {
      audioElement?.dispatchEvent(new Event("ended", { bubbles: true }));
    });

    expect(playerTitle()).toBe("示例歌曲二");
    expect(playerMeta()).toContain("播放序列 3 / 3");
    expect(container.querySelector(".player-audio-binding")?.textContent).toBe(
      "已绑定：sample-two.ogg"
    );
    expect(mediaMocks.createObjectURL).toHaveBeenLastCalledWith(secondFile);

    await act(async () => {
      findButton(container, "上一首")?.click();
    });
    expect(playerTitle()).toBe("示例歌曲一");
    expect(playerMeta()).toContain("播放序列 2 / 3");
    expect(mediaMocks.createObjectURL).toHaveBeenLastCalledWith(firstFile);

    await act(async () => {
      findButton(container, "从头播放")?.click();
      findButton(container, "下一首")?.click();
    });
    expect(playerTitle()).toBe("示例歌曲二");
    expect(mediaMocks.createObjectURL).toHaveBeenLastCalledWith(secondFile);

    await act(async () => {
      audioElement?.dispatchEvent(new Event("ended", { bubbles: true }));
    });
    expect(playerStatus()).toContain("播放队列已结束");
    expect(findButton(container, "重新播放")).not.toBeUndefined();

    await act(async () => {
      findButton(container, "重新播放")?.click();
    });
    expect(playerTitle()).toBe("示例歌曲一");
    expect(playerMeta()).toContain("播放序列 1 / 3");
    expect(playerStatus()).toContain("正在播放");

    await act(async () => {
      findButton(container, "暂停")?.click();
    });
    expect(playerStatus()).toContain("已暂停");

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".danger-button")?.click();
    });
    expect(playerTitle()).toBe("播放队列为空");
    expect(playerMeta()).toContain("请先将歌曲加入临时歌单");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("adds a dragged album in track order with repeatCount 1", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const dataTransfer = createDataTransfer();

    await act(async () => {
      root.render(createElement(App));
    });

    const albumButton = container.querySelector(".album-list-button");
    const dropZone = container.querySelector(".playlist-panel");

    expect(albumButton).not.toBeNull();
    expect(dropZone).not.toBeNull();

    await act(async () => {
      dispatchDragEvent(albumButton as Element, "dragstart", dataTransfer);
      dispatchDragEvent(dropZone as Element, "dragenter", dataTransfer);
      dispatchDragEvent(dropZone as Element, "dragover", dataTransfer);
    });

    expect(dataTransfer.effectAllowed).toBe("copy");
    expect(dataTransfer.dropEffect).toBe("copy");
    expect(dataTransfer.getData(ALBUM_DRAG_MIME_TYPE)).toBe("album_sample_001");
    expect(container.querySelector(".album-drop-feedback")).not.toBeNull();

    await act(async () => {
      dispatchDragEvent(dropZone as Element, "drop", dataTransfer);
      dispatchDragEvent(albumButton as Element, "dragend", dataTransfer);
    });

    expect(
      Array.from(container.querySelectorAll(".queue-item h3"), (heading) =>
        heading.textContent?.trim()
      )
    ).toEqual(["示例歌曲一", "示例歌曲二"]);
    expect(
      Array.from(
        container.querySelectorAll(".queue-repeat-count"),
        (badge) => badge.textContent
      )
    ).toEqual(["×1", "×1"]);
    expect(container.querySelector(".album-drop-feedback")).toBeNull();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("adds a dragged catalog track with repeatCount 1", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const dataTransfer = createDataTransfer();

    await act(async () => {
      root.render(createElement(App));
    });

    const trackSource = container.querySelector(".track-drag-source");
    const dropZone = container.querySelector(".playlist-panel");

    expect(trackSource).not.toBeNull();
    expect(dropZone).not.toBeNull();

    await act(async () => {
      dispatchDragEvent(trackSource as Element, "dragstart", dataTransfer);
      dispatchDragEvent(dropZone as Element, "dragenter", dataTransfer);
      dispatchDragEvent(dropZone as Element, "dragover", dataTransfer);
    });

    expect(dataTransfer.effectAllowed).toBe("copy");
    expect(dataTransfer.dropEffect).toBe("copy");
    expect(dataTransfer.getData(TRACK_DRAG_MIME_TYPE)).toBe("track_sample_001");
    expect(container.querySelector(".album-drop-feedback")?.textContent).toContain(
      "松开以加入这首歌曲"
    );

    await act(async () => {
      dispatchDragEvent(dropZone as Element, "drop", dataTransfer);
      dispatchDragEvent(trackSource as Element, "dragend", dataTransfer);
    });

    expect(
      Array.from(container.querySelectorAll(".queue-item h3"), (heading) =>
        heading.textContent?.trim()
      )
    ).toEqual(["示例歌曲一"]);
    expect(container.querySelector(".queue-repeat-count")?.textContent).toBe("×1");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("previews precise insertion slots and allows returning to the original slot", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(App));
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".add-album-button")?.click();
    });

    const panel = container.querySelector(".playlist-panel") as Element;
    const queueItems = container.querySelectorAll(
      ".queue-item:not(.queue-item-order-ghost)"
    );
    setVerticalBounds(queueItems[0], 100);
    setVerticalBounds(queueItems[1], 200);

    const dataTransfer = createDataTransfer();
    const firstDragSource = queueItems[0].querySelector(".queue-item-copy") as Element;
    let dragEnterEvent: Event | undefined;

    await act(async () => {
      dispatchDragEvent(firstDragSource, "dragstart", dataTransfer, 140);
      dragEnterEvent = dispatchDragEvent(panel, "dragenter", dataTransfer, 230);
      dispatchDragEvent(panel, "dragover", dataTransfer, 230);
    });

    expect(dataTransfer.effectAllowed).toBe("move");
    expect(dragEnterEvent?.defaultPrevented).toBe(true);
    expect(dataTransfer.getData(PLAYLIST_ITEM_DRAG_MIME_TYPE)).not.toBe("");
    expect(container.querySelector(".queue-item-order-ghost")?.textContent).toContain(
      "第 1 首"
    );
    expect(getVisualQueueTitles(container)).toEqual(["示例歌曲一", "示例歌曲二"]);

    await act(async () => {
      dispatchDragEvent(panel, "dragover", dataTransfer, 250);
    });

    expect(
      container.querySelector(".queue-item-order-ghost h3")?.textContent?.trim()
    ).toBe("示例歌曲一");
    expect(container.querySelector(".queue-item-order-ghost")?.textContent).toContain(
      "第 2 首"
    );
    expect(
      container.querySelector(".queue-item.is-preview-source h3")?.textContent?.trim()
    ).toBe("示例歌曲一");
    expect(getVisualQueueTitles(container)).toEqual(["示例歌曲二", "示例歌曲一"]);
    expect(
      Array.from(
        container.querySelectorAll(".queue-item:not(.queue-item-order-ghost) h3"),
        (heading) => heading.textContent?.trim()
      )
    ).toEqual(["示例歌曲一", "示例歌曲二"]);

    await act(async () => {
      dispatchDragEvent(firstDragSource, "dragend", dataTransfer, 250);
    });

    expect(container.querySelector(".queue-item-order-ghost")).toBeNull();
    expect(
      Array.from(container.querySelectorAll(".queue-item h3"), (heading) =>
        heading.textContent?.trim()
      )
    ).toEqual(["示例歌曲一", "示例歌曲二"]);

    const restoreTransfer = createDataTransfer();
    const secondDragSource = queueItems[1].querySelector(".queue-item-copy") as Element;

    await act(async () => {
      dispatchDragEvent(secondDragSource, "dragstart", restoreTransfer, 240);
      dispatchDragEvent(panel, "dragover", restoreTransfer, 90);
    });

    expect(getVisualQueueTitles(container)).toEqual(["示例歌曲二", "示例歌曲一"]);
    expect(container.querySelector(".queue-item-order-ghost")?.textContent).toContain(
      "第 1 首"
    );

    await act(async () => {
      dispatchDragEvent(panel, "dragover", restoreTransfer, 150);
    });

    expect(container.querySelector(".queue-item-order-ghost")).not.toBeNull();
    expect(container.querySelector(".queue-item-order-ghost")?.textContent).toContain(
      "第 2 首"
    );
    expect(getVisualQueueTitles(container)).toEqual(["示例歌曲一", "示例歌曲二"]);

    await act(async () => {
      dispatchDragEvent(panel, "drop", restoreTransfer, 150);
      dispatchDragEvent(secondDragSource, "dragend", restoreTransfer, 150);
    });

    expect(
      Array.from(container.querySelectorAll(".queue-item h3"), (heading) =>
        heading.textContent?.trim()
      )
    ).toEqual(["示例歌曲一", "示例歌曲二"]);
    expect(container.querySelector(".queue-item-order-ghost")).toBeNull();

    const commitTransfer = createDataTransfer();

    await act(async () => {
      dispatchDragEvent(firstDragSource, "dragstart", commitTransfer, 140);
      dispatchDragEvent(panel, "dragover", commitTransfer, 250);
      dispatchDragEvent(panel, "drop", commitTransfer, 250);
      dispatchDragEvent(firstDragSource, "dragend", commitTransfer, 250);
    });

    expect(
      Array.from(container.querySelectorAll(".queue-item h3"), (heading) =>
        heading.textContent?.trim()
      )
    ).toEqual(["示例歌曲二", "示例歌曲一"]);
    expect(container.querySelector(".queue-item-order-ghost")).toBeNull();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("removes a playlist item only when it is dropped outside the panel", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(App));
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".add-album-button")?.click();
    });

    const cancelledTransfer = createDataTransfer();
    const firstDragSource = container.querySelector(".queue-item-copy") as Element;
    const outsideTarget = container.querySelector(".workspace") as Element;

    await act(async () => {
      dispatchDragEvent(firstDragSource, "dragstart", cancelledTransfer);
      dispatchDragEvent(outsideTarget, "dragover", cancelledTransfer);
    });

    expect(container.querySelector(".queue-remove-feedback")).not.toBeNull();

    await act(async () => {
      dispatchDragEvent(firstDragSource, "dragend", cancelledTransfer);
    });

    expect(container.querySelectorAll(".queue-item")).toHaveLength(2);
    expect(container.querySelector(".queue-remove-feedback")).toBeNull();

    const droppedTransfer = createDataTransfer();
    const nextDragSource = container.querySelector(".queue-item-copy") as Element;

    await act(async () => {
      dispatchDragEvent(nextDragSource, "dragstart", droppedTransfer);
      dispatchDragEvent(outsideTarget, "dragover", droppedTransfer);
      dispatchDragEvent(outsideTarget, "drop", droppedTransfer);
    });

    expect(
      Array.from(container.querySelectorAll(".queue-item h3"), (heading) =>
        heading.textContent?.trim()
      )
    ).toEqual(["示例歌曲二"]);
    expect(container.querySelector(".queue-remove-feedback")).toBeNull();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("does not update the playlist when an album drag is cancelled", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const dataTransfer = createDataTransfer();

    await act(async () => {
      root.render(createElement(App));
    });

    const albumButton = container.querySelector(".album-list-button");
    const dropZone = container.querySelector(".playlist-panel");

    await act(async () => {
      dispatchDragEvent(albumButton as Element, "dragstart", dataTransfer);
      dispatchDragEvent(dropZone as Element, "dragenter", dataTransfer);
    });

    expect(container.querySelector(".album-drop-feedback")).not.toBeNull();

    await act(async () => {
      dispatchDragEvent(albumButton as Element, "dragend", dataTransfer);
    });

    expect(container.querySelectorAll(".queue-item")).toHaveLength(0);
    expect(container.querySelector(".album-drop-feedback")).toBeNull();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("ignores unsupported and unknown album drop data", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(App));
    });

    const dropZone = container.querySelector(".playlist-panel") as Element;
    const unsupportedTransfer = createDataTransfer();
    unsupportedTransfer.setData("text/plain", "album_sample_001");

    await act(async () => {
      dispatchDragEvent(dropZone, "drop", unsupportedTransfer);
    });

    const unknownAlbumTransfer = createDataTransfer();
    unknownAlbumTransfer.setData(ALBUM_DRAG_MIME_TYPE, "album_unknown");

    await act(async () => {
      dispatchDragEvent(dropZone, "dragenter", unknownAlbumTransfer);
      dispatchDragEvent(dropZone, "drop", unknownAlbumTransfer);
    });

    const unknownTrackTransfer = createDataTransfer();
    unknownTrackTransfer.setData(TRACK_DRAG_MIME_TYPE, "track_unknown");

    await act(async () => {
      dispatchDragEvent(dropZone, "dragenter", unknownTrackTransfer);
      dispatchDragEvent(dropZone, "drop", unknownTrackTransfer);
    });

    expect(container.querySelectorAll(".queue-item")).toHaveLength(0);
    expect(container.querySelector(".album-drop-feedback")).toBeNull();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
