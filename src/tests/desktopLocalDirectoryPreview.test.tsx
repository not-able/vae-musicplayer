import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  DesktopMusicDirectoryScanResult,
  SelectedMusicDirectory
} from "../../electron/music-library/types";
import { DesktopLocalDirectoryPreview } from "../features/local-library/DesktopLocalDirectoryPreview";
import type { DesktopDirectoryScanApi } from "../features/local-library/desktopDirectoryScanApi";

const DIRECTORY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const containers: HTMLElement[] = [];

afterEach(() => {
  containers.splice(0).forEach((container) => container.remove());
  vi.restoreAllMocks();
});

function createScanResult(fileName = "sample.mp3"): DesktopMusicDirectoryScanResult {
  const relativePath = `album/${fileName}`;
  return {
    directoryId: DIRECTORY_ID,
    scannedAt: "2026-08-02T00:00:00.000Z",
    totalFileCount: 1,
    supportedFileCount: 1,
    ignoredFileCount: 0,
    errorCount: 0,
    candidates: [
      {
        sourceRef: { directoryId: DIRECTORY_ID, relativePath },
        fileName,
        relativePath,
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
        displayPath: "C:\\private\\music",
        selectedAt: "2026-08-02T00:00:00.000Z",
        availability: "available" as const
      }
    ]),
    selectDirectory: vi.fn(async () => null),
    scanDirectory: vi.fn(async () => createScanResult()),
    ...overrides
  };
}

async function renderPreview(api: DesktopDirectoryScanApi, readyText = "测试音乐库") {
  const container = document.createElement("div");
  containers.push(container);
  document.body.append(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(createElement(DesktopLocalDirectoryPreview, { api }));
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

describe("DesktopLocalDirectoryPreview", () => {
  it("shows loading and unavailable-directory states without attempting a scan", async () => {
    let resolveDirectories!: (value: readonly SelectedMusicDirectory[]) => void;
    const directoriesPromise = new Promise<readonly SelectedMusicDirectory[]>(
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
      root.render(createElement(DesktopLocalDirectoryPreview, { api }));
    });
    expect(container.textContent).toContain("正在读取已授权目录");

    resolveDirectories([
      {
        directoryId: DIRECTORY_ID,
        displayName: "测试音乐库",
        displayPath: "C:\\private\\music",
        selectedAt: "2026-08-02T00:00:00.000Z",
        availability: "missing"
      }
    ]);
    await waitForText(container, "所选目录当前已丢失");

    expect(findButton(container, "扫描所选目录").disabled).toBe(true);
    expect(api.scanDirectory).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("C:\\private\\music");

    await act(async () => root.unmount());
  });

  it("adds a newly selected authorized directory without retaining its display path", async () => {
    const api = createApi({
      listDirectories: vi.fn(async () => []),
      selectDirectory: vi.fn(async () => ({
        directoryId: DIRECTORY_ID,
        displayName: "新音乐库",
        displayPath: "C:\\private\\new-music",
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
    expect(container.textContent).not.toContain("C:\\private\\new-music");
    expect(findButton(container, "扫描所选目录").disabled).toBe(false);

    await act(async () => root.unmount());
  });

  it("lists safe directory labels and renders scanned candidate metadata", async () => {
    const api = createApi();
    const { container, root } = await renderPreview(api);

    expect(container.textContent).toContain("测试音乐库");
    expect(container.textContent).not.toContain("C:\\private\\music");

    await act(async () => {
      findButton(container, "扫描所选目录").click();
    });
    await waitForText(container, "sample.mp3");

    expect(api.scanDirectory).toHaveBeenCalledWith({ directoryId: DIRECTORY_ID });
    expect(container.textContent).toContain("sample.mp3");
    expect(container.textContent).toContain("album/sample.mp3");
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
});
