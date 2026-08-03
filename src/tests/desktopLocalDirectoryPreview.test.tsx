import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  DesktopLocalAudioBindingSummary,
  DesktopLocalAudioBindingApi,
  DesktopMusicDirectoryScanPreviewResult,
  DesktopMusicDirectorySummary
} from "../../electron/music-library/types";
import { mockCatalog } from "../data/catalog/mockCatalog";
import { DesktopLocalDirectoryPreview } from "../features/local-library/DesktopLocalDirectoryPreview";
import type { DesktopDirectoryScanApi } from "../features/local-library/desktopDirectoryScanApi";

const DIRECTORY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const containers: HTMLElement[] = [];

afterEach(() => {
  containers.splice(0).forEach((container) => container.remove());
  vi.restoreAllMocks();
});

function createScanResult(
  fileName = "sample.mp3"
): DesktopMusicDirectoryScanPreviewResult {
  const candidateId = fileName.startsWith("second")
    ? "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    : "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  return {
    scannedAt: "2026-08-02T00:00:00.000Z",
    totalFileCount: 1,
    supportedFileCount: 1,
    ignoredFileCount: 0,
    errorCount: 0,
    candidates: [
      {
        candidateId:
          candidateId as DesktopMusicDirectoryScanPreviewResult["candidates"][number]["candidateId"],
        fileName,
        fileExtension: "mp3",
        fileSize: 2048,
        modifiedAt: 1_765_000_000_000,
        albumTitle: "Sample Album",
        artistName: "Sample Artist",
        trackTitle: "Sample Track",
        parseStatus: "parsed",
        issues: []
      }
    ],
    errors: []
  };
}

function createApi(
  overrides: Partial<DesktopDirectoryScanApi> = {}
): DesktopDirectoryScanApi {
  return {
    listDirectories: vi.fn(async () => [
      {
        directoryId: DIRECTORY_ID,
        displayName: "测试音乐库",
        selectedAt: "2026-08-02T00:00:00.000Z",
        availability: "available" as const
      }
    ]),
    selectDirectory: vi.fn(async () => null),
    scanDirectory: vi.fn(async () => createScanResult()),
    bindings: createBindingApi(),
    ...overrides
  };
}

function createBindingApi(
  overrides: Partial<DesktopLocalAudioBindingApi> = {}
): DesktopLocalAudioBindingApi {
  return {
    list: vi.fn(async () => []),
    findByBindingId: vi.fn(async () => undefined),
    findByTrackId: vi.fn(async () => undefined),
    bindCandidateToTrack: vi.fn(async () => createBindingSummary()),
    unbindTrack: vi.fn(async () => createBindingSummary()),
    ...overrides
  };
}

function createBindingSummary(
  overrides: Partial<DesktopLocalAudioBindingSummary> = {}
): DesktopLocalAudioBindingSummary {
  return {
    bindingId:
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc" as DesktopLocalAudioBindingSummary["bindingId"],
    trackId: mockCatalog.tracks[0]!.id as DesktopLocalAudioBindingSummary["trackId"],
    fileName: "sample.mp3",
    fileSize: 2048,
    modifiedAt: 1_765_000_000_000,
    availability: "unknown",
    createdAt: "2026-08-02T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
    ...overrides
  };
}

async function renderPreview(api: DesktopDirectoryScanApi, readyText = "测试音乐库") {
  const container = document.createElement("div");
  containers.push(container);
  document.body.append(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      createElement(DesktopLocalDirectoryPreview, {
        api,
        catalog: mockCatalog,
        catalogStatus: "ready"
      })
    );
  });
  await waitForText(container, readyText);
  await waitForEnabledButton(container, "刷新目录");

  return { container, root };
}

async function waitForText(container: HTMLElement, text: string) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (container.textContent?.includes(text)) {
      return;
    }

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  throw new Error(`Timed out waiting for text: ${text}`);
}

async function waitForEnabledButton(container: HTMLElement, text: string) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const button = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.trim() === text
    );
    if (button && !button.disabled) {
      return;
    }

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  throw new Error(`Timed out waiting for enabled button: ${text}`);
}

function findButton(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === text
  );

  if (!button) {
    throw new Error(`Missing button: ${text}`);
  }

  return button;
}

async function scanPreview(container: HTMLElement) {
  await act(async () => {
    findButton(container, "扫描所选目录").click();
  });
  await waitForText(container, "sample.mp3");
}

