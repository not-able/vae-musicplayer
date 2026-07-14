import { describe, expect, it } from "vitest";

import { findQueueInsertionIndex } from "../features/playlist/queueDrag";

describe("queue drag insertion index", () => {
  it("uses the upper and lower halves of each row as insertion boundaries", () => {
    const itemMidpoints = [140, 240];

    expect(findQueueInsertionIndex(139, itemMidpoints)).toBe(0);
    expect(findQueueInsertionIndex(140, itemMidpoints)).toBe(1);
    expect(findQueueInsertionIndex(239, itemMidpoints)).toBe(1);
    expect(findQueueInsertionIndex(240, itemMidpoints)).toBe(2);
  });

  it("returns the only insertion slot when no other rows remain", () => {
    expect(findQueueInsertionIndex(200, [])).toBe(0);
  });
});
