import { describe, expect, it } from "vitest";

import {
  copyPlaylistToSaved,
  createPlaylistLibrary,
  deleteSavedPlaylist,
  getSelectedPlaylist,
  isPlaylistSelectionAvailable,
  renameSavedPlaylist,
  selectPlaylist
} from "../features/playlist/playlistLibrary";
import type { TemporaryPlaylist } from "../types";
import {
  addTrackToPlaylist,
  createTemporaryPlaylist,
  updatePlaylistItemRepeatCount
} from "../utils/playlist";

const createdAt = "2026-07-18T00:00:00.000Z";
const updatedAt = "2026-07-18T00:01:00.000Z";

function createCurrentPlaylist(): TemporaryPlaylist {
  return addTrackToPlaylist(
    createTemporaryPlaylist({
      id: "playlist_temporary",
      createdAt
    }),
    {
      itemId: "queue_item_001",
      trackId: "track_001",
      addedAt: updatedAt
    }
  );
}

describe("playlist library rules", () => {
  it("copies the current document into an independently editable named playlist", () => {
    const currentPlaylist = updatePlaylistItemRepeatCount(
      createCurrentPlaylist(),
      "queue_item_001",
      3,
      updatedAt
    );
    currentPlaylist.itemsById.queue_item_001.playedCount = 2;
    const library = copyPlaylistToSaved(
      createPlaylistLibrary({ temporaryPlaylist: currentPlaylist }),
      {
        sourcePlaylist: currentPlaylist,
        savedPlaylistId: "playlist_saved_001",
        name: "  日常循环  ",
        createdAt: "2026-07-18T00:02:00.000Z"
      }
    );
    const savedPlaylist = library.savedPlaylistsById.playlist_saved_001;

    expect(savedPlaylist).toMatchObject({
      id: "playlist_saved_001",
      name: "日常循环",
      itemIds: ["queue_item_001"],
      createdAt: "2026-07-18T00:02:00.000Z",
      updatedAt: "2026-07-18T00:02:00.000Z"
    });
    expect(savedPlaylist.itemsById.queue_item_001).toMatchObject({
      trackId: "track_001",
      repeatCount: 3,
      playedCount: 0
    });

    const editedTemporaryPlaylist = updatePlaylistItemRepeatCount(
      library.temporaryPlaylist,
      "queue_item_001",
      1,
      "2026-07-18T00:03:00.000Z"
    );

    expect(editedTemporaryPlaylist.itemsById.queue_item_001.repeatCount).toBe(1);
    expect(savedPlaylist.itemsById.queue_item_001.repeatCount).toBe(3);
  });

  it("requires an explicit non-empty name and unique saved playlist ID", () => {
    const library = createPlaylistLibrary({
      temporaryPlaylist: createCurrentPlaylist()
    });
    const input = {
      sourcePlaylist: library.temporaryPlaylist,
      savedPlaylistId: "playlist_saved_001",
      name: "",
      createdAt: updatedAt
    };

    expect(() => copyPlaylistToSaved(library, input)).toThrow(
      "Saved playlist names must not be empty."
    );

    const withSavedPlaylist = copyPlaylistToSaved(library, {
      ...input,
      name: "收藏"
    });

    expect(() =>
      copyPlaylistToSaved(withSavedPlaylist, {
        ...input,
        name: "重复 ID"
      })
    ).toThrow("Saved playlist IDs must be unique");
    expect(() =>
      copyPlaylistToSaved(withSavedPlaylist, {
        ...input,
        savedPlaylistId: "playlist_temporary",
        name: "临时 ID"
      })
    ).toThrow("Saved playlist IDs must be unique");
  });

  it("renames and deletes only saved documents", () => {
    const withSavedPlaylist = copyPlaylistToSaved(
      createPlaylistLibrary({ temporaryPlaylist: createCurrentPlaylist() }),
      {
        sourcePlaylist: createCurrentPlaylist(),
        savedPlaylistId: "playlist_saved_001",
        name: "原名称",
        createdAt: updatedAt
      }
    );

    const renamed = renameSavedPlaylist(withSavedPlaylist, {
      savedPlaylistId: "playlist_saved_001",
      name: "  新名称 ",
      updatedAt: "2026-07-18T00:02:00.000Z"
    });
    const deleted = deleteSavedPlaylist(renamed, "playlist_saved_001");

    expect(renamed.savedPlaylistsById.playlist_saved_001).toMatchObject({
      name: "新名称",
      updatedAt: "2026-07-18T00:02:00.000Z"
    });
    expect(deleted.temporaryPlaylist).toEqual(withSavedPlaylist.temporaryPlaylist);
    expect(deleted.savedPlaylistIds).toEqual([]);
    expect(deleted.savedPlaylistsById).toEqual({});
    expect(deleteSavedPlaylist(deleted, "missing_playlist")).toBe(deleted);
  });

  it("validates saved selections without changing the selected document", () => {
    const library = copyPlaylistToSaved(
      createPlaylistLibrary({ temporaryPlaylist: createCurrentPlaylist() }),
      {
        sourcePlaylist: createCurrentPlaylist(),
        savedPlaylistId: "playlist_saved_001",
        name: "收藏",
        createdAt: updatedAt
      }
    );

    const selection = selectPlaylist(library, {
      kind: "saved",
      playlistId: "playlist_saved_001"
    });

    expect(selection).toEqual({ kind: "saved", playlistId: "playlist_saved_001" });
    expect(getSelectedPlaylist(library, selection).name).toBe("收藏");
    expect(isPlaylistSelectionAvailable(library, { kind: "temporary" })).toBe(true);
    expect(
      isPlaylistSelectionAvailable(library, {
        kind: "saved",
        playlistId: "missing_playlist"
      })
    ).toBe(false);
    expect(() =>
      selectPlaylist(library, { kind: "saved", playlistId: "missing_playlist" })
    ).toThrow("does not exist");
  });
});
