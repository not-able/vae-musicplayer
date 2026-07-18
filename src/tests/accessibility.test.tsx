import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { PageShell } from "../components/PageShell";
import { PlayerBar } from "../features/player/PlayerBar";
import { createPlayerState } from "../features/player/playerReducer";

describe("keyboard and player status accessibility", () => {
  it("provides a skip link for the application main content", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(
          PageShell,
          undefined,
          createElement("main", { id: "main-content" }, "主要内容")
        )
      );
    });

    const skipLink = container.querySelector<HTMLAnchorElement>(".skip-link");

    expect(skipLink?.textContent).toBe("跳到主要内容");
    expect(skipLink?.getAttribute("href")).toBe("#main-content");

    await act(async () => root.unmount());
    container.remove();
  });

  it("describes a permission-required handle as unavailable for playback", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const state = createPlayerState([
      {
        queueItemId: "queue_item_001",
        trackId: "track_001",
        repeatIndex: 1,
        repeatTotal: 1
      }
    ]);

    await act(async () => {
      root.render(
        createElement(PlayerBar, {
          state,
          tracks: [
            {
              id: "track_001",
              artistId: "artist_001",
              albumId: "album_001",
              title: "测试歌曲"
            }
          ],
          currentAudioFileName: "测试歌曲.flac",
          currentAudioBindingStatus: "permission_required",
          isCurrentAudioBound: true,
          canPlayTarget: false,
          audioLibraryStatus: "ready",
          playerSettings: { volume: 1, muted: false },
          playerSettingsStatus: "ready",
          playbackProgress: { currentTimeSeconds: 0 },
          onPlay: vi.fn(),
          onPause: vi.fn(),
          onNext: vi.fn(),
          onPrevious: vi.fn(),
          onRestart: vi.fn(),
          onSeek: vi.fn(),
          onVolumeChange: vi.fn(),
          onToggleMuted: vi.fn()
        })
      );
    });

    expect(container.querySelector(".player-audio-binding")?.textContent).toBe(
      "需要重新授权：测试歌曲.flac"
    );
    expect(
      container.querySelector<HTMLButtonElement>('button[aria-label="播放"]')?.disabled
    ).toBe(true);

    await act(async () => root.unmount());
    container.remove();
  });
});
