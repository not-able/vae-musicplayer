import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { mockCatalog } from "../data/catalog/mockCatalog";
import { XuSongCatalogImport } from "../features/catalog/VerifiedXuSongCatalogImport";
import type { CatalogDirectoryImportAlbumDraft } from "../features/catalog/useCatalogLibrary";

function findButton(
  container: HTMLElement,
  text: string
): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => button.textContent?.trim() === text
  );
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("verified Xu Song catalog import", () => {
  it("writes no catalog data before confirmation and submits the complete draft once", async () => {
    const onImport = vi.fn(
      async (drafts: readonly CatalogDirectoryImportAlbumDraft[]) => {
        void drafts;
        return {
          ok: true as const,
          trackIdsBySourceId: new Map<string, string>()
        };
      }
    );
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(XuSongCatalogImport, {
          catalog: mockCatalog,
          catalogStatus: "ready",
          isCatalogSaving: false,
          onImport
        })
      );
    });

    expect(onImport).not.toHaveBeenCalled();

    await act(async () => {
      findButton(container, "预览待导入目录")?.click();
    });

    expect(onImport).not.toHaveBeenCalled();
    expect(container.textContent).toContain("自定义");
    expect(container.textContent).toContain("安泊猜想");

    await act(async () => {
      findButton(container, "确认新增 14 张专辑")?.click();
    });

    expect(onImport).toHaveBeenCalledOnce();
    expect(onImport.mock.calls[0]?.[0]).toHaveLength(14);
    expect(
      onImport.mock.calls[0]?.[0].reduce(
        (total, draft) => total + draft.tracks.length,
        0
      )
    ).toBe(162);
    expect(container.textContent).toContain("已新增 14 张专辑和 162 首歌曲。");

    await act(async () => {
      root.unmount();
    });
  });
});
