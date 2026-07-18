import { afterEach, describe, expect, it } from "vitest";

import {
  releaseCatalogWriteLock,
  tryAcquireCatalogWriteLock
} from "../features/catalog/catalogWriteLock";

afterEach(() => {
  releaseCatalogWriteLock("directory-import-test");
  releaseCatalogWriteLock("catalog-deletion-test");
});

describe("catalog write lock", () => {
  it("allows only one catalog persistence workflow at a time", () => {
    expect(tryAcquireCatalogWriteLock("directory-import-test")).toBe(true);
    expect(tryAcquireCatalogWriteLock("catalog-deletion-test")).toBe(false);

    releaseCatalogWriteLock("directory-import-test");

    expect(tryAcquireCatalogWriteLock("catalog-deletion-test")).toBe(true);
  });
});
