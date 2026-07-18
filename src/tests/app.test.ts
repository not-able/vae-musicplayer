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
import type { PlayerSettingsRepository } from "../features/player/playerSettingsRepository";
import type { TemporaryPlaylistRepository } from "../features/playlist/playlistRepository";
import { LOCAL_TEMPORARY_PLAYLIST_STORAGE_KEY } from "../infra/storage/localStoragePlaylistRepository";
import { LOCAL_PLAYLIST_LIBRARY_STORAGE_KEY } from "../infra/storage/localStoragePlaylistLibraryRepository";
import type {
  LocalAudioFileRecord,
  TemporaryPlaylist,
  UserCatalogChanges
} from "../types";
import {
  ALBUM_DRAG_MIME_TYPE,
  PLAYLIST_ITEM_DRAG_MIME_TYPE,
  TRACK_DRAG_MIME_TYPE
} from "../utils/albumDrag";
import {
  addTrackToPlaylist,
  createTemporaryPlaylist,
  updatePlaylistItemRepeatCount
} from "../utils/playlist";

function findButton(container: HTMLElement, ariaLabel: string) {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => button.getAttribute("aria-label") === ariaLabel
  );
}

function findButtonByText(
  container: HTMLElement,
  text: string
): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => button.textContent?.trim() === text
  );
}

async function chooseAlbumMenuAction(
  container: HTMLElement,
  albumTitle: string,
  actionText: string
): Promise<void> {
  await act(async () => {
    findButton(container, `打开${albumTitle}的更多操作`)?.click();
  });
  await act(async () => {
    findButtonByText(document.body, actionText)?.click();
  });
}

async function openTrackActionsMenu(
  container: HTMLElement,
  trackTitle: string
): Promise<void> {
  await act(async () => {
    findButton(container, `打开目录歌曲${trackTitle}的更多操作`)?.click();
  });
}

async function chooseTrackMenuAction(
  container: HTMLElement,
  trackTitle: string,
  actionLabel: string
): Promise<void> {
  await openTrackActionsMenu(container, trackTitle);
  await act(async () => {
    findButton(document.body, actionLabel)?.click();
  });
}

