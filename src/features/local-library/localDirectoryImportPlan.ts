import type { CatalogData, EntityId, LocalAudioFileRecord } from "../../types";
import { normalizeDirectoryCandidateKey } from "./localDirectoryScanner";
import type { LocalTrackMatch } from "./localTrackMatcher";

export interface LocalDirectoryImportSelection {
  selectedCandidateIndexes: ReadonlySet<number>;
  targetTrackIdByCandidateIndex: ReadonlyMap<number, EntityId>;
  selectedNewAlbumKeys: ReadonlySet<string>;
}

export interface LocalDirectoryImportBindingRequest {
  sourceId: string;
  candidateIndex: number;
  trackId: EntityId;
  file: File;
}

export interface LocalDirectoryImportTrackDraft {
  sourceId: string;
  candidateIndex: number;
  title: string;
  trackNumber: number;
  file: File;
}

export interface LocalDirectoryImportAlbumDraft {
  key: string;
  title: string;
  artistId: EntityId;
  tracks: readonly LocalDirectoryImportTrackDraft[];
}

export interface LocalDirectoryImportAlbumGroup {
  key: string;
  title: string;
  candidateIndexes: readonly number[];
  available: boolean;
  unavailableReason?: "default_artist_unavailable" | "existing_album_with_same_title";
}

export interface LocalDirectoryImportPlan {
  defaultSelectedCandidateIndexes: ReadonlySet<number>;
  albumGroups: readonly LocalDirectoryImportAlbumGroup[];
  selectedAlbumDrafts: readonly LocalDirectoryImportAlbumDraft[];
  bindingRequests: readonly LocalDirectoryImportBindingRequest[];
  selectedFileCount: number;
  selectedFileSize: number;
  issues: readonly string[];
}

export function getLocalDirectoryCandidateSourceId(candidateIndex: number): string {
  return `directory_candidate_${candidateIndex}`;
}

export function getDefaultDirectoryImportSelection(
  matches: readonly LocalTrackMatch[]
): LocalDirectoryImportSelection {
  const selectedCandidateIndexes = new Set<number>();
  const targetTrackIdByCandidateIndex = new Map<number, EntityId>();

  for (const match of matches) {
    if (match.suggestedTrackId) {
      targetTrackIdByCandidateIndex.set(match.candidateIndex, match.suggestedTrackId);
    }

    if (match.status === "exact" && match.suggestedTrackId) {
      selectedCandidateIndexes.add(match.candidateIndex);
    }
  }

  return {
    selectedCandidateIndexes,
    targetTrackIdByCandidateIndex,
    selectedNewAlbumKeys: new Set()
  };
}

export function buildLocalDirectoryImportPlan({
  catalog,
  matches,
  audioBindingsByTrackId,
  defaultArtistId,
  selection
}: {
  catalog: CatalogData;
  matches: readonly LocalTrackMatch[];
  audioBindingsByTrackId: ReadonlyMap<EntityId, LocalAudioFileRecord>;
  defaultArtistId?: EntityId;
  selection: LocalDirectoryImportSelection;
}): LocalDirectoryImportPlan {
  const defaultSelectedCandidateIndexes =
    getDefaultDirectoryImportSelection(matches).selectedCandidateIndexes;
  const albumGroups = createAlbumGroups(catalog, matches, defaultArtistId);
  const selectedAlbumDrafts = createSelectedAlbumDrafts(
    albumGroups,
    matches,
    defaultArtistId,
    selection.selectedNewAlbumKeys
  );
  const issues: string[] = [];
  const bindingRequests: LocalDirectoryImportBindingRequest[] = [];
  const selectedTrackIds = new Set<EntityId>();

  for (const match of matches) {
    if (!selection.selectedCandidateIndexes.has(match.candidateIndex)) {
      continue;
    }

    const targetTrackId = selection.targetTrackIdByCandidateIndex.get(
      match.candidateIndex
    );
    const allowedTargetIds = new Set(match.matchingTrackIds);

    if (
      !isManuallyBindableMatch(match) ||
      !targetTrackId ||
      !allowedTargetIds.has(targetTrackId)
    ) {
      issues.push(`文件“${match.candidate.fileName}”没有可确认的目录歌曲。`);
      continue;
    }
    if (audioBindingsByTrackId.has(targetTrackId)) {
      issues.push(`歌曲“${getTrackTitle(catalog, targetTrackId)}”已有本地音频绑定。`);
      continue;
    }
    if (selectedTrackIds.has(targetTrackId)) {
      issues.push(`歌曲“${getTrackTitle(catalog, targetTrackId)}”被多个文件重复选择。`);
      continue;
    }

    selectedTrackIds.add(targetTrackId);
    bindingRequests.push({
      sourceId: getLocalDirectoryCandidateSourceId(match.candidateIndex),
      candidateIndex: match.candidateIndex,
      trackId: targetTrackId,
      file: match.candidate.file
    });
  }

  const selectedDraftFileCount = selectedAlbumDrafts.reduce(
    (count, draft) => count + draft.tracks.length,
    0
  );
  const selectedDraftFileSize = selectedAlbumDrafts
    .flatMap((draft) => draft.tracks)
    .reduce((size, track) => size + track.file.size, 0);

  return {
    defaultSelectedCandidateIndexes,
    albumGroups,
    selectedAlbumDrafts,
    bindingRequests,
    selectedFileCount: bindingRequests.length + selectedDraftFileCount,
    selectedFileSize:
      bindingRequests.reduce((size, request) => size + request.file.size, 0) +
      selectedDraftFileSize,
    issues
  };
}

