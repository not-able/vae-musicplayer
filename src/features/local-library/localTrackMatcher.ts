import type { CatalogData, EntityId, LocalAudioFileRecord, Track } from "../../types";
import {
  normalizeDirectoryCandidateKey,
  type LocalDirectoryAudioCandidate
} from "./localDirectoryScanner";

export type LocalTrackMatchStatus =
  "exact" | "candidate" | "conflict" | "unmatched" | "already_bound" | "needs_review";

export type LocalTrackMatchField = "title" | "artist" | "album";

export type LocalTrackMatchReason =
  | "exact_normalized_title"
  | "narrowed_by_catalog_metadata"
  | "scanner_needs_review"
  | "no_exact_title"
  | "ambiguous_track_title"
  | "artist_mismatch"
  | "album_mismatch"
  | "already_bound"
  | "duplicate_candidate_track";

export interface LocalTrackMatch {
  candidate: LocalDirectoryAudioCandidate;
  candidateIndex: number;
  status: LocalTrackMatchStatus;
  titleMatchingTrackIds: readonly EntityId[];
  matchingTrackIds: readonly EntityId[];
  suggestedTrackId?: EntityId;
  matchedBy: readonly LocalTrackMatchField[];
  reasons: readonly LocalTrackMatchReason[];
  conflictingCandidateIndexes: readonly number[];
}

export interface LocalTrackMatchResult {
  matches: readonly LocalTrackMatch[];
}

export function matchLocalDirectoryCandidates({
  catalog,
  candidates,
  audioBindingsByTrackId
}: {
  catalog: CatalogData;
  candidates: readonly LocalDirectoryAudioCandidate[];
  audioBindingsByTrackId: ReadonlyMap<EntityId, LocalAudioFileRecord>;
}): LocalTrackMatchResult {
  const artistNameKeysById = new Map(
    catalog.artists.map((artist) => [
      artist.id,
      new Set(
        [artist.name, ...(artist.aliases ?? [])]
          .map(normalizeDirectoryCandidateKey)
          .filter(Boolean)
      )
    ])
  );
  const albumTitlesById = new Map(
    catalog.albums.map((album) => [
      album.id,
      normalizeDirectoryCandidateKey(album.title)
    ])
  );
  const initialMatches = candidates.map((candidate, candidateIndex) =>
    matchCandidate(
      candidate,
      candidateIndex,
      catalog.tracks,
      artistNameKeysById,
      albumTitlesById,
      audioBindingsByTrackId
    )
  );

  return {
    matches: markDuplicateCandidateTracks(initialMatches)
  };
}

