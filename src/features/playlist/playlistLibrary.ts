import type {
  EntityId,
  ISODateString,
  PlaylistDocument,
  PlaylistItem,
  PlaylistLibrary,
  PlaylistSelection
} from "../../types";

export interface CreatePlaylistLibraryInput {
  temporaryPlaylist: PlaylistDocument;
}

export interface CopyPlaylistToSavedInput {
  sourcePlaylist: PlaylistDocument;
  savedPlaylistId: EntityId;
  name: string;
  createdAt: ISODateString;
}

export interface RenameSavedPlaylistInput {
  savedPlaylistId: EntityId;
  name: string;
  updatedAt: ISODateString;
}

export function createPlaylistLibrary({
  temporaryPlaylist
}: CreatePlaylistLibraryInput): PlaylistLibrary {
  return {
    temporaryPlaylist: clonePlaylistDocument(temporaryPlaylist),
    savedPlaylistIds: [],
    savedPlaylistsById: {}
  };
}

export function copyPlaylistToSaved(
  library: PlaylistLibrary,
  { sourcePlaylist, savedPlaylistId, name, createdAt }: CopyPlaylistToSavedInput
): PlaylistLibrary {
  assertNewSavedPlaylistId(library, savedPlaylistId);
  const normalizedName = normalizeRequiredPlaylistName(name);
  const savedPlaylist = clonePlaylistDocument(sourcePlaylist, {
    id: savedPlaylistId,
    name: normalizedName,
    createdAt,
    updatedAt: createdAt
  });

  return {
    ...library,
    savedPlaylistIds: [...library.savedPlaylistIds, savedPlaylistId],
    savedPlaylistsById: {
      ...library.savedPlaylistsById,
      [savedPlaylistId]: savedPlaylist
    }
  };
}

export function renameSavedPlaylist(
  library: PlaylistLibrary,
  { savedPlaylistId, name, updatedAt }: RenameSavedPlaylistInput
): PlaylistLibrary {
  const savedPlaylist = library.savedPlaylistsById[savedPlaylistId];

  if (!savedPlaylist) {
    return library;
  }

  const normalizedName = normalizeRequiredPlaylistName(name);

  if (savedPlaylist.name === normalizedName) {
    return library;
  }

  return {
    ...library,
    savedPlaylistsById: {
      ...library.savedPlaylistsById,
      [savedPlaylistId]: {
        ...savedPlaylist,
        name: normalizedName,
        updatedAt
      }
    }
  };
}

export function deleteSavedPlaylist(
  library: PlaylistLibrary,
  savedPlaylistId: EntityId
): PlaylistLibrary {
  if (!library.savedPlaylistsById[savedPlaylistId]) {
    return library;
  }

  const savedPlaylistsById = Object.fromEntries(
    Object.entries(library.savedPlaylistsById).filter(
      ([playlistId]) => playlistId !== savedPlaylistId
    )
  );

  return {
    ...library,
    savedPlaylistIds: library.savedPlaylistIds.filter(
      (playlistId) => playlistId !== savedPlaylistId
    ),
    savedPlaylistsById
  };
}

export function isPlaylistSelectionAvailable(
  library: PlaylistLibrary,
  selection: PlaylistSelection
): boolean {
  return (
    selection.kind === "temporary" ||
    library.savedPlaylistsById[selection.playlistId] !== undefined
  );
}

export function selectPlaylist(
  library: PlaylistLibrary,
  selection: PlaylistSelection
): PlaylistSelection {
  if (!isPlaylistSelectionAvailable(library, selection)) {
    throw new Error("The selected saved playlist does not exist.");
  }

  return selection.kind === "temporary"
    ? { kind: "temporary" }
    : { kind: "saved", playlistId: selection.playlistId };
}

export function getSelectedPlaylist(
  library: PlaylistLibrary,
  selection: PlaylistSelection
): PlaylistDocument {
  if (selection.kind === "temporary") {
    return library.temporaryPlaylist;
  }

  const savedPlaylist = library.savedPlaylistsById[selection.playlistId];

  if (!savedPlaylist) {
    throw new Error("The selected saved playlist does not exist.");
  }

  return savedPlaylist;
}

export function clonePlaylistDocument(
  playlist: PlaylistDocument,
  overrides: Partial<
    Pick<PlaylistDocument, "id" | "name" | "createdAt" | "updatedAt">
  > = {}
): PlaylistDocument {
  const itemIds = [...playlist.itemIds];
  const itemsById: Record<EntityId, PlaylistItem> = {};

  for (const itemId of itemIds) {
    const item = playlist.itemsById[itemId];

    if (!item || item.id !== itemId) {
      throw new Error("Playlist document items must match their item IDs.");
    }

    itemsById[itemId] = clonePlaylistItem(item);
  }

  if (Object.keys(playlist.itemsById).length !== itemIds.length) {
    throw new Error("Playlist document items must not contain orphaned entries.");
  }

  return {
    id: overrides.id ?? playlist.id,
    name: overrides.name ?? playlist.name,
    itemIds,
    itemsById,
    createdAt: overrides.createdAt ?? playlist.createdAt,
    updatedAt: overrides.updatedAt ?? playlist.updatedAt
  };
}

export function normalizeRequiredPlaylistName(name: string): string {
  const normalizedName = name.trim();

  if (normalizedName.length === 0) {
    throw new Error("Saved playlist names must not be empty.");
  }

  return normalizedName;
}

function assertNewSavedPlaylistId(
  library: PlaylistLibrary,
  savedPlaylistId: EntityId
): void {
  if (
    savedPlaylistId === library.temporaryPlaylist.id ||
    library.savedPlaylistsById[savedPlaylistId] !== undefined ||
    library.savedPlaylistIds.includes(savedPlaylistId)
  ) {
    throw new Error("Saved playlist IDs must be unique within the playlist library.");
  }
}

function clonePlaylistItem(item: PlaylistItem): PlaylistItem {
  return {
    id: item.id,
    trackId: item.trackId,
    repeatCount: item.repeatCount,
    // Playback progress always belongs to the runtime playlist state.
    playedCount: 0,
    source: item.source,
    sourceAlbumId: item.sourceAlbumId,
    addedAt: item.addedAt
  };
}
