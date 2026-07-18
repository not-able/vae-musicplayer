import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { mockCatalog } from "../data/catalog/mockCatalog";
import { CatalogImportPanel } from "../features/catalog/CatalogImportPanel";
import type { CatalogProviderAlbumCandidate } from "../features/catalog/catalogProvider";
import type {
  CatalogDirectoryImportAlbumDraft,
  CatalogDirectoryImportOptions,
  CatalogDirectoryImportResult
} from "../features/catalog/useCatalogLibrary";
import type { QqMusicCatalogProvider } from "../infra/catalog/qqMusicCatalogProvider";

type ImportHandler = (
  drafts: readonly CatalogDirectoryImportAlbumDraft[],
  options?: CatalogDirectoryImportOptions
) => Promise<CatalogDirectoryImportResult>;

const artist = {
  kind: "artist" as const,
  reference: {
    providerId: "qq-music-api",
    entityType: "artist" as const,
    externalId: "artist-remote-1"
  },
  name: mockCatalog.artists[0]?.name ?? "许嵩"
};

const albumCandidate: CatalogProviderAlbumCandidate = {
  kind: "album",
  reference: {
    providerId: "qq-music-api",
    entityType: "album",
    externalId: "album-remote-1"
  },
  title: "Remote Album",
  artist,
  type: "album"
};

const albumDetails: CatalogProviderAlbumCandidate = {
  ...albumCandidate,
  tracks: [
    {
      kind: "track",
      reference: {
        providerId: "qq-music-api",
        entityType: "track",
        externalId: "track-remote-1"
      },
      title: "Remote Song",
      artist,
      trackNumber: 1,
      durationSeconds: 180
    }
  ]
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("self-hosted metadata import panel", () => {
  it("does not create or call a Provider before the user explicitly acts", async () => {
    const provider = createProvider();
    const providerFactory = vi.fn(() => provider);
    const onImport = vi.fn<ImportHandler>();
    const { container, root } = await renderPanel(providerFactory, onImport);

    expect(providerFactory).not.toHaveBeenCalled();
    expect(provider.testConnection).not.toHaveBeenCalled();
    expect(provider.search).not.toHaveBeenCalled();
    expect(onImport).not.toHaveBeenCalled();

    await cleanup(container, root);
  });

  it("previews normalized candidates without writing, then confirms one atomic catalog import", async () => {
    const provider = createProvider({
      search: vi.fn(async () => ({ candidates: [albumCandidate] })),
      getAlbum: vi.fn(async () => albumDetails)
    });
    const providerFactory = vi.fn(() => provider);
    const onImport = vi.fn<ImportHandler>(async () => ({
      ok: true as const,
      trackIdsBySourceId: new Map([
        ["provider-track:track-remote-1", "track_local_new"]
      ])
    }));
    const { container, root } = await renderPanel(providerFactory, onImport);

    await act(async () => {
      findButton(container, "测试连接").click();
    });
    expect(provider.testConnection).toHaveBeenCalledOnce();

    await act(async () => {
      findButton(container, "查询专辑").click();
    });
    expect(provider.search).toHaveBeenCalledWith({ query: "许嵩", limit: 20 });

    await act(async () => {
      findButton(container, "查看曲目").click();
    });
    expect(provider.getAlbum).toHaveBeenCalledWith(albumCandidate.reference);
    expect(container.textContent).toContain("导入预览");
    expect(onImport).not.toHaveBeenCalled();

    await act(async () => {
      findButton(container, "确认导入 1 首歌曲").click();
    });

    expect(onImport).toHaveBeenCalledOnce();
    expect(onImport.mock.calls[0]?.[0]).toEqual([
      {
        sourceId: "provider-album:album-remote-1",
        artistId: mockCatalog.artists[0]?.id,
        title: "Remote Album",
        tracks: [
          {
            sourceId: "provider-track:track-remote-1",
            title: "Remote Song",
            trackNumber: 1
          }
        ]
      }
    ]);
    expect(onImport.mock.calls[0]?.[1]).toEqual({
      providerReferences: [
        { localEntityId: mockCatalog.artists[0]?.id, reference: artist.reference },
        {
          sourceId: "provider-album:album-remote-1",
          reference: albumCandidate.reference
        },
        {
          sourceId: "provider-track:track-remote-1",
          reference: albumDetails.tracks?.[0]?.reference
        }
      ]
    });
    expect(container.textContent).toContain("已新增《Remote Album》");

    await cleanup(container, root);
  });
});

function createProvider(
  overrides: Partial<QqMusicCatalogProvider> = {}
): QqMusicCatalogProvider {
  return {
    descriptor: {
      id: "qq-music-api",
      displayName: "Test provider",
      capabilities: { search: true, albumDetails: true, trackDetails: true }
    },
    testConnection: vi.fn(async () => undefined),
    search: vi.fn(async () => ({ candidates: [] })),
    getArtistAlbums: vi.fn(async () => []),
    getAlbum: vi.fn(async () => albumDetails),
    getTrack: vi.fn(
      async () =>
        albumDetails.tracks?.[0] as NonNullable<typeof albumDetails.tracks>[number]
    ),
    ...overrides
  };
}

async function renderPanel(
  providerFactory: (baseUrl: string) => QqMusicCatalogProvider,
  onImport: ImportHandler
): Promise<{ container: HTMLElement; root: ReturnType<typeof createRoot> }> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      createElement(CatalogImportPanel, {
        catalog: mockCatalog,
        catalogStatus: "ready",
        isCatalogSaving: false,
        initialBaseUrl: "https://metadata.example.test",
        providerFactory,
        onImport
      })
    );
  });

  return { container, root };
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

async function cleanup(
  container: HTMLElement,
  root: ReturnType<typeof createRoot>
): Promise<void> {
  await act(async () => root.unmount());
  container.remove();
}