function matchCandidate(
  candidate: LocalDirectoryAudioCandidate,
  candidateIndex: number,
  tracks: readonly Track[],
  artistNameKeysById: ReadonlyMap<EntityId, ReadonlySet<string>>,
  albumTitlesById: ReadonlyMap<EntityId, string>,
  audioBindingsByTrackId: ReadonlyMap<EntityId, LocalAudioFileRecord>
): LocalTrackMatch {
  if (
    candidate.parseStatus !== "parsed" ||
    candidate.issues.length > 0 ||
    !candidate.trackTitle
  ) {
    return createMatch(candidate, candidateIndex, "needs_review", {
      reasons: ["scanner_needs_review"]
    });
  }

  const titleKey = normalizeDirectoryCandidateKey(candidate.trackTitle);

  if (!titleKey) {
    return createMatch(candidate, candidateIndex, "needs_review", {
      reasons: ["scanner_needs_review"]
    });
  }

  const titleMatches = tracks.filter(
    (track) => normalizeDirectoryCandidateKey(track.title) === titleKey
  );

  if (titleMatches.length === 0) {
    return createMatch(candidate, candidateIndex, "unmatched", {
      reasons: ["no_exact_title"]
    });
  }

  const titleMatchingTrackIds = titleMatches.map((track) => track.id);
  let matchingTracks = titleMatches;
  const matchedBy: LocalTrackMatchField[] = ["title"];
  let albumMismatch = false;

  if (candidate.artistName) {
    const artistKey = normalizeDirectoryCandidateKey(candidate.artistName);
    const artistMatches = matchingTracks.filter((track) =>
      artistNameKeysById.get(track.artistId)?.has(artistKey)
    );

    if (artistMatches.length === 0) {
      return createMatch(candidate, candidateIndex, "needs_review", {
        titleMatchingTrackIds,
        matchingTrackIds: titleMatchingTrackIds,
        matchedBy,
        reasons: ["artist_mismatch"]
      });
    }

    if (artistMatches.length < matchingTracks.length) {
      matchingTracks = artistMatches;
      matchedBy.push("artist");
    }
  }

  if (candidate.albumTitle) {
    const albumKey = normalizeDirectoryCandidateKey(candidate.albumTitle);
    const albumMatches = matchingTracks.filter(
      (track) => albumTitlesById.get(track.albumId) === albumKey
    );

    if (albumMatches.length === 0) {
      albumMismatch = true;
    } else if (albumMatches.length < matchingTracks.length) {
      matchingTracks = albumMatches;
      matchedBy.push("album");
    }
  }

  const matchingTrackIds = matchingTracks.map((track) => track.id);

  if (matchingTracks.length > 1) {
    return createMatch(candidate, candidateIndex, "conflict", {
      titleMatchingTrackIds,
      matchingTrackIds,
      matchedBy,
      reasons: ["ambiguous_track_title"]
    });
  }

  const [matchedTrack] = matchingTracks;

  if (!matchedTrack) {
    return createMatch(candidate, candidateIndex, "unmatched", {
      reasons: ["no_exact_title"]
    });
  }

  if (audioBindingsByTrackId.has(matchedTrack.id)) {
    return createMatch(candidate, candidateIndex, "already_bound", {
      titleMatchingTrackIds,
      matchingTrackIds,
      matchedBy,
      reasons: ["already_bound"]
    });
  }

  const isExactTitleMatch =
    titleMatches.length === 1 && matchedBy.length === 1 && !albumMismatch;
  const wasNarrowedByCatalogMetadata = matchedBy.length > 1;

  return createMatch(
    candidate,
    candidateIndex,
    isExactTitleMatch ? "exact" : "candidate",
    {
      titleMatchingTrackIds,
      matchingTrackIds,
      suggestedTrackId: matchedTrack.id,
      matchedBy,
      reasons: [
        wasNarrowedByCatalogMetadata
          ? "narrowed_by_catalog_metadata"
          : "exact_normalized_title",
        ...(albumMismatch ? ["album_mismatch" as const] : [])
      ]
    }
  );
}

function markDuplicateCandidateTracks(
  matches: readonly LocalTrackMatch[]
): readonly LocalTrackMatch[] {
  const candidateIndexesByTrackId = new Map<EntityId, number[]>();

  for (const match of matches) {
    if (
      (match.status === "exact" || match.status === "candidate") &&
      match.suggestedTrackId
    ) {
      const candidateIndexes =
        candidateIndexesByTrackId.get(match.suggestedTrackId) ?? [];
      candidateIndexes.push(match.candidateIndex);
      candidateIndexesByTrackId.set(match.suggestedTrackId, candidateIndexes);
    }
  }

  return matches.map((match) => {
    const conflictingCandidateIndexes = match.suggestedTrackId
      ? (candidateIndexesByTrackId.get(match.suggestedTrackId) ?? [])
      : [];

    if (conflictingCandidateIndexes.length < 2) {
      return match;
    }

    return {
      ...match,
      status: "conflict",
      suggestedTrackId: undefined,
      reasons: [...match.reasons, "duplicate_candidate_track"],
      conflictingCandidateIndexes
    };
  });
}

function createMatch(
  candidate: LocalDirectoryAudioCandidate,
  candidateIndex: number,
  status: LocalTrackMatchStatus,
  {
    matchingTrackIds = [],
    titleMatchingTrackIds = [],
    suggestedTrackId,
    matchedBy = [],
    reasons = []
  }: {
    matchingTrackIds?: readonly EntityId[];
    titleMatchingTrackIds?: readonly EntityId[];
    suggestedTrackId?: EntityId;
    matchedBy?: readonly LocalTrackMatchField[];
    reasons?: readonly LocalTrackMatchReason[];
  } = {}
): LocalTrackMatch {
  return {
    candidate,
    candidateIndex,
    status,
    titleMatchingTrackIds,
    matchingTrackIds,
    suggestedTrackId,
    matchedBy,
    reasons,
    conflictingCandidateIndexes: []
  };
}
