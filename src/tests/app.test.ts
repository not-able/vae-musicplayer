import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { App } from "../app/App";
import {
  ALBUM_DRAG_MIME_TYPE,
  PLAYLIST_ITEM_DRAG_MIME_TYPE,
  TRACK_DRAG_MIME_TYPE
} from "../utils/albumDrag";

function findButton(container: HTMLElement, ariaLabel: string) {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => button.getAttribute("aria-label") === ariaLabel
  );
}

function createDataTransfer(): DataTransfer {
  const values = new Map<string, string>();

  return {
    dropEffect: "none",
    effectAllowed: "uninitialized",
    get types() {
      return [...values.keys()];
    },
    getData(type: string) {
      return values.get(type) ?? "";
    },
    setData(type: string, value: string) {
      values.set(type, value);
    }
  } as unknown as DataTransfer;
}

function dispatchDragEvent(
  target: Element,
  type: string,
  dataTransfer: DataTransfer,
  clientY = 0
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
  Object.defineProperty(event, "clientY", { value: clientY });
  target.dispatchEvent(event);

  return event;
}

function setVerticalBounds(element: Element, top: number, height = 80) {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () =>
      ({
        x: 0,
        y: top,
        top,
        right: 320,
        bottom: top + height,
        left: 0,
        width: 320,
        height,
        toJSON: () => ({})
      }) satisfies DOMRect
  });
}

function getVisualQueueTitles(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      ".queue-item:not(.is-preview-source), .queue-item-order-ghost"
    )
  )
    .sort((firstItem, secondItem) => {
      return Number(firstItem.style.order) - Number(secondItem.style.order);
    })
    .map((item) => item.querySelector("h3")?.textContent?.trim());
}

