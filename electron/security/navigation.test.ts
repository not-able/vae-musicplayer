import { describe, expect, it } from "vitest";

import {
  DEVELOPMENT_RENDERER_URL,
  getDevelopmentRendererUrl,
  getExternalHttpsUrl,
  isTrustedRendererUrl
} from "./navigation";

describe("Electron navigation security", () => {
  it("accepts only the fixed loopback development URL", () => {
    expect(getDevelopmentRendererUrl(undefined)).toBeNull();
    expect(getDevelopmentRendererUrl(DEVELOPMENT_RENDERER_URL)?.href).toBe(
      DEVELOPMENT_RENDERER_URL
    );
    expect(() => getDevelopmentRendererUrl("http://localhost:5173/")).toThrow();
    expect(() => getDevelopmentRendererUrl("https://127.0.0.1:5173/")).toThrow();
  });

  it("allows only the expected renderer page", () => {
    expect(
      isTrustedRendererUrl(
        "http://127.0.0.1:5173/?view=queue#current",
        DEVELOPMENT_RENDERER_URL
      )
    ).toBe(true);
    expect(
      isTrustedRendererUrl("http://127.0.0.1:5173/other", DEVELOPMENT_RENDERER_URL)
    ).toBe(false);
    expect(
      isTrustedRendererUrl("http://127.0.0.1.example:5173/", DEVELOPMENT_RENDERER_URL)
    ).toBe(false);

    const packagedPage = "file:///D:/app/resources/app.asar/dist/index.html";
    expect(isTrustedRendererUrl(`${packagedPage}#queue`, packagedPage)).toBe(true);
    expect(
      isTrustedRendererUrl(
        "file:///D:/app/resources/app.asar/dist/other.html",
        packagedPage
      )
    ).toBe(false);
  });

  it("opens only HTTPS links without embedded credentials", () => {
    expect(getExternalHttpsUrl("https://example.com/path")).toBe(
      "https://example.com/path"
    );
    expect(getExternalHttpsUrl("http://example.com/path")).toBeNull();
    expect(getExternalHttpsUrl("javascript:alert(1)")).toBeNull();
    expect(getExternalHttpsUrl("https://user:secret@example.com/path")).toBeNull();
    expect(getExternalHttpsUrl("not a URL")).toBeNull();
  });
});
