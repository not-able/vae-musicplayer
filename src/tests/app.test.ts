import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { App } from "../app/App";
import { ALBUM_DRAG_MIME_TYPE } from "../utils/albumDrag";

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

function dispatchDragEvent(target: Element, type: string, dataTransfer: DataTransfer) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
  target.dispatchEvent(event);

  return event;
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

    expect(container.querySelectorAll(".queue-item")).toHaveLength(0);
    expect(container.querySelector(".album-drop-feedback")).toBeNull();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