async function selectCatalogTrackAudioFile(
  container: HTMLElement,
  trackTitle: string,
  file: File
): Promise<void> {
  await openTrackActionsMenu(container, trackTitle);
  const input = document.body.querySelector<HTMLInputElement>(
    `input[aria-label="为${trackTitle}选择本地音频文件"]`
  );

  if (!input) {
    throw new Error(`Audio input is unavailable for ${trackTitle}.`);
  }

  await act(async () => {
    selectFile(input, file);
  });
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

function setAudioTiming(
  audio: HTMLAudioElement,
  duration: number,
  currentTime: number
): void {
  Object.defineProperties(audio, {
    duration: { configurable: true, value: duration, writable: true },
    currentTime: { configurable: true, value: currentTime, writable: true }
  });
}

function changeSelectValue(select: HTMLSelectElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value"
  )?.set;

  valueSetter?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
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
  localStorage.removeItem(LOCAL_TEMPORARY_PLAYLIST_STORAGE_KEY);
  localStorage.removeItem(LOCAL_PLAYLIST_LIBRARY_STORAGE_KEY);
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

function createStatefulLocalCatalogRepository(initialChanges: UserCatalogChanges): {
  repository: LocalCatalogRepository;
  getStoredChanges: () => UserCatalogChanges;
} {
  let storedChanges = structuredClone(initialChanges);
  const repository = {
    load: vi.fn(async () => structuredClone(storedChanges)),
    save: vi.fn(async (changes: UserCatalogChanges) => {
      storedChanges = structuredClone(changes);
    }),
    clear: vi.fn(async () => undefined)
  } satisfies LocalCatalogRepository;

  return {
    repository,
    getStoredChanges: () => structuredClone(storedChanges)
  };
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

function createStoredTemporaryPlaylist(
  entries: readonly {
    itemId: string;
    trackId: string;
    repeatCount?: number;
  }[]
): TemporaryPlaylist {
  const createdAt = "2026-07-17T01:00:00.000Z";
  let playlist = createTemporaryPlaylist({
    id: "playlist_temp_current",
    name: "临时歌单",
    createdAt
  });

  for (const [index, entry] of entries.entries()) {
    const updatedAt = `2026-07-17T01:00:${String(index).padStart(2, "0")}.000Z`;

    playlist = addTrackToPlaylist(playlist, {
      trackId: entry.trackId,
      itemId: entry.itemId,
      addedAt: updatedAt
    });

    if (entry.repeatCount !== undefined) {
      playlist = updatePlaylistItemRepeatCount(
        playlist,
        entry.itemId,
        entry.repeatCount,
        updatedAt
      );
    }
  }

  return playlist;
}

function createStatefulTemporaryPlaylistRepository(
  initialPlaylist: TemporaryPlaylist | null
): {
  repository: TemporaryPlaylistRepository;
  getStoredPlaylist: () => TemporaryPlaylist | null;
} {
  let storedPlaylist =
    initialPlaylist === null ? null : structuredClone(initialPlaylist);
  const repository = {
    load: vi.fn(async () =>
      storedPlaylist === null ? null : structuredClone(storedPlaylist)
    ),
    save: vi.fn(async (playlist: TemporaryPlaylist) => {
      storedPlaylist = structuredClone(playlist);
    }),
    clear: vi.fn(async () => {
      storedPlaylist = null;
    })
  } satisfies TemporaryPlaylistRepository;

  return {
    repository,
    getStoredPlaylist: () =>
      storedPlaylist === null ? null : structuredClone(storedPlaylist)
  };
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

function createOrderedUserCatalogChanges(): UserCatalogChanges {
  let changes = addAlbumToUserCatalog(
    mockCatalog,
    createEmptyUserCatalogChanges(),
    {
      artistId: "artist_vae",
      title: "曲序测试专辑",
      type: "album",
      sortOrder: 3
    },
    () => "album_user_order"
  );

  changes = addTrackToUserCatalog(
    mockCatalog,
    changes,
    {
      artistId: "artist_vae",
      albumId: "album_user_order",
      title: "第二首",
      trackNumber: 2
    },
    () => "track_user_order_2"
  );
  changes = addTrackToUserCatalog(
    mockCatalog,
    changes,
    {
      artistId: "artist_vae",
      albumId: "album_user_order",
      title: "同曲序第二首",
      trackNumber: 2
    },
    () => "track_user_order_same_2"
  );

  return addTrackToUserCatalog(
    mockCatalog,
    changes,
    {
      artistId: "artist_vae",
      albumId: "album_user_order",
      title: "第一首",
      trackNumber: 1
    },
    () => "track_user_order_1"
  );
}

function createMvp07UserCatalogChanges(): UserCatalogChanges {
  let changes = addAlbumToUserCatalog(
    mockCatalog,
    createEmptyUserCatalogChanges(),
    {
      artistId: "artist_vae",
      title: "用户闭环专辑",
      type: "album",
      sortOrder: 3
    },
    () => "album_user_mvp_07"
  );

  changes = addTrackToUserCatalog(
    mockCatalog,
    changes,
    {
      artistId: "artist_vae",
      albumId: "album_user_mvp_07",
      title: "用户歌曲二",
      trackNumber: 2
    },
    () => "track_user_mvp_07_2"
  );

  return addTrackToUserCatalog(
    mockCatalog,
    changes,
    {
      artistId: "artist_vae",
      albumId: "album_user_mvp_07",
      title: "用户歌曲一",
      trackNumber: 1
    },
    () => "track_user_mvp_07_1"
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

interface EndedListenerRecord {
  audio: HTMLAudioElement;
  listener: EventListenerOrEventListenerObject;
  removed: boolean;
}

function monitorAudioEndedListeners(): EndedListenerRecord[] {
  const records: EndedListenerRecord[] = [];
  const addEventListener = HTMLMediaElement.prototype.addEventListener;
  const removeEventListener = HTMLMediaElement.prototype.removeEventListener;

  vi.spyOn(HTMLMediaElement.prototype, "addEventListener").mockImplementation(function (
    this: HTMLMediaElement,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ) {
    if (
      this instanceof HTMLAudioElement &&
      type === "ended" &&
      isSourceEndedListenerOptions(options)
    ) {
      records.push({ audio: this, listener, removed: false });
    }

    addEventListener.call(this, type, listener, options);
  });
  vi.spyOn(HTMLMediaElement.prototype, "removeEventListener").mockImplementation(
    function (
      this: HTMLMediaElement,
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions
    ) {
      if (this instanceof HTMLAudioElement && type === "ended") {
        for (let index = records.length - 1; index >= 0; index -= 1) {
          const record = records[index];

          if (
            !record.removed &&
            record.audio === this &&
            record.listener === listener
          ) {
            record.removed = true;
            break;
          }
        }
      }

      removeEventListener.call(this, type, listener, options);
    }
  );

  return records;
}

function isSourceEndedListenerOptions(options: unknown): boolean {
  return (
    typeof options === "object" &&
    options !== null &&
    "passive" in options &&
    options.passive === true
  );
}

function invokeEndedListener(record: EndedListenerRecord) {
  const event = new Event("ended");

  if (typeof record.listener === "function") {
    record.listener.call(record.audio, event);
  } else {
    record.listener.handleEvent(event);
  }
}

describe("persistent temporary playlist integration", () => {
  it("restores order, duplicate instances, and repeat counts without restoring playback", async () => {
    const storedPlaylist = createStoredTemporaryPlaylist([
      {
        itemId: "item_second",
        trackId: "track_sample_002",
        repeatCount: 2
      },
      {
        itemId: "item_first",
        trackId: "track_sample_001"
      },
      {
        itemId: "item_second_duplicate",
        trackId: "track_sample_002",
        repeatCount: 3
      }
    ]);
    const { repository } = createStatefulTemporaryPlaylistRepository(storedPlaylist);
    const localFile = new File(["self-created test bytes"], "sample-two.mp3", {
      type: "audio/mpeg"
    });
    const localAudioRepository = createMemoryLocalAudioRepository([
      createLocalAudioFileRecord(
        "track_sample_002",
        localFile,
        "2026-07-17T01:10:00.000Z"
      )
    ]);
    const mediaMocks = installAudioElementMocks();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(App, {
          localAudioRepository,
          playlistRepository: repository
        })
      );
    });

    expect(
      Array.from(container.querySelectorAll(".queue-item h3"), (heading) =>
        heading.textContent?.trim()
      )
    ).toEqual(["示例歌曲二", "示例歌曲一", "示例歌曲二"]);
    expect(
      Array.from(container.querySelectorAll(".queue-repeat-count"), (count) =>
        count.textContent?.trim()
      )
    ).toEqual(["×2", "×1", "×3"]);
    expect(container.querySelector(".playlist-heading-actions")?.textContent).toContain(
      "3 首 · 6 次"
    );
    expect(container.querySelector(".player-now-playing strong")?.textContent).toBe(
      "播放队列为空"
    );
    expect(container.querySelector(".player-sequence-meta")?.textContent).toContain(
      "请先将歌曲加入临时歌单"
    );
    expect(container.querySelector(".player-status")?.textContent).toContain(
      "等待播放队列"
    );
    expect(mediaMocks.play).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
    expect(repository.clear).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("never saves the default empty playlist while stored data is still loading", async () => {
    const loadDeferred = createDeferred<TemporaryPlaylist | null>();
    const storedPlaylist = createStoredTemporaryPlaylist([
      {
        itemId: "item_loaded_late",
        trackId: "track_sample_003",
        repeatCount: 2
      }
    ]);
    const repository = {
      load: vi.fn(() => loadDeferred.promise),
      save: vi.fn(async () => undefined),
      clear: vi.fn(async () => undefined)
    } satisfies TemporaryPlaylistRepository;
    const playlistItemIdFactory = vi.fn(() => "item_while_loading");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(App, {
          localAudioRepository: createMemoryLocalAudioRepository(),
          playlistRepository: repository,
          playlistItemIdFactory
        })
      );
    });

    expect(repository.save).not.toHaveBeenCalled();
    expect(repository.clear).not.toHaveBeenCalled();

    await act(async () => {
      findButton(container, "将示例歌曲一加入临时歌单")?.click();
    });

    expect(playlistItemIdFactory).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();

    await act(async () => {
      loadDeferred.resolve(storedPlaylist);
    });

    expect(container.querySelector(".queue-item h3")?.textContent).toBe("示例歌曲三");
    expect(container.querySelector(".queue-repeat-count")?.textContent).toBe("×2");
    expect(repository.save).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("starts empty when switching from a restored repository to a new empty source", async () => {
    const restoredPlaylist = createStoredTemporaryPlaylist([
      {
        itemId: "item_from_first_repository",
        trackId: "track_sample_001",
        repeatCount: 2
      }
    ]);
    const { repository: firstRepository } =
      createStatefulTemporaryPlaylistRepository(restoredPlaylist);
    const {
      repository: emptyRepository,
      getStoredPlaylist: getEmptyRepositoryPlaylist
    } = createStatefulTemporaryPlaylistRepository(null);
    const localAudioRepository = createMemoryLocalAudioRepository();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(App, {
          localAudioRepository,
          playlistRepository: firstRepository
        })
      );
    });

    expect(container.querySelector(".queue-item h3")?.textContent).toBe("示例歌曲一");

    await act(async () => {
      root.render(
        createElement(App, {
          localAudioRepository,
          playlistRepository: emptyRepository,
          playlistItemIdFactory: () => "item_from_second_repository"
        })
      );
    });

    expect(container.querySelector(".queue-empty")).not.toBeNull();
    expect(emptyRepository.save).not.toHaveBeenCalled();

    await act(async () => {
      findButton(container, "将示例歌曲二加入临时歌单")?.click();
    });

    expect(getEmptyRepositoryPlaylist()?.itemIds).toEqual([
      "item_from_second_repository"
    ]);
    expect(
      Object.values(getEmptyRepositoryPlaylist()?.itemsById ?? {}).map(
        (item) => item.trackId
      )
    ).toEqual(["track_sample_002"]);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("does not carry memory changes from a failed source into a new empty repository", async () => {
    const failedRepository = {
      load: vi.fn(async () => {
        throw new Error("unreadable source");
      }),
      save: vi.fn(async () => undefined),
      clear: vi.fn(async () => undefined)
    } satisfies TemporaryPlaylistRepository;
    const {
      repository: emptyRepository,
      getStoredPlaylist: getEmptyRepositoryPlaylist
    } = createStatefulTemporaryPlaylistRepository(null);
    const localAudioRepository = createMemoryLocalAudioRepository();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(App, {
          localAudioRepository,
          playlistRepository: failedRepository,
          playlistItemIdFactory: () => "item_from_failed_source"
        })
      );
    });
    await act(async () => {
      findButton(container, "将示例歌曲一加入临时歌单")?.click();
    });

    expect(container.querySelector(".queue-item h3")?.textContent).toBe("示例歌曲一");
    expect(failedRepository.save).not.toHaveBeenCalled();

    await act(async () => {
      root.render(
        createElement(App, {
          localAudioRepository,
          playlistRepository: emptyRepository,
          playlistItemIdFactory: () => "item_from_empty_source"
        })
      );
    });

    expect(container.querySelector(".queue-empty")).not.toBeNull();
    expect(emptyRepository.save).not.toHaveBeenCalled();

    await act(async () => {
      findButton(container, "将示例歌曲二加入临时歌单")?.click();
    });

    expect(getEmptyRepositoryPlaylist()?.itemIds).toEqual(["item_from_empty_source"]);
    expect(
      Object.values(getEmptyRepositoryPlaylist()?.itemsById ?? {}).map(
        (item) => item.trackId
      )
    ).toEqual(["track_sample_002"]);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("waits for the final user catalog before validating and hydrating stored tracks", async () => {
    const catalogDeferred = createDeferred<UserCatalogChanges>();
    const catalogRepository = createMemoryLocalCatalogRepository(
      () => catalogDeferred.promise
    );
    const storedPlaylist = createStoredTemporaryPlaylist([
      {
        itemId: "item_user_track",
        trackId: "track_user_001",
        repeatCount: 2
      }
    ]);
    const { repository } = createStatefulTemporaryPlaylistRepository(storedPlaylist);
    const playlistItemIdFactory = vi.fn(() => "item_should_not_be_created");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(App, {
          catalogRepository,
          localAudioRepository: createMemoryLocalAudioRepository(),
          playlistRepository: repository,
          playlistItemIdFactory
        })
      );
    });

    expect(container.querySelectorAll(".queue-item")).toHaveLength(0);
    expect(container.querySelector(".playlist-panel")?.getAttribute("aria-busy")).toBe(
      "true"
    );
    expect(repository.save).not.toHaveBeenCalled();

    await act(async () => {
      findButton(container, "将示例歌曲一加入临时歌单")?.click();
    });

    expect(playlistItemIdFactory).not.toHaveBeenCalled();
    expect(container.querySelectorAll(".queue-item")).toHaveLength(0);

    await act(async () => {
      catalogDeferred.resolve(createUserCatalogChanges());
    });

    expect(container.querySelector(".queue-item h3")?.textContent).toBe("用户歌曲");
    expect(container.querySelector(".queue-repeat-count")?.textContent).toBe("×2");
    expect(container.querySelector(".player-sequence-meta")?.textContent).toContain(
      "请先将歌曲加入临时歌单"
    );
    expect(repository.save).not.toHaveBeenCalled();
    expect(repository.clear).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("removes invalid track references once and persists the reconciled playlist", async () => {
    const storedPlaylist = createStoredTemporaryPlaylist([
      {
        itemId: "item_valid_first",
        trackId: "track_sample_001",
        repeatCount: 2
      },
      {
        itemId: "item_missing",
        trackId: "track_removed_from_catalog",
        repeatCount: 3
      },
      {
        itemId: "item_valid_duplicate",
        trackId: "track_sample_001"
      }
    ]);
    const { repository, getStoredPlaylist } =
      createStatefulTemporaryPlaylistRepository(storedPlaylist);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(App, {
          localAudioRepository: createMemoryLocalAudioRepository(),
          playlistRepository: repository
        })
      );
    });

    expect(
      Array.from(container.querySelectorAll(".queue-item h3"), (heading) =>
        heading.textContent?.trim()
      )
    ).toEqual(["示例歌曲一", "示例歌曲一"]);
    expect(container.textContent).not.toContain("未知歌曲");
    expect(
      container.querySelectorAll(".playlist-persistence-message.is-notice")
    ).toHaveLength(1);
    expect(container.textContent).toContain(
      "已从歌单库移除 1 个目录中已不存在的歌曲项。"
    );
    expect(repository.save).toHaveBeenCalledOnce();
    expect(repository.clear).not.toHaveBeenCalled();
    expect(getStoredPlaylist()?.itemIds).toEqual([
      "item_valid_first",
      "item_valid_duplicate"
    ]);
    expect(Object.keys(getStoredPlaylist()?.itemsById ?? {})).toEqual([
      "item_valid_first",
      "item_valid_duplicate"
    ]);

    await act(async () => {
      root.unmount();
    });

    const restoredRoot = createRoot(container);

    await act(async () => {
      restoredRoot.render(
        createElement(App, {
          localAudioRepository: createMemoryLocalAudioRepository(),
          playlistRepository: repository
        })
      );
    });

    expect(
      container.querySelector(".playlist-persistence-message.is-notice")
    ).toBeNull();
    expect(repository.save).toHaveBeenCalledOnce();

    await act(async () => {
      restoredRoot.unmount();
    });
    container.remove();
  });

  it("automatically saves every queue mutation and restores an explicit clear", async () => {
    const { repository, getStoredPlaylist } =
      createStatefulTemporaryPlaylistRepository(null);
    let itemSequence = 0;
    const playlistItemIdFactory = vi.fn(() => {
      itemSequence += 1;
      return `item_auto_${itemSequence}`;
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(App, {
          localAudioRepository: createMemoryLocalAudioRepository(),
          playlistRepository: repository,
          playlistItemIdFactory
        })
      );
    });

    expect(repository.save).not.toHaveBeenCalled();

    await act(async () => {
      findButton(container, "将示例歌曲一加入临时歌单")?.click();
    });
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(getStoredPlaylist()?.itemIds).toEqual(["item_auto_1"]);

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".add-album-button")?.click();
    });
    expect(repository.save).toHaveBeenCalledTimes(2);
    expect(getStoredPlaylist()?.itemIds).toEqual([
      "item_auto_1",
      "item_auto_2",
      "item_auto_3"
    ]);

    await act(async () => {
      findButton(container, "打开示例歌曲一的更多操作")?.click();
    });
    await act(async () => {
      findButton(document.body, "增加示例歌曲一的播放次数")?.click();
    });
    expect(repository.save).toHaveBeenCalledTimes(3);
    expect(getStoredPlaylist()?.itemsById.item_auto_1.repeatCount).toBe(2);

    await act(async () => {
      findButton(document.body, "下移示例歌曲一")?.click();
    });
    expect(repository.save).toHaveBeenCalledTimes(4);
    expect(getStoredPlaylist()?.itemIds).toEqual([
      "item_auto_2",
      "item_auto_1",
      "item_auto_3"
    ]);

    await act(async () => {
      findButton(container, "打开示例歌曲二的更多操作")?.click();
    });
    await act(async () => {
      findButton(document.body, "删除示例歌曲二")?.click();
    });
    expect(repository.save).toHaveBeenCalledTimes(5);
    expect(getStoredPlaylist()?.itemIds).toEqual(["item_auto_2", "item_auto_1"]);

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".danger-button")?.click();
    });
    expect(repository.save).toHaveBeenCalledTimes(6);
    expect(getStoredPlaylist()?.itemIds).toEqual([]);
    expect(getStoredPlaylist()?.itemsById).toEqual({});
    expect(repository.clear).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });

    const restoredRoot = createRoot(container);

    await act(async () => {
      restoredRoot.render(
        createElement(App, {
          localAudioRepository: createMemoryLocalAudioRepository(),
          playlistRepository: repository,
          playlistItemIdFactory
        })
      );
    });

    expect(container.querySelector(".queue-empty")).not.toBeNull();
    expect(container.querySelector(".player-now-playing strong")?.textContent).toBe(
      "播放队列为空"
    );
    expect(repository.save).toHaveBeenCalledTimes(6);

    await act(async () => {
      restoredRoot.unmount();
    });
    container.remove();
  });

  it("keeps memory state after load or save failures without overwriting blindly", async () => {
    const loadFailureRepository = {
      load: vi.fn(async () => {
        throw new Error("damaged snapshot");
      }),
      save: vi.fn(async () => undefined),
      clear: vi.fn(async () => undefined)
    } satisfies TemporaryPlaylistRepository;
    const firstContainer = document.createElement("div");
    document.body.append(firstContainer);
    const firstRoot = createRoot(firstContainer);

    await act(async () => {
      firstRoot.render(
        createElement(App, {
          localAudioRepository: createMemoryLocalAudioRepository(),
          playlistRepository: loadFailureRepository,
          playlistItemIdFactory: () => "item_after_load_failure"
        })
      );
    });

    expect(firstContainer.textContent).toContain("无法恢复歌单库");
    expect(loadFailureRepository.save).not.toHaveBeenCalled();
    expect(loadFailureRepository.clear).not.toHaveBeenCalled();

    await act(async () => {
      findButton(firstContainer, "将示例歌曲一加入临时歌单")?.click();
    });

    expect(firstContainer.querySelector(".queue-item h3")?.textContent).toBe(
      "示例歌曲一"
    );
    expect(loadFailureRepository.save).not.toHaveBeenCalled();

    await act(async () => {
      firstRoot.unmount();
    });
    firstContainer.remove();

    let shouldFailSave = true;
    let storedPlaylist: TemporaryPlaylist | null = null;
    const saveFailureRepository = {
      load: vi.fn(async () => null),
      save: vi.fn(async (playlist: TemporaryPlaylist) => {
        if (shouldFailSave) {
          throw new Error("write denied");
        }

        storedPlaylist = structuredClone(playlist);
      }),
      clear: vi.fn(async () => undefined)
    } satisfies TemporaryPlaylistRepository;
    let itemSequence = 0;
    const secondContainer = document.createElement("div");
    document.body.append(secondContainer);
    const secondRoot = createRoot(secondContainer);

    await act(async () => {
      secondRoot.render(
        createElement(App, {
          localAudioRepository: createMemoryLocalAudioRepository(),
          playlistRepository: saveFailureRepository,
          playlistItemIdFactory: () => {
            itemSequence += 1;
            return `item_save_failure_${itemSequence}`;
          }
        })
      );
    });
    await act(async () => {
      findButton(secondContainer, "将示例歌曲一加入临时歌单")?.click();
    });

    expect(secondContainer.querySelector(".queue-item h3")?.textContent).toBe(
      "示例歌曲一"
    );
    expect(secondContainer.textContent).toContain(
      "歌单库保存失败，本次页面中的更改仍然保留。"
    );

    shouldFailSave = false;

    await act(async () => {
      findButton(secondContainer, "将示例歌曲二加入临时歌单")?.click();
    });

    expect(
      Array.from(secondContainer.querySelectorAll(".queue-item h3"), (heading) =>
        heading.textContent?.trim()
      )
    ).toEqual(["示例歌曲一", "示例歌曲二"]);
    expect(secondContainer.textContent).not.toContain("临时歌单保存失败");
    expect((storedPlaylist as TemporaryPlaylist | null)?.itemIds).toEqual([
      "item_save_failure_1",
      "item_save_failure_2"
    ]);

    await act(async () => {
      secondRoot.unmount();
    });
    secondContainer.remove();
  });

  it("serializes delayed saves so the newest complete playlist wins", async () => {
    const firstSaveDeferred = createDeferred<void>();
    let saveCallCount = 0;
    let storedPlaylist: TemporaryPlaylist | null = null;
    const repository = {
      load: vi.fn(async () => null),
      save: vi.fn(async (playlist: TemporaryPlaylist) => {
        saveCallCount += 1;
        const snapshot = structuredClone(playlist);

        if (saveCallCount === 1) {
          await firstSaveDeferred.promise;
        }

        storedPlaylist = snapshot;
      }),
      clear: vi.fn(async () => undefined)
    } satisfies TemporaryPlaylistRepository;
    let itemSequence = 0;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(App, {
          localAudioRepository: createMemoryLocalAudioRepository(),
          playlistRepository: repository,
          playlistItemIdFactory: () => {
            itemSequence += 1;
            return `item_race_${itemSequence}`;
          }
        })
      );
    });
    await act(async () => {
      findButton(container, "将示例歌曲一加入临时歌单")?.click();
    });
    await act(async () => {
      findButton(container, "将示例歌曲二加入临时歌单")?.click();
    });

    expect(repository.save).toHaveBeenCalledOnce();

    await act(async () => {
      firstSaveDeferred.resolve();
      await firstSaveDeferred.promise;
    });

    expect(repository.save).toHaveBeenCalledTimes(2);
    expect((storedPlaylist as TemporaryPlaylist | null)?.itemIds).toEqual([
      "item_race_1",
      "item_race_2"
    ]);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("waits for an old session's final queued save before remounting", async () => {
    const firstSaveDeferred = createDeferred<void>();
    let storedPlaylist: TemporaryPlaylist | null = null;
    let saveCallCount = 0;
    const repository = {
      load: vi.fn(async () =>
        storedPlaylist === null ? null : structuredClone(storedPlaylist)
      ),
      save: vi.fn(async (playlist: TemporaryPlaylist) => {
        saveCallCount += 1;
        const snapshot = structuredClone(playlist);

        if (saveCallCount === 1) {
          await firstSaveDeferred.promise;
        }

        storedPlaylist = snapshot;
      }),
      clear: vi.fn(async () => undefined)
    } satisfies TemporaryPlaylistRepository;
    let itemSequence = 0;
    const playlistItemIdFactory = () => {
      itemSequence += 1;
      return `item_remount_${itemSequence}`;
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(App, {
          localAudioRepository: createMemoryLocalAudioRepository(),
          playlistRepository: repository,
          playlistItemIdFactory
        })
      );
    });
    await act(async () => {
      findButton(container, "将示例歌曲一加入临时歌单")?.click();
    });
    await act(async () => {
      findButton(container, "将示例歌曲二加入临时歌单")?.click();
    });

    expect(repository.save).toHaveBeenCalledOnce();

    await act(async () => {
      root.unmount();
    });

    const restoredRoot = createRoot(container);

    await act(async () => {
      restoredRoot.render(
        createElement(App, {
          localAudioRepository: createMemoryLocalAudioRepository(),
          playlistRepository: repository,
          playlistItemIdFactory
        })
      );
    });

    expect(repository.load).toHaveBeenCalledOnce();
    expect(container.querySelectorAll(".queue-item")).toHaveLength(0);

    await act(async () => {
      firstSaveDeferred.resolve();
      await firstSaveDeferred.promise;
    });

    expect(repository.save).toHaveBeenCalledTimes(2);
    expect(repository.load).toHaveBeenCalledTimes(2);
    expect(
      Array.from(container.querySelectorAll(".queue-item h3"), (heading) =>
        heading.textContent?.trim()
      )
    ).toEqual(["示例歌曲一", "示例歌曲二"]);

    await act(async () => {
      restoredRoot.unmount();
    });
    container.remove();
  });
});

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
      "播放队列为空"
    );

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".danger-button")?.click();
      container.querySelector<HTMLButtonElement>(".add-album-button")?.click();
    });

    expect(container.querySelectorAll(".queue-item")).toHaveLength(1);
    expect(container.querySelector(".queue-item h3")?.textContent).toBe("用户歌曲");
    expect(container.querySelector(".player-now-playing strong")?.textContent).toBe(
      "播放队列为空"
    );
    expect(catalogRepository.load).toHaveBeenCalledOnce();
    expect(catalogRepository.save).not.toHaveBeenCalled();
    expect(catalogRepository.clear).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("connects two loaded user tracks through queue ordering, repeats, and player state", async () => {
    const deferred = createDeferred<UserCatalogChanges>();
    const catalogRepository = createMemoryLocalCatalogRepository(
      () => deferred.promise
    );
    const localAudioRepository = createMemoryLocalAudioRepository();
    const playlistItemIds = [
      "queue_user_single_1",
      "queue_user_album_1",
      "queue_user_album_2"
    ];
    let playlistItemIdIndex = 0;
    const playlistItemIdFactory = vi.fn(() => {
      const itemId = playlistItemIds[playlistItemIdIndex];

      if (itemId === undefined) {
        throw new Error("MVP-07 playlist item ID factory was exhausted.");
      }

      playlistItemIdIndex += 1;
      return itemId;
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const queueTitles = () =>
      Array.from(container.querySelectorAll(".queue-item h3"), (heading) =>
        heading.textContent?.trim()
      );
    const queueItemIds = () =>
      Array.from(
        container.querySelectorAll<HTMLElement>("[data-queue-item-id]"),
        (item) => item.dataset.queueItemId
      );
    const repeatCounts = () =>
      Array.from(
        container.querySelectorAll(".queue-repeat-count"),
        (count) => count.textContent
      );
    const playerTitle = () =>
      container.querySelector(".player-now-playing strong")?.textContent;
    const playerMeta = () =>
      container.querySelector(".player-sequence-meta")?.textContent;

    await act(async () => {
      root.render(
        createElement(App, {
          catalogRepository,
          localAudioRepository,
          playlistItemIdFactory
        })
      );
    });

    expect(container.textContent).toContain("正在读取用户目录，当前先显示内置目录。");
    expect(container.textContent).not.toContain("用户闭环专辑");

    await act(async () => {
      deferred.resolve(createMvp07UserCatalogChanges());
    });

    expect(container.textContent).not.toContain("正在读取用户目录");

    const userAlbumButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".album-list-button")
    ).find((button) => button.textContent?.includes("用户闭环专辑"));

    expect(userAlbumButton).toBeDefined();

    await act(async () => {
      userAlbumButton?.click();
    });
    await act(async () => {
      findButton(container, "将用户歌曲一加入临时歌单")?.click();
    });

    expect(queueTitles()).toEqual(["用户歌曲一"]);
    expect(queueItemIds()).toEqual(["queue_user_single_1"]);
    expect(repeatCounts()).toEqual(["×1"]);
    expect(playerTitle()).toBe("播放队列为空");

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".add-album-button")?.click();
    });

    expect(queueTitles()).toEqual(["用户歌曲一", "用户歌曲一", "用户歌曲二"]);
    expect(queueItemIds()).toEqual([
      "queue_user_single_1",
      "queue_user_album_1",
      "queue_user_album_2"
    ]);
    expect(new Set(queueItemIds())).toHaveLength(3);
    expect(repeatCounts()).toEqual(["×1", "×1", "×1"]);
    expect(playlistItemIdFactory).toHaveBeenCalledTimes(3);
    expect(playerTitle()).toBe("播放队列为空");

    const firstQueueItem = container.querySelector<HTMLElement>(
      '[data-queue-item-id="queue_user_single_1"]'
    );

    await act(async () => {
      firstQueueItem?.querySelector<HTMLButtonElement>(".queue-menu-trigger")?.click();
    });

    const repeatInput = document.body.querySelector<HTMLInputElement>(
      '[role="dialog"] .repeat-stepper input'
    );

    expect(repeatInput).not.toBeNull();

    await act(async () => {
      changeInputValue(repeatInput as HTMLInputElement, "2");
    });

    expect(repeatCounts()).toEqual(["×2", "×1", "×1"]);
    expect(
      container.querySelector(".playlist-heading-actions .pill")?.textContent
    ).toContain("3 首 · 4 次");
    expect(playerTitle()).toBe("播放队列为空");

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });

    const queueItems = container.querySelectorAll<HTMLElement>(
      ".queue-item:not(.queue-item-order-ghost)"
    );
    setVerticalBounds(queueItems[0], 100);
    setVerticalBounds(queueItems[1], 200);
    setVerticalBounds(queueItems[2], 300);

    const panel = container.querySelector(".playlist-panel") as Element;
    const secondTrackDragSource = queueItems[2].querySelector(
      ".queue-item-copy"
    ) as Element;
    const dataTransfer = createDataTransfer();

    await act(async () => {
      dispatchDragEvent(secondTrackDragSource, "dragstart", dataTransfer, 340);
      dispatchDragEvent(panel, "dragover", dataTransfer, 180);
      dispatchDragEvent(panel, "drop", dataTransfer, 180);
      dispatchDragEvent(secondTrackDragSource, "dragend", dataTransfer, 180);
    });

    expect(queueTitles()).toEqual(["用户歌曲一", "用户歌曲二", "用户歌曲一"]);
    expect(queueItemIds()).toEqual([
      "queue_user_single_1",
      "queue_user_album_2",
      "queue_user_album_1"
    ]);
    expect(repeatCounts()).toEqual(["×2", "×1", "×1"]);
    expect(playerTitle()).toBe("播放队列为空");

    await act(async () => {
      findButton(container, "播放")?.click();
    });

    expect(playerTitle()).toBe("用户歌曲一");
    expect(playerMeta()).toContain("播放序列 1 / 4");

    await act(async () => {
      findButton(container, "下一首")?.click();
    });
    expect(playerTitle()).toBe("用户歌曲一");
    expect(playerMeta()).toContain("播放序列 2 / 4");
    expect(playerMeta()).toContain("本项第 2 / 2 次");

    await act(async () => {
      findButton(container, "下一首")?.click();
    });
    expect(playerTitle()).toBe("用户歌曲二");
    expect(playerMeta()).toContain("播放序列 3 / 4");
    expect(playerMeta()).toContain("本项第 1 / 1 次");

    await act(async () => {
      findButton(container, "下一首")?.click();
    });
    expect(playerTitle()).toBe("用户歌曲一");
    expect(playerMeta()).toContain("播放序列 4 / 4");
    expect(playerMeta()).toContain("本项第 1 / 1 次");

    const queueIdsBeforeEdit = queueItemIds();
    const playerMetaBeforeEdit = playerMeta();

    await chooseTrackMenuAction(container, "用户歌曲一", "编辑用户歌曲一的元数据");
    await act(async () => {
      changeInputValue(
        container.querySelector<HTMLInputElement>(
          'input[name="track-title"]'
        ) as HTMLInputElement,
        "  用户歌曲一（已修改）  "
      );
      findButtonByText(container, "保存修改")?.click();
    });

    expect(queueTitles()).toEqual([
      "用户歌曲一（已修改）",
      "用户歌曲二",
      "用户歌曲一（已修改）"
    ]);
    expect(queueItemIds()).toEqual(queueIdsBeforeEdit);
    expect(playerTitle()).toBe("用户歌曲一（已修改）");
    expect(playerMeta()).toBe(playerMetaBeforeEdit);
    expect(catalogRepository.load).toHaveBeenCalledOnce();
    expect(catalogRepository.save).toHaveBeenCalledOnce();
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
    await act(async () => {
      findButton(container, "播放")?.click();
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

describe("album creation workflow", () => {
  it("saves before publishing, selects the stable ID, and restores it after remount", async () => {
    const saveDeferred = createDeferred<void>();
    const initialChanges = createUserCatalogChanges();
    let storedChanges = structuredClone(initialChanges);
    const catalogRepository = {
      load: vi.fn(async () => structuredClone(storedChanges)),
      save: vi.fn(async (changes: UserCatalogChanges) => {
        await saveDeferred.promise;
        storedChanges = structuredClone(changes);
      }),
      clear: vi.fn(async () => undefined)
    } satisfies LocalCatalogRepository;
    const localAudioRepository = createMemoryLocalAudioRepository();
    const idFactory = vi.fn(() => "album_user_stable_001");
    const catalogSnapshot = structuredClone(mockCatalog);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(App, {
          catalogRepository,
          catalogEntityIdFactory: idFactory,
          localAudioRepository
        })
      );
    });
    await act(async () => {
      findButtonByText(container, "新增专辑")?.click();
    });

    const editableInputs = container.querySelectorAll<HTMLInputElement>(
      ".catalog-editor input:not([readonly])"
    );
    const typeSelect = container.querySelector<HTMLSelectElement>(
      ".catalog-editor select"
    );

    await act(async () => {
      changeInputValue(editableInputs[0], "  同名也使用稳定 ID  ");
      if (typeSelect) {
        changeSelectValue(typeSelect, "other");
      }
    });

    const submitButton = findButtonByText(container, "保存专辑");

    await act(async () => {
      submitButton?.click();
      submitButton?.click();
    });

    expect(catalogRepository.save).toHaveBeenCalledOnce();
    expect(idFactory).toHaveBeenCalledOnce();
    expect(container.querySelector(".catalog-editor")).not.toBeNull();
    expect(container.textContent).not.toContain("同名也使用稳定 ID");
    expect(findButtonByText(container, "正在保存…")?.disabled).toBe(true);

    await act(async () => {
      saveDeferred.resolve(undefined);
      await saveDeferred.promise;
    });

    expect(storedChanges.addedAlbums[0]).toEqual(initialChanges.addedAlbums[0]);
    expect(storedChanges.addedTracks).toEqual(initialChanges.addedTracks);
    expect(storedChanges.addedAlbums[1]).toEqual({
      id: "album_user_stable_001",
      artistId: "artist_vae",
      title: "同名也使用稳定 ID",
      type: "other",
      sortOrder: 4,
      trackIds: []
    });
    expect(container.querySelector(".catalog-editor")).toBeNull();
    expect(container.querySelector("#album-detail-heading")?.textContent).toBe(
      "同名也使用稳定 ID"
    );
    expect(container.querySelector(".catalog-empty-message")?.textContent).toContain(
      "尚未维护歌曲数据"
    );
    expect(mockCatalog).toEqual(catalogSnapshot);

    await act(async () => {
      root.unmount();
    });

    const restoredRoot = createRoot(container);

    await act(async () => {
      restoredRoot.render(
        createElement(App, {
          catalogRepository,
          catalogEntityIdFactory: idFactory,
          localAudioRepository
        })
      );
    });

    const restoredAlbumButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".album-list-button")
    ).find((button) => button.textContent?.includes("同名也使用稳定 ID"));

    expect(restoredAlbumButton).toBeDefined();
    expect(catalogRepository.load).toHaveBeenCalledTimes(2);
    expect(catalogRepository.save).toHaveBeenCalledOnce();
    expect(idFactory).toHaveBeenCalledOnce();

    await act(async () => {
      restoredAlbumButton?.click();
    });

    expect(container.querySelector("#album-detail-heading")?.textContent).toBe(
      "同名也使用稳定 ID"
    );

    await act(async () => {
      restoredRoot.unmount();
    });
    container.remove();
  });

  it("keeps valid input and the previous catalog visible when saving fails", async () => {
    const catalogRepository = {
      load: vi.fn(async () => createEmptyUserCatalogChanges()),
      save: vi.fn(async () => {
        throw new Error("storage denied");
      }),
      clear: vi.fn(async () => undefined)
    } satisfies LocalCatalogRepository;
    const localAudioRepository = createMemoryLocalAudioRepository();
    const idFactory = vi.fn(() => "album_user_failed_001");
    const catalogSnapshot = structuredClone(mockCatalog);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(App, {
          catalogRepository,
          catalogEntityIdFactory: idFactory,
          localAudioRepository
        })
      );
    });
    await act(async () => {
      findButtonByText(container, "新增专辑")?.click();
    });

    const titleInput = container.querySelector<HTMLInputElement>(
      ".catalog-editor input:not([readonly])"
    );

    await act(async () => {
      if (titleInput) {
        changeInputValue(titleInput, "  待重试专辑  ");
      }
      findButtonByText(container, "保存专辑")?.click();
    });

    expect(catalogRepository.save).toHaveBeenCalledOnce();
    expect(container.textContent).toContain(
      "保存新专辑失败，请检查浏览器存储权限后重试。"
    );
    expect(titleInput?.value).toBe("  待重试专辑  ");
    expect(container.querySelector(".catalog-editor")).not.toBeNull();
    expect(
      Array.from(
        container.querySelectorAll<HTMLButtonElement>(".album-list-button")
      ).some((button) => button.textContent?.includes("待重试专辑"))
    ).toBe(false);
    expect(container.querySelector("#album-detail-heading")?.textContent).toBe(
      "示例专辑 A"
    );
    expect(mockCatalog).toEqual(catalogSnapshot);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});