async function chooseTrack(container: HTMLElement, title: string) {
  const option = Array.from(
    container.querySelectorAll<HTMLLabelElement>(".desktop-track-search-option")
  ).find((label) => label.textContent?.includes(title));
  const radio = option?.querySelector<HTMLInputElement>('input[type="radio"]');

  if (!radio) {
    throw new Error(`Missing track option: ${title}`);
  }

  await act(async () => radio.click());
}

async function setSearchQuery(container: HTMLElement, value: string) {
  const input = container.querySelector<HTMLInputElement>(
    'input[placeholder="输入曲名、歌手或专辑"]'
  );

  if (!input) {
    throw new Error("Missing desktop track search input.");
  }

  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;

  await act(async () => {
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("DesktopLocalDirectoryPreview", () => {
  it("shows loading and unavailable-directory states without attempting a scan", async () => {
    let resolveDirectories!: (value: readonly DesktopMusicDirectorySummary[]) => void;
    const directoriesPromise = new Promise<readonly DesktopMusicDirectorySummary[]>(
      (resolve) => {
        resolveDirectories = resolve;
      }
    );
    const api = createApi({
      listDirectories: vi.fn(() => directoriesPromise)
    });
    const container = document.createElement("div");
    containers.push(container);
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(DesktopLocalDirectoryPreview, {
          api,
          catalog: mockCatalog,
          catalogStatus: "ready"
        })
      );
    });
    expect(container.textContent).toContain("正在读取已授权目录");

    resolveDirectories([
      {
        directoryId: DIRECTORY_ID,
        displayName: "测试音乐库",
        selectedAt: "2026-08-02T00:00:00.000Z",
        availability: "missing"
      }
    ]);
    await waitForText(container, "所选目录当前已丢失");

    expect(findButton(container, "扫描所选目录").disabled).toBe(true);
    expect(api.scanDirectory).not.toHaveBeenCalled();

    await act(async () => root.unmount());
  });

  it("adds a newly selected authorized directory without retaining its display path", async () => {
    const api = createApi({
      listDirectories: vi.fn(async () => []),
      selectDirectory: vi.fn(async () => ({
        directoryId: DIRECTORY_ID,
        displayName: "新音乐库",
        selectedAt: "2026-08-02T00:00:00.000Z",
        availability: "available" as const
      }))
    });
    const { container, root } = await renderPreview(api, "暂无已授权目录");

    await act(async () => {
      findButton(container, "选择音乐目录").click();
    });
    await waitForText(container, "新音乐库");

    expect(api.selectDirectory).toHaveBeenCalledTimes(1);
    expect(findButton(container, "扫描所选目录").disabled).toBe(false);

    await act(async () => root.unmount());
  });

  it("lists safe directory labels and renders scanned candidate metadata", async () => {
    const api = createApi();
    const { container, root } = await renderPreview(api);

    expect(container.textContent).toContain("测试音乐库");

    await act(async () => {
      findButton(container, "扫描所选目录").click();
    });
    await waitForText(container, "sample.mp3");

    expect(api.scanDirectory).toHaveBeenCalledWith({ directoryId: DIRECTORY_ID });
    expect(container.textContent).toContain("sample.mp3");
    expect(container.textContent).not.toContain("album/sample.mp3");
    expect(container.textContent).toContain("2.0 KB");
    expect(container.textContent).toContain("Sample Track");
    expect(container.textContent).toContain("Sample Album");
    expect(container.textContent).toContain("Sample Artist");
    expect(container.textContent).toContain("已解析");

    await act(async () => root.unmount());
  });

  it("replaces the current preview when the same directory is scanned again", async () => {
    const scanDirectory = vi
      .fn()
      .mockResolvedValueOnce(createScanResult("first.mp3"))
      .mockResolvedValueOnce(createScanResult("second.mp3"));
    const { container, root } = await renderPreview(createApi({ scanDirectory }));

    await act(async () => {
      findButton(container, "扫描所选目录").click();
    });
    await waitForText(container, "first.mp3");
    expect(container.textContent).toContain("first.mp3");

    await act(async () => {
      findButton(container, "扫描所选目录").click();
    });
    await waitForText(container, "second.mp3");
    expect(container.textContent).not.toContain("first.mp3");
    expect(container.textContent).toContain("second.mp3");

    await act(async () => root.unmount());
  });

  it("shows empty and sanitized scan error states", async () => {
    const scanDirectory = vi
      .fn()
      .mockResolvedValueOnce({
        ...createScanResult(),
        totalFileCount: 0,
        supportedFileCount: 0,
        candidates: []
      })
      .mockRejectedValueOnce(
        new Error("[directory_missing] C:\\private\\music disappeared")
      );
    const { container, root } = await renderPreview(createApi({ scanDirectory }));

    await act(async () => {
      findButton(container, "扫描所选目录").click();
    });
    await waitForText(container, "没有可预览的受支持音频文件");
    expect(container.textContent).toContain("没有可预览的受支持音频文件");

    await act(async () => {
      findButton(container, "扫描所选目录").click();
    });
    await waitForText(container, "所选音乐目录已失效");
    expect(container.textContent).toContain("所选音乐目录已失效");
    expect(container.textContent).not.toContain("C:\\private\\music");

    await act(async () => root.unmount());
  });

  it("searches the catalog and creates a new binding without rescanning", async () => {
    let summaries: readonly DesktopLocalAudioBindingSummary[] = [];
    const savedBinding = createBindingSummary();
    const bindCandidateToTrack = vi.fn(async () => {
      summaries = [savedBinding];
      return savedBinding;
    });
    const api = createApi({
      bindings: createBindingApi({
        list: vi.fn(async () => summaries),
        bindCandidateToTrack
      })
    });
    const { container, root } = await renderPreview(api);
    const targetTrack = mockCatalog.tracks[0]!;
    const targetArtist = mockCatalog.artists.find(
      (artist) => artist.id === targetTrack.artistId
    )!;

    await scanPreview(container);
    const bindingTrigger = findButton(container, "绑定曲目");
    await act(async () => bindingTrigger.click());
    await waitForText(container, "选择绑定曲目");

    const searchInput = container.querySelector<HTMLInputElement>(
      'input[placeholder="输入曲名、歌手或专辑"]'
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.activeElement).toBe(searchInput);

    await setSearchQuery(container, "不存在的曲目");
    expect(container.textContent).toContain("没有找到匹配的现有曲目");
    expect(findButton(container, "确认绑定").disabled).toBe(true);

    await setSearchQuery(container, targetArtist.name);
    expect(container.textContent).toContain(targetTrack.title);
    await chooseTrack(container, targetTrack.title);
    await act(async () => findButton(container, "确认绑定").click());
    await waitForText(container, `已绑定到《${targetTrack.title}》`);

    expect(bindCandidateToTrack).toHaveBeenCalledTimes(1);
    expect(bindCandidateToTrack).toHaveBeenCalledWith({
      candidateId: createScanResult().candidates[0]!.candidateId,
      trackId: targetTrack.id
    });
    expect(api.scanDirectory).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain(`已绑定：${targetTrack.title}`);
    expect(container.textContent).not.toContain(savedBinding.bindingId);
    expect(container.textContent).not.toContain(
      createScanResult().candidates[0]!.candidateId
    );

    await act(async () => root.unmount());
  });

  it("requires a second confirmation before replacing a target binding", async () => {
    const targetTrack = mockCatalog.tracks[0]!;
    const existingBinding = createBindingSummary({
      fileName: "existing.mp3",
      fileSize: 1024,
      modifiedAt: 1_700_000_000_000
    });
    const savedBinding = createBindingSummary({
      bindingId:
        "dddddddd-dddd-4ddd-8ddd-dddddddddddd" as DesktopLocalAudioBindingSummary["bindingId"]
    });
    let summaries: readonly DesktopLocalAudioBindingSummary[] = [existingBinding];
    const bindCandidateToTrack = vi.fn(async () => {
      summaries = [savedBinding];
      return savedBinding;
    });
    const api = createApi({
      bindings: createBindingApi({
        list: vi.fn(async () => summaries),
        bindCandidateToTrack
      })
    });
    const { container, root } = await renderPreview(api);

    await scanPreview(container);
    await act(async () => findButton(container, "绑定曲目").click());
    await chooseTrack(container, targetTrack.title);
    await act(async () => findButton(container, "替换绑定…").click());
    await waitForText(container, "确认替换绑定");

    expect(bindCandidateToTrack).not.toHaveBeenCalled();
    await act(async () => findButton(container, "取消替换").click());
    expect(bindCandidateToTrack).not.toHaveBeenCalled();
    expect(container.textContent).toContain("选择绑定曲目");

    await act(async () => findButton(container, "替换绑定…").click());
    await act(async () => findButton(container, "确认替换绑定").click());
    await waitForText(container, `已绑定到《${targetTrack.title}》`);

    expect(bindCandidateToTrack).toHaveBeenCalledWith({
      candidateId: createScanResult().candidates[0]!.candidateId,
      trackId: targetTrack.id,
      expectedExistingBindingId: existingBinding.bindingId
    });

    await act(async () => root.unmount());
  });

  it("cancels and confirms unbinding with the expected binding ID and focus restore", async () => {
    const currentBinding = createBindingSummary();
    let summaries: readonly DesktopLocalAudioBindingSummary[] = [currentBinding];
    const unbindTrack = vi.fn(async () => {
      summaries = [];
      return currentBinding;
    });
    const api = createApi({
      bindings: createBindingApi({
        list: vi.fn(async () => summaries),
        unbindTrack
      })
    });
    const { container, root } = await renderPreview(api);

    await scanPreview(container);
    await waitForText(container, "已绑定：");
    const unbindTrigger = findButton(container, "解除绑定");
    await act(async () => unbindTrigger.click());
    await waitForText(container, "不会删除磁盘文件、歌曲、专辑或歌单");

    await act(async () => findButton(container, "取消解绑").click());
    expect(unbindTrack).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(unbindTrigger);

    await act(async () => findButton(container, "解除绑定").click());
    await act(async () => findButton(container, "确认解除绑定").click());
    await waitForText(container, "已解除绑定");

    expect(unbindTrack).toHaveBeenCalledWith({
      trackId: currentBinding.trackId,
      expectedBindingId: currentBinding.bindingId
    });
    expect(container.textContent).toContain("绑定曲目");

    await act(async () => root.unmount());
  });

  it("changes a bound candidate by binding the new track before expected-ID unbinding", async () => {
    const currentBinding = createBindingSummary();
    const nextTrack = mockCatalog.tracks[1]!;
    const nextBinding = createBindingSummary({
      bindingId:
        "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" as DesktopLocalAudioBindingSummary["bindingId"],
      trackId: nextTrack.id as DesktopLocalAudioBindingSummary["trackId"]
    });
    let summaries: readonly DesktopLocalAudioBindingSummary[] = [currentBinding];
    const bindCandidateToTrack = vi.fn(async () => {
      summaries = [currentBinding, nextBinding];
      return nextBinding;
    });
    const unbindTrack = vi.fn(async () => {
      summaries = [nextBinding];
      return currentBinding;
    });
    const api = createApi({
      bindings: createBindingApi({
        list: vi.fn(async () => summaries),
        bindCandidateToTrack,
        unbindTrack
      })
    });
    const { container, root } = await renderPreview(api);

    await scanPreview(container);
    await waitForText(container, "已绑定：");
    await act(async () => findButton(container, "更换曲目").click());
    await chooseTrack(container, nextTrack.title);
    await act(async () => findButton(container, "确认绑定").click());
    await waitForText(container, `已绑定到《${nextTrack.title}》`);

    expect(bindCandidateToTrack).toHaveBeenCalledWith({
      candidateId: createScanResult().candidates[0]!.candidateId,
      trackId: nextTrack.id
    });
    expect(unbindTrack).toHaveBeenCalledWith({
      trackId: currentBinding.trackId,
      expectedBindingId: currentBinding.bindingId
    });
    expect(bindCandidateToTrack.mock.invocationCallOrder[0]).toBeLessThan(
      unbindTrack.mock.invocationCallOrder[0]!
    );
    expect(container.textContent).toContain(`已绑定：${nextTrack.title}`);

    await act(async () => root.unmount());
  });

  it("refreshes state and shows the required safe message after a binding conflict", async () => {
    const existingBinding = createBindingSummary({
      fileName: "existing.mp3",
      fileSize: 1024,
      modifiedAt: 1_700_000_000_000
    });
    const list = vi.fn(async () => [existingBinding]);
    const bindCandidateToTrack = vi.fn(async () => {
      throw new Error(
        "[binding_conflict] C:\\Users\\private\\local-audio-bindings.json"
      );
    });
    const api = createApi({
      bindings: createBindingApi({ list, bindCandidateToTrack })
    });
    const { container, root } = await renderPreview(api);

    await scanPreview(container);
    await act(async () => findButton(container, "绑定曲目").click());
    await chooseTrack(container, mockCatalog.tracks[0]!.title);
    await act(async () => findButton(container, "替换绑定…").click());
    await act(async () => findButton(container, "确认替换绑定").click());
    await waitForText(container, "绑定状态已经发生变化，请重新确认");

    expect(list.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(container.textContent).not.toContain("C:\\Users\\private");
    expect(container.querySelector(".desktop-binding-dialog")).toBeNull();

    await act(async () => root.unmount());
  });

  it("keeps a newer binding when a stale unbind request conflicts", async () => {
    const currentBinding = createBindingSummary();
    const newerBinding = createBindingSummary({
      bindingId:
        "ffffffff-ffff-4fff-8fff-ffffffffffff" as DesktopLocalAudioBindingSummary["bindingId"]
    });
    let listCount = 0;
    const list = vi.fn(async () => {
      listCount += 1;
      return listCount === 1 ? [currentBinding] : [newerBinding];
    });
    const unbindTrack = vi.fn(async () => {
      throw new Error("[binding_conflict] stale binding");
    });
    const api = createApi({
      bindings: createBindingApi({ list, unbindTrack })
    });
    const { container, root } = await renderPreview(api);

    await scanPreview(container);
    await waitForText(container, "已绑定：");
    await act(async () => findButton(container, "解除绑定").click());
    await act(async () => findButton(container, "确认解除绑定").click());
    await waitForText(container, "绑定状态已经发生变化，请重新确认");

    expect(unbindTrack).toHaveBeenCalledWith({
      trackId: currentBinding.trackId,
      expectedBindingId: currentBinding.bindingId
    });
    expect(container.textContent).toContain("已绑定：");

    await act(async () => root.unmount());
  });

  it("does not submit a dialog from an invalidated scan generation", async () => {
    const scanDirectory = vi
      .fn()
      .mockResolvedValueOnce(createScanResult("sample.mp3"))
      .mockResolvedValueOnce(createScanResult("second.mp3"));
    const bindCandidateToTrack = vi.fn(async () => createBindingSummary());
    const api = createApi({
      scanDirectory,
      bindings: createBindingApi({ bindCandidateToTrack })
    });
    const { container, root } = await renderPreview(api);

    await scanPreview(container);
    await act(async () => findButton(container, "绑定曲目").click());
    await chooseTrack(container, mockCatalog.tracks[0]!.title);
    const staleConfirmButton = findButton(container, "确认绑定");

    await act(async () => findButton(container, "扫描所选目录").click());
    await waitForText(container, "second.mp3");
    await act(async () => staleConfirmButton.click());

    expect(bindCandidateToTrack).not.toHaveBeenCalled();
    expect(container.querySelector(".desktop-binding-dialog")).toBeNull();
    expect(container.textContent).not.toContain("sample.mp3");

    await act(async () => root.unmount());
  });

  it("blocks duplicate submissions and sanitizes an expired candidate error", async () => {
    let rejectBinding!: (error: Error) => void;
    const pendingBinding = new Promise<DesktopLocalAudioBindingSummary>((_, reject) => {
      rejectBinding = reject;
    });
    const bindCandidateToTrack = vi.fn(() => pendingBinding);
    const api = createApi({
      bindings: createBindingApi({ bindCandidateToTrack })
    });
    const { container, root } = await renderPreview(api);

    await scanPreview(container);
    await act(async () => findButton(container, "绑定曲目").click());
    await chooseTrack(container, mockCatalog.tracks[0]!.title);
    const confirmButton = findButton(container, "确认绑定");

    await act(async () => {
      confirmButton.click();
      confirmButton.click();
    });
    expect(bindCandidateToTrack).toHaveBeenCalledTimes(1);

    rejectBinding(
      new Error("[candidate_unavailable] C:\\private\\song.mp3 internal stack")
    );
    await waitForText(container, "这个扫描候选已经失效");
    expect(container.textContent).not.toContain("C:\\private");
    expect(container.textContent).not.toContain("internal stack");
    expect(container.textContent).toContain("sample.mp3");

    await act(async () => root.unmount());
  });
});