function createAlbumGroups(
  catalog: CatalogData,
  matches: readonly LocalTrackMatch[],
  defaultArtistId: EntityId | undefined
): readonly LocalDirectoryImportAlbumGroup[] {
  const candidateIndexesByAlbumKey = new Map<string, number[]>();
  const albumTitleByKey = new Map<string, string>();

  for (const match of matches) {
    if (!isNewAlbumCandidate(match)) {
      continue;
    }

    const albumTitle = match.candidate.albumTitle as string;
    const key = createAlbumGroupKey(albumTitle);
    candidateIndexesByAlbumKey.set(key, [
      ...(candidateIndexesByAlbumKey.get(key) ?? []),
      match.candidateIndex
    ]);
    albumTitleByKey.set(key, albumTitle);
  }

  return [...candidateIndexesByAlbumKey.entries()]
    .map<LocalDirectoryImportAlbumGroup>(([key, candidateIndexes]) => {
      const title = albumTitleByKey.get(key) as string;
      const existingAlbum = defaultArtistId
        ? catalog.albums.find(
            (album) =>
              album.artistId === defaultArtistId &&
              normalizeDirectoryCandidateKey(album.title) ===
                normalizeDirectoryCandidateKey(title)
          )
        : undefined;

      if (!defaultArtistId) {
        return {
          key,
          title,
          candidateIndexes,
          available: false,
          unavailableReason: "default_artist_unavailable"
        };
      }

      if (existingAlbum) {
        return {
          key,
          title,
          candidateIndexes,
          available: false,
          unavailableReason: "existing_album_with_same_title"
        };
      }

      return { key, title, candidateIndexes, available: true };
    })
    .sort((left, right) => compareStableText(left.title, right.title));
}

function createSelectedAlbumDrafts(
  albumGroups: readonly LocalDirectoryImportAlbumGroup[],
  matches: readonly LocalTrackMatch[],
  defaultArtistId: EntityId | undefined,
  selectedNewAlbumKeys: ReadonlySet<string>
): readonly LocalDirectoryImportAlbumDraft[] {
  if (!defaultArtistId) {
    return [];
  }

  const matchesByIndex = new Map(matches.map((match) => [match.candidateIndex, match]));

  return albumGroups
    .filter((group) => group.available && selectedNewAlbumKeys.has(group.key))
    .map((group) => {
      const tracks = group.candidateIndexes
        .map((candidateIndex) => matchesByIndex.get(candidateIndex))
        .filter((match): match is LocalTrackMatch => match !== undefined)
        .sort((left, right) =>
          compareStableText(
            left.candidate.relativePath ?? left.candidate.fileName,
            right.candidate.relativePath ?? right.candidate.fileName
          )
        )
        .map((match, index) => ({
          sourceId: getLocalDirectoryCandidateSourceId(match.candidateIndex),
          candidateIndex: match.candidateIndex,
          title: match.candidate.trackTitle as string,
          trackNumber: index + 1,
          file: match.candidate.file
        }));

      return {
        key: group.key,
        title: group.title,
        artistId: defaultArtistId,
        tracks
      };
    });
}

function isManuallyBindableMatch(match: LocalTrackMatch): boolean {
  return (
    match.status === "exact" ||
    match.status === "candidate" ||
    match.status === "conflict"
  );
}

function isNewAlbumCandidate(match: LocalTrackMatch): boolean {
  return (
    match.status === "unmatched" &&
    match.candidate.parseStatus === "parsed" &&
    match.candidate.issues.length === 0 &&
    Boolean(match.candidate.albumTitle && match.candidate.trackTitle)
  );
}

function createAlbumGroupKey(title: string): string {
  return `new_album:${normalizeDirectoryCandidateKey(title)}`;
}

function compareStableText(left: string, right: string): number {
  const leftKey = normalizeDirectoryCandidateKey(left);
  const rightKey = normalizeDirectoryCandidateKey(right);

  if (leftKey < rightKey) {
    return -1;
  }
  if (leftKey > rightKey) {
    return 1;
  }
  return left < right ? -1 : left > right ? 1 : 0;
}

function getTrackTitle(catalog: CatalogData, trackId: EntityId): string {
  return catalog.tracks.find((track) => track.id === trackId)?.title ?? trackId;
}