describe("temporary playlist workflow", () => {
  it("connects catalog actions to repeat, ordering, removal, and clear controls", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(App));
    });

    expect(container.querySelector(".queue-empty")).not.toBeNull();

    await act(async () => {
      findButton(container, "将示例歌曲一加入临时歌单")?.click();
    });

    expect(container.querySelectorAll(".queue-item")).toHaveLength(1);
    expect(container.querySelector(".queue-item")?.textContent).toContain("示例歌曲一");
    expect(container.querySelector(".queue-item")?.textContent).not.toContain(
      "示例专辑 A"
    );
    expect(
      container.querySelector<HTMLInputElement>(".repeat-stepper input")?.value
    ).toBe("1");

    await act(async () => {
      findButton(container, "增加示例歌曲一的播放次数")?.click();
    });

    expect(
      container.querySelector<HTMLInputElement>(".repeat-stepper input")?.value
    ).toBe("2");
    expect(container.querySelector(".playlist-heading-actions")?.textContent).toContain(
      "1 首 · 2 次"
    );

    await act(async () => {
      findButton(container, "将示例歌曲二加入临时歌单")?.click();
    });

    await act(async () => {
      findButton(container, "下移示例歌曲一")?.click();
    });

    expect(
      Array.from(container.querySelectorAll(".queue-item h3"), (heading) =>
        heading.textContent?.trim()
      )
    ).toEqual(["示例歌曲二", "示例歌曲一"]);

    await act(async () => {
      findButton(container, "删除示例歌曲二")?.click();
    });

    expect(container.querySelectorAll(".queue-item")).toHaveLength(1);

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".danger-button")?.click();
    });

    expect(container.querySelector(".queue-empty")).not.toBeNull();

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".add-album-button")?.click();
    });

    expect(
      Array.from(container.querySelectorAll(".queue-item h3"), (heading) =>
        heading.textContent?.trim()
      )
    ).toEqual(["示例歌曲一", "示例歌曲二"]);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("adds a dragged album in track order with repeatCount 1", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const dataTransfer = createDataTransfer();

    await act(async () => {
      root.render(createElement(App));
    });

    const albumButton = container.querySelector(".album-list-button");
    const dropZone = container.querySelector(".playlist-panel");

    expect(albumButton).not.toBeNull();
    expect(dropZone).not.toBeNull();

    await act(async () => {
      dispatchDragEvent(albumButton as Element, "dragstart", dataTransfer);
      dispatchDragEvent(dropZone as Element, "dragenter", dataTransfer);
      dispatchDragEvent(dropZone as Element, "dragover", dataTransfer);
    });

    expect(dataTransfer.effectAllowed).toBe("copy");
    expect(dataTransfer.dropEffect).toBe("copy");
    expect(dataTransfer.getData(ALBUM_DRAG_MIME_TYPE)).toBe("album_sample_001");
    expect(container.querySelector(".album-drop-feedback")).not.toBeNull();

    await act(async () => {
      dispatchDragEvent(dropZone as Element, "drop", dataTransfer);
      dispatchDragEvent(albumButton as Element, "dragend", dataTransfer);
    });

    expect(
      Array.from(container.querySelectorAll(".queue-item h3"), (heading) =>
        heading.textContent?.trim()
      )
    ).toEqual(["示例歌曲一", "示例歌曲二"]);
    expect(
      Array.from(
        container.querySelectorAll<HTMLInputElement>(".repeat-stepper input"),
        (input) => input.value
      )
    ).toEqual(["1", "1"]);
    expect(container.querySelector(".album-drop-feedback")).toBeNull();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("adds a dragged catalog track with repeatCount 1", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const dataTransfer = createDataTransfer();

    await act(async () => {
      root.render(createElement(App));
    });

    const trackSource = container.querySelector(".track-drag-source");
    const dropZone = container.querySelector(".playlist-panel");

    expect(trackSource).not.toBeNull();
    expect(dropZone).not.toBeNull();

    await act(async () => {
      dispatchDragEvent(trackSource as Element, "dragstart", dataTransfer);
      dispatchDragEvent(dropZone as Element, "dragenter", dataTransfer);
      dispatchDragEvent(dropZone as Element, "dragover", dataTransfer);
    });

    expect(dataTransfer.effectAllowed).toBe("copy");
    expect(dataTransfer.dropEffect).toBe("copy");
    expect(dataTransfer.getData(TRACK_DRAG_MIME_TYPE)).toBe("track_sample_001");
    expect(container.querySelector(".album-drop-feedback")?.textContent).toContain(
      "松开以加入这首歌曲"
    );

    await act(async () => {
      dispatchDragEvent(dropZone as Element, "drop", dataTransfer);
      dispatchDragEvent(trackSource as Element, "dragend", dataTransfer);
    });

    expect(
      Array.from(container.querySelectorAll(".queue-item h3"), (heading) =>
        heading.textContent?.trim()
      )
    ).toEqual(["示例歌曲一"]);
    expect(
      container.querySelector<HTMLInputElement>(".repeat-stepper input")?.value
    ).toBe("1");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("previews precise insertion slots and allows returning to the original slot", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(App));
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".add-album-button")?.click();
    });

    const panel = container.querySelector(".playlist-panel") as Element;
    const queueItems = container.querySelectorAll(
      ".queue-item:not(.queue-item-order-ghost)"
    );
    setVerticalBounds(queueItems[0], 100);
    setVerticalBounds(queueItems[1], 200);

    const dataTransfer = createDataTransfer();
    const firstDragSource = queueItems[0].querySelector(".queue-item-copy") as Element;
    let dragEnterEvent: Event | undefined;

    await act(async () => {
      dispatchDragEvent(firstDragSource, "dragstart", dataTransfer, 140);
      dragEnterEvent = dispatchDragEvent(panel, "dragenter", dataTransfer, 230);
      dispatchDragEvent(panel, "dragover", dataTransfer, 230);
    });

    expect(dataTransfer.effectAllowed).toBe("move");
    expect(dragEnterEvent?.defaultPrevented).toBe(true);
    expect(dataTransfer.getData(PLAYLIST_ITEM_DRAG_MIME_TYPE)).not.toBe("");
    expect(container.querySelector(".queue-item-order-ghost")?.textContent).toContain(
      "第 1 首"
    );
    expect(getVisualQueueTitles(container)).toEqual(["示例歌曲一", "示例歌曲二"]);

    await act(async () => {
      dispatchDragEvent(panel, "dragover", dataTransfer, 250);
    });

    expect(
      container.querySelector(".queue-item-order-ghost h3")?.textContent?.trim()
    ).toBe("示例歌曲一");
    expect(container.querySelector(".queue-item-order-ghost")?.textContent).toContain(
      "第 2 首"
    );
    expect(
      container.querySelector(".queue-item.is-preview-source h3")?.textContent?.trim()
    ).toBe("示例歌曲一");
    expect(getVisualQueueTitles(container)).toEqual(["示例歌曲二", "示例歌曲一"]);
    expect(
      Array.from(
        container.querySelectorAll(".queue-item:not(.queue-item-order-ghost) h3"),
        (heading) => heading.textContent?.trim()
      )
    ).toEqual(["示例歌曲一", "示例歌曲二"]);

    await act(async () => {
      dispatchDragEvent(firstDragSource, "dragend", dataTransfer, 250);
    });

    expect(container.querySelector(".queue-item-order-ghost")).toBeNull();
    expect(
      Array.from(container.querySelectorAll(".queue-item h3"), (heading) =>
        heading.textContent?.trim()
      )
    ).toEqual(["示例歌曲一", "示例歌曲二"]);

    const restoreTransfer = createDataTransfer();
    const secondDragSource = queueItems[1].querySelector(".queue-item-copy") as Element;

    await act(async () => {
      dispatchDragEvent(secondDragSource, "dragstart", restoreTransfer, 240);
      dispatchDragEvent(panel, "dragover", restoreTransfer, 90);
    });

    expect(getVisualQueueTitles(container)).toEqual(["示例歌曲二", "示例歌曲一"]);
    expect(container.querySelector(".queue-item-order-ghost")?.textContent).toContain(
      "第 1 首"
    );

    await act(async () => {
      dispatchDragEvent(panel, "dragover", restoreTransfer, 150);
    });

    expect(container.querySelector(".queue-item-order-ghost")).not.toBeNull();
    expect(container.querySelector(".queue-item-order-ghost")?.textContent).toContain(
      "第 2 首"
    );
    expect(getVisualQueueTitles(container)).toEqual(["示例歌曲一", "示例歌曲二"]);

    await act(async () => {
      dispatchDragEvent(panel, "drop", restoreTransfer, 150);
      dispatchDragEvent(secondDragSource, "dragend", restoreTransfer, 150);
    });

    expect(
      Array.from(container.querySelectorAll(".queue-item h3"), (heading) =>
        heading.textContent?.trim()
      )
    ).toEqual(["示例歌曲一", "示例歌曲二"]);
    expect(container.querySelector(".queue-item-order-ghost")).toBeNull();

    const commitTransfer = createDataTransfer();

    await act(async () => {
      dispatchDragEvent(firstDragSource, "dragstart", commitTransfer, 140);
      dispatchDragEvent(panel, "dragover", commitTransfer, 250);
      dispatchDragEvent(panel, "drop", commitTransfer, 250);
      dispatchDragEvent(firstDragSource, "dragend", commitTransfer, 250);
    });

    expect(
      Array.from(container.querySelectorAll(".queue-item h3"), (heading) =>
        heading.textContent?.trim()
      )
    ).toEqual(["示例歌曲二", "示例歌曲一"]);
    expect(container.querySelector(".queue-item-order-ghost")).toBeNull();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("removes a playlist item only when it is dropped outside the panel", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(App));
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".add-album-button")?.click();
    });

    const cancelledTransfer = createDataTransfer();
    const firstDragSource = container.querySelector(".queue-item-copy") as Element;
    const outsideTarget = container.querySelector(".workspace") as Element;

    await act(async () => {
      dispatchDragEvent(firstDragSource, "dragstart", cancelledTransfer);
      dispatchDragEvent(outsideTarget, "dragover", cancelledTransfer);
    });

    expect(container.querySelector(".queue-remove-feedback")).not.toBeNull();

    await act(async () => {
      dispatchDragEvent(firstDragSource, "dragend", cancelledTransfer);
    });

    expect(container.querySelectorAll(".queue-item")).toHaveLength(2);
    expect(container.querySelector(".queue-remove-feedback")).toBeNull();

    const droppedTransfer = createDataTransfer();
    const nextDragSource = container.querySelector(".queue-item-copy") as Element;

    await act(async () => {
      dispatchDragEvent(nextDragSource, "dragstart", droppedTransfer);
      dispatchDragEvent(outsideTarget, "dragover", droppedTransfer);
      dispatchDragEvent(outsideTarget, "drop", droppedTransfer);
    });

    expect(
      Array.from(container.querySelectorAll(".queue-item h3"), (heading) =>
        heading.textContent?.trim()
      )
    ).toEqual(["示例歌曲二"]);
    expect(container.querySelector(".queue-remove-feedback")).toBeNull();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("does not update the playlist when an album drag is cancelled", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const dataTransfer = createDataTransfer();

    await act(async () => {
      root.render(createElement(App));
    });

    const albumButton = container.querySelector(".album-list-button");
    const dropZone = container.querySelector(".playlist-panel");

    await act(async () => {
      dispatchDragEvent(albumButton as Element, "dragstart", dataTransfer);
      dispatchDragEvent(dropZone as Element, "dragenter", dataTransfer);
    });

    expect(container.querySelector(".album-drop-feedback")).not.toBeNull();

    await act(async () => {
      dispatchDragEvent(albumButton as Element, "dragend", dataTransfer);
    });

    expect(container.querySelectorAll(".queue-item")).toHaveLength(0);
    expect(container.querySelector(".album-drop-feedback")).toBeNull();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("ignores unsupported and unknown album drop data", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(App));
    });

    const dropZone = container.querySelector(".playlist-panel") as Element;
    const unsupportedTransfer = createDataTransfer();
    unsupportedTransfer.setData("text/plain", "album_sample_001");

    await act(async () => {
      dispatchDragEvent(dropZone, "drop", unsupportedTransfer);
    });

    const unknownAlbumTransfer = createDataTransfer();
    unknownAlbumTransfer.setData(ALBUM_DRAG_MIME_TYPE, "album_unknown");

    await act(async () => {
      dispatchDragEvent(dropZone, "dragenter", unknownAlbumTransfer);
      dispatchDragEvent(dropZone, "drop", unknownAlbumTransfer);
    });

    const unknownTrackTransfer = createDataTransfer();
    unknownTrackTransfer.setData(TRACK_DRAG_MIME_TYPE, "track_unknown");

    await act(async () => {
      dispatchDragEvent(dropZone, "dragenter", unknownTrackTransfer);
      dispatchDragEvent(dropZone, "drop", unknownTrackTransfer);
    });

    expect(container.querySelectorAll(".queue-item")).toHaveLength(0);
    expect(container.querySelector(".album-drop-feedback")).toBeNull();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