describe("track creation workflow", () => {
  it("saves atomically, joins the queue, and restores the track after remount", async () => {
    const saveDeferred = createDeferred<void>();
    const initialChanges = createUserCatalogChanges();
    let storedChanges = structuredClone(initialChanges);
    const catalogRepository = {
      load: vi.fn(async () => structuredClone(storedChanges)),
      save: vi.fn(async (changes: UserCatalogChanges) => {
        await saveDeferred.promise;
        storedChanges = structuredClone(changes);
      }),
      clear: vi.fn(async () => undefined)
    } satisfies LocalCatalogRepository;
    const localAudioRepository = createMemoryLocalAudioRepository();
    const idFactory = vi.fn(() => "track_user_stable_002");
    const catalogSnapshot = structuredClone(mockCatalog);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(App, {
          catalogRepository,
          catalogEntityIdFactory: idFactory,
          localAudioRepository
        })
      );
    });

    const userAlbumButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".album-list-button")
    ).find((button) => button.textContent?.includes("用户专辑"));

    await act(async () => {
      userAlbumButton?.click();
    });
    await chooseAlbumMenuAction(container, "用户专辑", "添加歌曲");
    await act(async () => {
      changeInputValue(
        container.querySelector<HTMLInputElement>(
          'input[name="track-title"]'
        ) as HTMLInputElement,
        "  新增用户歌曲  "
      );
      changeInputValue(
        container.querySelector<HTMLInputElement>(
          'input[name="track-number"]'
        ) as HTMLInputElement,
        "2"
      );
    });

    const submitButton = findButtonByText(container, "保存歌曲");

    await act(async () => {
      submitButton?.click();
      submitButton?.click();
    });

    expect(catalogRepository.save).toHaveBeenCalledOnce();
    expect(idFactory).toHaveBeenCalledOnce();
    expect(findButton(container, "将新增用户歌曲加入临时歌单")).toBeUndefined();
    expect(container.querySelector(".catalog-track-editor")).not.toBeNull();
    expect(findButtonByText(container, "正在保存…")?.disabled).toBe(true);

    await act(async () => {
      saveDeferred.resolve(undefined);
      await saveDeferred.promise;
    });

    expect(storedChanges.addedAlbums[0]).toEqual({
      ...initialChanges.addedAlbums[0],
      trackIds: ["track_user_001", "track_user_stable_002"]
    });
    expect(storedChanges.addedTracks[0]).toEqual(initialChanges.addedTracks[0]);
    expect(storedChanges.addedTracks[1]).toEqual({
      id: "track_user_stable_002",
      artistId: "artist_vae",
      albumId: "album_user_001",
      title: "新增用户歌曲",
      trackNumber: 2
    });
    expect(storedChanges.albumTrackIdAdditions).toEqual(
      initialChanges.albumTrackIdAdditions
    );
    expect(container.querySelector(".catalog-track-editor")).toBeNull();
    expect(findButton(container, "将新增用户歌曲加入临时歌单")).toBeDefined();
    expect(container.querySelector("#album-detail-heading")?.textContent).toBe(
      "用户专辑"
    );
    expect(mockCatalog).toEqual(catalogSnapshot);

    await act(async () => {
      findButton(container, "将新增用户歌曲加入临时歌单")?.click();
    });

    expect(container.querySelector(".queue-item h3")?.textContent).toBe("新增用户歌曲");
    expect(container.querySelector(".queue-repeat-count")?.textContent).toBe("×1");
    expect(container.querySelector(".player-now-playing strong")?.textContent).toBe(
      "播放队列为空"
    );

    const secondAlbumButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".album-list-button")
    ).find((button) => button.textContent?.includes("示例专辑 B"));

    await act(async () => {
      secondAlbumButton?.click();
    });

    expect(container.querySelector(".album-track-list")?.textContent).not.toContain(
      "新增用户歌曲"
    );

    await act(async () => {
      root.unmount();
    });

    const restoredRoot = createRoot(container);

    await act(async () => {
      restoredRoot.render(
        createElement(App, {
          catalogRepository,
          catalogEntityIdFactory: idFactory,
          localAudioRepository
        })
      );
    });

    const restoredAlbumButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".album-list-button")
    ).find((button) => button.textContent?.includes("用户专辑"));

    await act(async () => {
      restoredAlbumButton?.click();
    });

    expect(findButton(container, "将新增用户歌曲加入临时歌单")).toBeDefined();
    expect(catalogRepository.load).toHaveBeenCalledTimes(2);
    expect(catalogRepository.save).toHaveBeenCalledOnce();
    expect(idFactory).toHaveBeenCalledOnce();

    await act(async () => {
      findButton(container, "将新增用户歌曲加入临时歌单")?.click();
    });

    expect(container.querySelector(".queue-item h3")?.textContent).toBe("新增用户歌曲");

    await act(async () => {
      restoredRoot.unmount();
    });
    container.remove();
  });

  it("retains the track form and old bidirectional relations when saving fails", async () => {
    const initialChanges = createUserCatalogChanges();
    const catalogRepository = {
      load: vi.fn(async () => structuredClone(initialChanges)),
      save: vi.fn(async () => {
        throw new Error("storage denied");
      }),
      clear: vi.fn(async () => undefined)
    } satisfies LocalCatalogRepository;
    const localAudioRepository = createMemoryLocalAudioRepository();
    const idFactory = vi.fn(() => "track_user_failed_002");
    const catalogSnapshot = structuredClone(mockCatalog);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(App, {
          catalogRepository,
          catalogEntityIdFactory: idFactory,
          localAudioRepository
        })
      );
    });

    const userAlbumButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".album-list-button")
    ).find((button) => button.textContent?.includes("用户专辑"));

    await act(async () => {
      userAlbumButton?.click();
    });
    await chooseAlbumMenuAction(container, "用户专辑", "添加歌曲");

    const titleInput = container.querySelector<HTMLInputElement>(
      'input[name="track-title"]'
    );

    await act(async () => {
      changeInputValue(titleInput as HTMLInputElement, "  待重试歌曲  ");
      changeInputValue(
        container.querySelector<HTMLInputElement>(
          'input[name="track-number"]'
        ) as HTMLInputElement,
        "2"
      );
      findButtonByText(container, "保存歌曲")?.click();
    });

    expect(catalogRepository.save).toHaveBeenCalledOnce();
    expect(container.textContent).toContain(
      "保存新歌曲失败，请检查浏览器存储权限后重试。"
    );
    expect(titleInput?.value).toBe("  待重试歌曲  ");
    expect(container.querySelector(".catalog-track-editor")).not.toBeNull();
    expect(findButton(container, "将待重试歌曲加入临时歌单")).toBeUndefined();
    expect(
      Array.from(
        container.querySelectorAll<HTMLElement>(".album-track-list .track-copy")
      ).map((item) => item.textContent)
    ).toEqual(["用户歌曲用户专辑"]);
    expect(initialChanges.addedAlbums[0].trackIds).toEqual(["track_user_001"]);
    expect(initialChanges.addedTracks).toHaveLength(1);
    expect(mockCatalog).toEqual(catalogSnapshot);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("uses the same track ordering for display and whole-album queueing", async () => {
    const changes = createOrderedUserCatalogChanges();
    const catalogRepository = createMemoryLocalCatalogRepository(async () => changes);
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

    const albumButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".album-list-button")
    ).find((button) => button.textContent?.includes("曲序测试专辑"));

    await act(async () => {
      albumButton?.click();
    });

    expect(
      Array.from(
        container.querySelectorAll<HTMLElement>(".album-track-list .track-copy strong"),
        (heading) => heading.textContent
      )
    ).toEqual(["第一首", "第二首", "同曲序第二首"]);

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".add-album-button")?.click();
    });

    expect(
      Array.from(container.querySelectorAll(".queue-item h3"), (heading) =>
        heading.textContent?.trim()
      )
    ).toEqual(["第一首", "第二首", "同曲序第二首"]);
    expect(catalogRepository.save).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});

