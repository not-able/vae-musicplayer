import { describe, expect, it } from "vitest";

import type {
  DesktopAudioCandidateId,
  DesktopLocalAudioBindingSummary
} from "../../electron/music-library/types";
import { mockCatalog } from "../data/catalog/mockCatalog";
import type { LocalAudioBindingId } from "../types/localAudioBinding";
import type { DesktopAudioCandidatePreview } from "../features/local-library/desktopAudioCandidatePreview";
import {
  associateCandidatesWithBindings,
  buildDesktopCatalogTrackOptions,
  getDesktopBindingErrorFeedback,
  parseDesktopBindingSummaries,
  searchDesktopCatalogTracks
} from "../features/local-library/desktopAudioBindingUi";

const CANDIDATE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as DesktopAudioCandidateId;
const BINDING_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as LocalAudioBindingId;

function createSummary(
  overrides: Partial<DesktopLocalAudioBindingSummary> = {}
): DesktopLocalAudioBindingSummary {
  return {
    bindingId: BINDING_ID,
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

function createCandidate(
  overrides: Partial<DesktopAudioCandidatePreview> = {}
): DesktopAudioCandidatePreview {
  return {
    candidateId: CANDIDATE_ID,
    fileName: "sample.mp3",
    fileExtension: "mp3",
    fileSize: 2048,
    modifiedAt: 1_765_000_000_000,
    parseStatus: "parsed",
    issues: [],
    ...overrides
  };
}

describe("desktop audio binding UI boundaries", () => {
  it("searches existing tracks by title, artist, and album without creating data", () => {
    const tracks = buildDesktopCatalogTrackOptions(mockCatalog);
    const firstTrack = tracks[0]!;

    expect(searchDesktopCatalogTracks(tracks, firstTrack.title)).toContain(firstTrack);
    expect(searchDesktopCatalogTracks(tracks, firstTrack.artistName)).toContain(
      firstTrack
    );
    expect(searchDesktopCatalogTracks(tracks, firstTrack.albumTitle)).toContain(
      firstTrack
    );
    expect(searchDesktopCatalogTracks(tracks, "不存在的曲目")).toEqual([]);
    expect(mockCatalog.tracks).toHaveLength(tracks.length);
  });

  it("accepts only source-free serializable binding summaries", () => {
    const summary = createSummary();

    expect(parseDesktopBindingSummaries(JSON.parse(JSON.stringify([summary])))).toEqual(
      [summary]
    );
    expect(() =>
      parseDesktopBindingSummaries([
        { ...summary, sourceRef: { relativePath: "private/song.mp3" } }
      ])
    ).toThrow(TypeError);
    expect(() =>
      parseDesktopBindingSummaries([{ ...summary, fileName: "C:\\private\\song.mp3" }])
    ).toThrow(TypeError);
  });

  it("associates only unambiguous candidate metadata or a current safe hint", () => {
    const candidate = createCandidate();
    const summary = createSummary();

    expect(
      associateCandidatesWithBindings([candidate], [summary], new Map()).get(
        candidate.candidateId
      )
    ).toEqual(summary);

    const duplicateCandidate = createCandidate({
      candidateId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" as DesktopAudioCandidateId
    });
    expect(
      associateCandidatesWithBindings(
        [candidate, duplicateCandidate],
        [summary],
        new Map()
      ).size
    ).toBe(0);

    expect(
      associateCandidatesWithBindings(
        [candidate, duplicateCandidate],
        [summary],
        new Map([[candidate.candidateId, summary.bindingId]])
      ).get(candidate.candidateId)
    ).toEqual(summary);
  });

  it("maps conflicts, expired candidates, and raw failures to stable safe feedback", () => {
    expect(
      getDesktopBindingErrorFeedback(
        new Error("[binding_conflict] C:\\private\\bindings.json"),
        "bind"
      )
    ).toEqual({
      kind: "conflict",
      message: "绑定状态已经发生变化，请重新确认。"
    });
    expect(
      getDesktopBindingErrorFeedback(
        new Error("[candidate_unavailable] internal stack"),
        "bind"
      ).message
    ).toBe("这个扫描候选已经失效，请重新扫描目录后再绑定。");
    expect(
      getDesktopBindingErrorFeedback(new Error("C:\\private\\secret"), "unbind").message
    ).not.toContain("private");
  });
});
