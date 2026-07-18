let activeCatalogWriteOwner: string | undefined;

export function tryAcquireCatalogWriteLock(owner: string): boolean {
  if (activeCatalogWriteOwner !== undefined) {
    return false;
  }

  activeCatalogWriteOwner = owner;
  return true;
}

export function releaseCatalogWriteLock(owner: string): void {
  if (activeCatalogWriteOwner === owner) {
    activeCatalogWriteOwner = undefined;
  }
}

export function isCatalogWriteLocked(): boolean {
  return activeCatalogWriteOwner !== undefined;
}