describe("catalog metadata editing workflow", () => {
  it("keeps a built-in track linked to its queue item and local audio through edit and reset", async () => {
    const { repository: catalogRepository, getStoredChanges } =
      createStatefulLocalCatalogRepository(createEmptyUserCatalogChanges());
    const localFile = new File(["self-created test bytes"], "sample-one.mp3", {
      type: "audio/mpeg"
    });
    const localAudioRepository = createMemoryLocalAudioRepository([
      createLocalAudioFileRecord(
        "track_sample_001",
        localFile,
        "2026-07-17T00:00:00.000Z"
      )
    ]);
    const mediaMocks = installAudioElementMocks();
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
    await act(async () => {
      findButton(container, "将示例歌曲二加入临时歌单")?.click();
    });
    await act(async () => {
      findButton(container, "播放")?.click();
    });

    const queueItemIds = Array.from(
      container.querySelectorAll<HTMLElement>("[data-queue-item-id]"),
      (item) => item.dataset.queueItemId
    );
    const playbackOccurrenceBeforeEdit = container.querySelector(
      ".player-sequence-meta"
    )?.textContent;
    const playCallsBeforeEdit = mediaMocks.play.mock.calls.length;
    const objectUrlCallsBeforeEdit = mediaMocks.createObjectURL.mock.calls.length;

    await chooseTrackMenuAction(container, "示例歌曲一", "编辑示例歌曲一的元数据");
    await act(async () => {
      changeInputValue(
        container.querySelector<HTMLInputElement>(
          'input[name="track-title"]'
        ) as HTMLInputElement,
        "  本地修订歌曲  "
      );
      changeInputValue(
        container.querySelector<HTMLInputElement>(
          'input[name="track-number"]'
        ) as HTMLInputElement,
        "3"
      );
      findButtonByText(container, "保存修改")?.click();
    });

    expect(getStoredChanges().trackOverrides).toEqual({
      track_sample_001: {
        title: "本地修订歌曲",
        trackNumber: 3
      }
    });
    expect(
      Array.from(
        container.querySelectorAll<HTMLElement>("[data-queue-item-id]"),
        (item) => item.dataset.queueItemId
      )
    ).toEqual(queueItemIds);
    expect(
      Array.from(container.querySelectorAll(".queue-item h3"), (heading) =>
        heading.textContent?.trim()
      )
    ).toEqual(["本地修订歌曲", "示例歌曲二"]);
    expect(container.querySelector(".player-now-playing strong")?.textContent).toBe(
      "本地修订歌曲"
    );
    expect(container.querySelector(".player-status")?.textContent).toContain(
      "正在播放"
    );
    expect(container.querySelector(".player-sequence-meta")?.textContent).toBe(
      playbackOccurrenceBeforeEdit
    );
    expect(container.querySelector(".player-audio-binding")?.textContent).toBe(
      "已绑定：sample-one.mp3"
    );
    expect(
      Array.from(
        container.querySelectorAll<HTMLElement>(".album-track-list .track-copy strong"),
        (heading) => heading.textContent
      )
    ).toEqual(["示例歌曲二", "本地修订歌曲"]);
    expect(localAudioRepository.save).not.toHaveBeenCalled();
    expect(localAudioRepository.remove).not.toHaveBeenCalled();
    expect(mediaMocks.play).toHaveBeenCalledTimes(playCallsBeforeEdit);
    expect(mediaMocks.createObjectURL).toHaveBeenCalledTimes(objectUrlCallsBeforeEdit);

    await act(async () => {
      root.unmount();
    });

    const restoredRoot = createRoot(container);

    await act(async () => {
      restoredRoot.render(
        createElement(App, {
          catalogRepository,
          localAudioRepository
        })
      );
    });

    await openTrackActionsMenu(container, "本地修订歌曲");
    expect(findButton(document.body, "编辑本地修订歌曲的元数据")).toBeDefined();
    await openTrackActionsMenu(container, "本地修订歌曲");
    expect(container.textContent).toContain("已绑定：sample-one.mp3");
    await act(async () => {
      findButton(container, "播放")?.click();
    });

    const restoredQueueItemIds = Array.from(
      container.querySelectorAll<HTMLElement>("[data-queue-item-id]"),
      (item) => item.dataset.queueItemId
    );
    const playbackOccurrenceBeforeReset = container.querySelector(
      ".player-sequence-meta"
    )?.textContent;
    const playCallsBeforeReset = mediaMocks.play.mock.calls.length;
    const objectUrlCallsBeforeReset = mediaMocks.createObjectURL.mock.calls.length;

    await chooseTrackMenuAction(container, "本地修订歌曲", "编辑本地修订歌曲的元数据");
    expect(findButtonByText(container, "恢复默认")).toBeDefined();

    await act(async () => {
      findButtonByText(container, "恢复默认")?.click();
    });

    expect(getStoredChanges().trackOverrides).toEqual({});
    expect(catalogRepository.save).toHaveBeenCalledTimes(2);
    expect(catalogRepository.clear).not.toHaveBeenCalled();
    expect(
      Array.from(
        container.querySelectorAll<HTMLElement>("[data-queue-item-id]"),
        (item) => item.dataset.queueItemId
      )
    ).toEqual(restoredQueueItemIds);
    expect(
      Array.from(container.querySelectorAll(".queue-item h3"), (heading) =>
        heading.textContent?.trim()
      )
    ).toEqual(["示例歌曲一", "示例歌曲二"]);
    expect(container.querySelector(".player-now-playing strong")?.textContent).toBe(
      "示例歌曲一"
    );
    expect(container.querySelector(".player-status")?.textContent).toContain(
      "正在播放"
    );
    expect(container.querySelector(".player-sequence-meta")?.textContent).toBe(
      playbackOccurrenceBeforeReset
    );
    expect(container.querySelector(".player-audio-binding")?.textContent).toBe(
      "已绑定：sample-one.mp3"
    );
    expect(
      Array.from(
        container.querySelectorAll<HTMLElement>(".album-track-list .track-copy strong"),
        (heading) => heading.textContent
      )
    ).toEqual(["示例歌曲一", "示例歌曲二"]);
    expect(localAudioRepository.save).not.toHaveBeenCalled();
    expect(localAudioRepository.remove).not.toHaveBeenCalled();
    expect(mediaMocks.play).toHaveBeenCalledTimes(playCallsBeforeReset);
    expect(mediaMocks.createObjectURL).toHaveBeenCalledTimes(objectUrlCallsBeforeReset);

    await act(async () => {
      restoredRoot.unmount();
    });
    container.remove();
  });

  it("updates user-created entities directly and restores them after remount", async () => {
    const initialChanges = createUserCatalogChanges();
    const { repository: catalogRepository, getStoredChanges } =
      createStatefulLocalCatalogRepository(initialChanges);
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

    const userAlbumButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".album-list-button")
    ).find((button) => button.textContent?.includes("用户专辑"));

    await act(async () => {
      userAlbumButton?.click();
    });
    await chooseAlbumMenuAction(container, "用户专辑", "编辑专辑");

    expect(findButtonByText(container, "恢复默认")).toBeUndefined();

    await act(async () => {
      changeInputValue(
        container.querySelector<HTMLInputElement>(
          'input[name="album-title"]'
        ) as HTMLInputElement,
        "  用户修订专辑  "
      );
      changeSelectValue(
        container.querySelector<HTMLSelectElement>(
          'select[name="album-type"]'
        ) as HTMLSelectElement,
        "ep"
      );
      findButtonByText(container, "保存修改")?.click();
    });

    expect(getStoredChanges().addedAlbums[0]).toEqual({
      ...initialChanges.addedAlbums[0],
      title: "用户修订专辑",
      type: "ep"
    });
    expect(getStoredChanges().albumOverrides).toEqual({});
    expect(container.querySelector("#album-detail-heading")?.textContent).toBe(
      "用户修订专辑"
    );

    await chooseTrackMenuAction(container, "用户歌曲", "编辑用户歌曲的元数据");

    expect(findButtonByText(container, "恢复默认")).toBeUndefined();

    await act(async () => {
      changeInputValue(
        container.querySelector<HTMLInputElement>(
          'input[name="track-title"]'
        ) as HTMLInputElement,
        "  用户修订歌曲  "
      );
      changeInputValue(
        container.querySelector<HTMLInputElement>(
          'input[name="track-number"]'
        ) as HTMLInputElement,
        "3"
      );
      findButtonByText(container, "保存修改")?.click();
    });

    expect(getStoredChanges().addedTracks[0]).toEqual({
      ...initialChanges.addedTracks[0],
      title: "用户修订歌曲",
      trackNumber: 3
    });
    expect(getStoredChanges().trackOverrides).toEqual({});
    expect(getStoredChanges().addedAlbums[0].trackIds).toEqual(["track_user_001"]);

    await act(async () => {
      findButton(container, "将用户修订歌曲加入临时歌单")?.click();
    });
    expect(container.querySelector(".queue-item h3")?.textContent).toBe("用户修订歌曲");

    await act(async () => {
      root.unmount();
    });

    const restoredRoot = createRoot(container);

    await act(async () => {
      restoredRoot.render(
        createElement(App, {
          catalogRepository,
          localAudioRepository
        })
      );
    });

    const restoredAlbumButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".album-list-button")
    ).find((button) => button.textContent?.includes("用户修订专辑"));

    expect(restoredAlbumButton).toBeDefined();
    expect(catalogRepository.load).toHaveBeenCalledTimes(2);
    expect(catalogRepository.save).toHaveBeenCalledTimes(2);

    await act(async () => {
      restoredAlbumButton?.click();
    });

    await openTrackActionsMenu(container, "用户修订歌曲");
    expect(findButton(document.body, "编辑用户修订歌曲的元数据")).toBeDefined();
    await openTrackActionsMenu(container, "用户修订歌曲");
    expect(container.querySelector(".album-track-list")?.textContent).toContain(
      "用户修订歌曲"
    );

    await act(async () => {
      restoredRoot.unmount();
    });
    container.remove();
  });

  it("keeps the previous catalog and raw edit input when saving an edit fails", async () => {
    const initialChanges = createEmptyUserCatalogChanges();
    const catalogRepository = {
      load: vi.fn(async () => structuredClone(initialChanges)),
      save: vi.fn(async () => {
        throw new Error("storage denied");
      }),
      clear: vi.fn(async () => undefined)
    } satisfies LocalCatalogRepository;
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
    await chooseTrackMenuAction(container, "示例歌曲一", "编辑示例歌曲一的元数据");

    const titleInput = container.querySelector<HTMLInputElement>(
      'input[name="track-title"]'
    );

    await act(async () => {
      changeInputValue(titleInput as HTMLInputElement, "  尚未保存的修订  ");
      findButtonByText(container, "保存修改")?.click();
    });

    expect(catalogRepository.save).toHaveBeenCalledOnce();
    expect(catalogRepository.clear).not.toHaveBeenCalled();
    expect(container.textContent).toContain(
      "保存歌曲修改失败，请检查浏览器存储权限后重试。"
    );
    expect(titleInput?.value).toBe("  尚未保存的修订  ");
    expect(container.querySelector(".catalog-track-editor")).not.toBeNull();
    expect(container.querySelector(".album-track-list")?.textContent).toContain(
      "示例歌曲一"
    );
    expect(container.querySelector(".album-track-list")?.textContent).not.toContain(
      "尚未保存的修订"
    );
    expect(initialChanges.trackOverrides).toEqual({});

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

    expect(container.querySelector(".player-now-playing strong")?.textContent).toBe(
      "播放队列为空"
    );
    expect(container.querySelector(".player-audio-binding")).toBeNull();
    expect(findButton(container, "播放")?.disabled).toBe(false);
    expect(mediaMocks.play).not.toHaveBeenCalled();

    await act(async () => {
      findButton(container, "播放")?.click();
    });

    expect(container.querySelector(".player-audio-binding")?.textContent).toBe(
      "未绑定音频文件"
    );
    expect(findButton(container, "播放")?.disabled).toBe(true);

    const localFile = new File(["self-created test bytes"], "sample-one.mp3", {
      type: "audio/mpeg"
    });

    await selectCatalogTrackAudioFile(container, "示例歌曲一", localFile);

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

    await chooseTrackMenuAction(
      container,
      "示例歌曲一",
      "解除示例歌曲一的本地音频绑定"
    );

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

    expect(playerTitle()).toBe("播放队列为空");
    expect(playerStatus()).toContain("等待播放队列");

    await act(async () => {
      findButton(container, "打开示例歌曲一的更多操作")?.click();
    });
    await act(async () => {
      findButton(document.body, "增加示例歌曲一的播放次数")?.click();
    });

    expect(playerTitle()).toBe("播放队列为空");

    await act(async () => {
      findButton(container, "打开示例歌曲一的更多操作")?.click();
    });
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();

    await act(async () => {
      findButton(container, "播放")?.click();
    });

    expect(playerTitle()).toBe("示例歌曲一");
    expect(playerMeta()).toContain("播放序列 1 / 3");
    expect(playerMeta()).toContain("本项第 1 / 2 次");
    expect(playerStatus()).toContain("正在播放");
    expect(findButton(container, "暂停")).not.toBeUndefined();
    expect(mediaMocks.play).toHaveBeenCalled();

    expect(container.querySelector("audio")).not.toBeNull();

    await act(async () => {
      container
        .querySelector("audio")
        ?.dispatchEvent(new Event("ended", { bubbles: true }));
    });

    expect(playerTitle()).toBe("示例歌曲一");
    expect(playerMeta()).toContain("播放序列 2 / 3");
    expect(playerMeta()).toContain("本项第 2 / 2 次");

    await act(async () => {
      container
        .querySelector("audio")
        ?.dispatchEvent(new Event("ended", { bubbles: true }));
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
      container
        .querySelector("audio")
        ?.dispatchEvent(new Event("ended", { bubbles: true }));
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
    expect(playerTitle()).toBe("示例歌曲一");
    expect(playerMeta()).toContain("播放序列 1 / 3");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("updates local playback progress, seeks safely, and clears stale media timing", async () => {
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
        "2026-07-18T00:00:00.000Z"
      ),
      createLocalAudioFileRecord(
        "track_sample_002",
        secondFile,
        "2026-07-18T00:00:00.000Z"
      )
    ]);
    installAudioElementMocks();
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

    const firstAudio = container.querySelector<HTMLAudioElement>("audio");
    const progressRange = container.querySelector<HTMLInputElement>(
      'input[aria-label="播放进度"]'
    );
    const currentProgressTime = container.querySelector(".player-progress-current");
    const durationProgressTime = container.querySelector(".player-progress-duration");

    expect(progressRange?.disabled).toBe(true);
    expect(currentProgressTime?.textContent).toBe("--:--");
    expect(durationProgressTime?.textContent).toBe("--:--");

    await act(async () => {
      setAudioTiming(firstAudio as HTMLAudioElement, 245, 61.4);
      firstAudio?.dispatchEvent(new Event("loadedmetadata"));
      firstAudio?.dispatchEvent(new Event("timeupdate"));
    });

    expect(progressRange?.disabled).toBe(false);
    expect(progressRange?.max).toBe("245");
    expect(progressRange?.value).toBe("61.4");
    expect(currentProgressTime?.textContent).toBe("1:01");
    expect(durationProgressTime?.textContent).toBe("4:05");

    await act(async () => {
      changeInputValue(progressRange as HTMLInputElement, "120");
    });

    expect(firstAudio?.currentTime).toBe(120);
    expect(currentProgressTime?.textContent).toBe("2:00");
    expect(durationProgressTime?.textContent).toBe("4:05");

    await act(async () => {
      setAudioTiming(firstAudio as HTMLAudioElement, Number.NaN, 120);
      firstAudio?.dispatchEvent(new Event("durationchange"));
    });

    expect(progressRange?.disabled).toBe(true);
    expect(currentProgressTime?.textContent).toBe("--:--");
    expect(durationProgressTime?.textContent).toBe("--:--");

    await act(async () => {
      findButton(container, "下一首")?.click();
    });

    expect(container.querySelector(".player-now-playing strong")?.textContent).toBe(
      "示例歌曲二"
    );
    expect(progressRange?.disabled).toBe(true);
    expect(currentProgressTime?.textContent).toBe("--:--");
    expect(durationProgressTime?.textContent).toBe("--:--");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("restores volume and mute settings without restoring playback", async () => {
    const localFile = new File(["local settings test file"], "sample-one.mp3", {
      type: "audio/mpeg"
    });
    const localAudioRepository = createMemoryLocalAudioRepository([
      createLocalAudioFileRecord(
        "track_sample_001",
        localFile,
        "2026-07-18T00:00:00.000Z"
      )
    ]);
    let storedSettings = { volume: 0.35, muted: true };
    const playerSettingsRepository = {
      load: vi.fn(async () => storedSettings),
      save: vi.fn(async (settings) => {
        storedSettings = { ...settings };
      })
    } satisfies PlayerSettingsRepository;
    const mediaMocks = installAudioElementMocks();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(App, { localAudioRepository, playerSettingsRepository })
      );
    });

    const volumeRange = container.querySelector<HTMLInputElement>(
      'input[aria-label="音量"]'
    );
    const audio = container.querySelector<HTMLAudioElement>("audio");

    expect(volumeRange?.value).toBe("0.35");
    expect(audio?.volume).toBe(0.35);
    expect(audio?.muted).toBe(true);
    expect(mediaMocks.play).not.toHaveBeenCalled();

    await act(async () => {
      findButton(container, "取消静音")?.click();
      changeInputValue(volumeRange as HTMLInputElement, "0.6");
    });

    expect(audio?.muted).toBe(false);
    expect(audio?.volume).toBe(0.6);
    expect(playerSettingsRepository.save).toHaveBeenLastCalledWith({
      volume: 0.6,
      muted: false
    });

    await act(async () => {
      root.unmount();
    });
    container.remove();

    const restoredContainer = document.createElement("div");
    document.body.append(restoredContainer);
    const restoredRoot = createRoot(restoredContainer);

    await act(async () => {
      restoredRoot.render(
        createElement(App, { localAudioRepository, playerSettingsRepository })
      );
    });

    expect(
      restoredContainer.querySelector<HTMLInputElement>('input[aria-label="音量"]')
        ?.value
    ).toBe("0.6");
    expect(restoredContainer.querySelector<HTMLAudioElement>("audio")?.muted).toBe(
      false
    );
    expect(mediaMocks.play).not.toHaveBeenCalled();
    expect(restoredContainer.querySelector(".player-status")?.textContent).toContain(
      "等待播放队列"
    );

    await act(async () => {
      restoredRoot.unmount();
    });
    restoredContainer.remove();
  });

  it("ignores delayed ended callbacks from sources used before rapid switches", async () => {
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
        "2026-07-15T00:00:01.000Z"
      )
    ]);
    const mediaMocks = installAudioElementMocks();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(App, { localAudioRepository: repository }));
    });

    const endedListeners = monitorAudioEndedListeners();
    const playerTitle = () =>
      container.querySelector(".player-now-playing strong")?.textContent;
    const playerMeta = () =>
      container.querySelector(".player-sequence-meta")?.textContent;

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".add-album-button")?.click();
    });
    await act(async () => {
      findButton(container, "播放")?.click();
    });

    expect(endedListeners).toHaveLength(1);
    const firstSourceEnded = endedListeners[0];

    await act(async () => {
      findButton(container, "下一首")?.click();
    });

    expect(playerTitle()).toBe("示例歌曲二");
    expect(endedListeners).toHaveLength(2);
    expect(firstSourceEnded.removed).toBe(true);
    const secondSourceEnded = endedListeners[1];
    expect(secondSourceEnded.audio).not.toBe(firstSourceEnded.audio);

    await act(async () => {
      findButton(container, "上一首")?.click();
    });

    expect(playerTitle()).toBe("示例歌曲一");
    expect(endedListeners).toHaveLength(3);
    expect(secondSourceEnded.removed).toBe(true);
    const currentSourceEnded = endedListeners[2];
    expect(currentSourceEnded.audio).not.toBe(secondSourceEnded.audio);
    expect(currentSourceEnded.audio).not.toBe(firstSourceEnded.audio);
    const currentMeta = playerMeta();

    await act(async () => {
      firstSourceEnded.audio.dispatchEvent(new Event("ended"));
      secondSourceEnded.audio.dispatchEvent(new Event("ended"));
      invokeEndedListener(firstSourceEnded);
      invokeEndedListener(secondSourceEnded);
    });

    expect(playerTitle()).toBe("示例歌曲一");
    expect(playerMeta()).toBe(currentMeta);
    expect(container.querySelector(".player-status")?.textContent).toContain(
      "正在播放"
    );

    await act(async () => {
      currentSourceEnded.audio.dispatchEvent(new Event("ended"));
    });

    expect(playerTitle()).toBe("示例歌曲二");
    expect(container.querySelector(".player-status")?.textContent).toContain(
      "正在播放"
    );
    expect(currentSourceEnded.removed).toBe(true);
    expect(endedListeners).toHaveLength(4);
    const secondTrackSourceEnded = endedListeners[3];
    expect(secondTrackSourceEnded.audio).not.toBe(currentSourceEnded.audio);

    await act(async () => {
      invokeEndedListener(currentSourceEnded);
    });

    expect(playerTitle()).toBe("示例歌曲二");

    await act(async () => {
      root.unmount();
    });
    expect(secondTrackSourceEnded.removed).toBe(true);
    expect(mediaMocks.revokeObjectURL).toHaveBeenCalledTimes(
      mediaMocks.createObjectURL.mock.calls.length
    );
    container.remove();
  });

  it("invalidates ended callbacks when the current file is rebound or unbound", async () => {
    const firstFile = new File(["first test file"], "sample-one.mp3", {
      type: "audio/mpeg"
    });
    const secondFile = new File(["second test file"], "sample-two.ogg", {
      type: "audio/ogg"
    });
    const replacementFile = new File(["replacement test file"], "sample-one.mp3", {
      type: "audio/mpeg"
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
        "2026-07-15T00:00:01.000Z"
      )
    ]);
    const mediaMocks = installAudioElementMocks();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(App, { localAudioRepository: repository }));
    });

    const endedListeners = monitorAudioEndedListeners();
    const playerTitle = () =>
      container.querySelector(".player-now-playing strong")?.textContent;

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".add-album-button")?.click();
    });
    await act(async () => {
      findButton(container, "播放")?.click();
    });

    expect(endedListeners).toHaveLength(1);
    const initialSourceEnded = endedListeners[0];

    await selectCatalogTrackAudioFile(container, "示例歌曲一", replacementFile);

    expect(initialSourceEnded.removed).toBe(true);
    expect(endedListeners).toHaveLength(2);
    expect(mediaMocks.createObjectURL).toHaveBeenLastCalledWith(replacementFile);
    const replacementSourceEnded = endedListeners[1];
    expect(replacementSourceEnded.audio).not.toBe(initialSourceEnded.audio);

    await act(async () => {
      initialSourceEnded.audio.dispatchEvent(new Event("ended"));
      invokeEndedListener(initialSourceEnded);
    });

    expect(playerTitle()).toBe("示例歌曲一");
    expect(container.querySelector(".player-status")?.textContent).toContain(
      "正在播放"
    );

    await selectCatalogTrackAudioFile(container, "示例歌曲一", replacementFile);

    expect(replacementSourceEnded.removed).toBe(true);
    expect(endedListeners).toHaveLength(3);
    const sameFileReplacementSourceEnded = endedListeners[2];
    expect(sameFileReplacementSourceEnded.audio).not.toBe(replacementSourceEnded.audio);
    expect(mediaMocks.createObjectURL).toHaveBeenLastCalledWith(replacementFile);

    await act(async () => {
      replacementSourceEnded.audio.dispatchEvent(new Event("ended"));
      invokeEndedListener(replacementSourceEnded);
    });

    expect(playerTitle()).toBe("示例歌曲一");

    await chooseTrackMenuAction(
      container,
      "示例歌曲一",
      "解除示例歌曲一的本地音频绑定"
    );

    expect(sameFileReplacementSourceEnded.removed).toBe(true);
    expect(container.querySelector(".player-audio-binding")?.textContent).toBe(
      "未绑定音频文件"
    );

    await act(async () => {
      invokeEndedListener(sameFileReplacementSourceEnded);
    });

    expect(playerTitle()).toBe("示例歌曲一");
    expect(container.querySelector(".player-status")?.textContent).toContain(
      "未绑定音频文件"
    );

    await selectCatalogTrackAudioFile(container, "示例歌曲一", replacementFile);

    expect(endedListeners).toHaveLength(4);
    const reboundSourceEnded = endedListeners[3];
    expect(reboundSourceEnded.audio).not.toBe(sameFileReplacementSourceEnded.audio);

    await act(async () => {
      findButton(container, "播放")?.click();
      invokeEndedListener(initialSourceEnded);
      invokeEndedListener(replacementSourceEnded);
      invokeEndedListener(sameFileReplacementSourceEnded);
    });

    expect(playerTitle()).toBe("示例歌曲一");
    expect(container.querySelector(".player-status")?.textContent).toContain(
      "正在播放"
    );

    await act(async () => {
      reboundSourceEnded.audio.dispatchEvent(new Event("ended"));
      invokeEndedListener(reboundSourceEnded);
    });

    expect(playerTitle()).toBe("示例歌曲二");
    expect(reboundSourceEnded.removed).toBe(true);
    expect(endedListeners).toHaveLength(5);
    const secondTrackSourceEnded = endedListeners[4];

    expect(container.querySelector(".player-status")?.textContent).toContain(
      "正在播放"
    );

    await act(async () => {
      root.unmount();
    });
    expect(secondTrackSourceEnded.removed).toBe(true);
    expect(() => invokeEndedListener(secondTrackSourceEnded)).not.toThrow();
    expect(mediaMocks.revokeObjectURL).toHaveBeenCalledTimes(
      mediaMocks.createObjectURL.mock.calls.length
    );
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
