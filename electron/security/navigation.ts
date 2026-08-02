export const DEVELOPMENT_RENDERER_URL = "http://127.0.0.1:5173/";

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function getDevelopmentRendererUrl(value: string | undefined): URL | null {
  if (value === undefined) {
    return null;
  }

  const url = parseUrl(value);

  if (url === null || url.href !== DEVELOPMENT_RENDERER_URL) {
    throw new Error(
      `ELECTRON_RENDERER_URL must be exactly ${DEVELOPMENT_RENDERER_URL} in development.`
    );
  }

  return url;
}

export function isTrustedRendererUrl(candidate: string, expected: string): boolean {
  const candidateUrl = parseUrl(candidate);
  const expectedUrl = parseUrl(expected);

  if (candidateUrl === null || expectedUrl === null) {
    return false;
  }

  if (expectedUrl.protocol === "file:") {
    return (
      candidateUrl.protocol === "file:" &&
      candidateUrl.host === expectedUrl.host &&
      candidateUrl.pathname === expectedUrl.pathname
    );
  }

  return (
    candidateUrl.origin === expectedUrl.origin &&
    candidateUrl.pathname === expectedUrl.pathname
  );
}

export function getExternalHttpsUrl(value: string): string | null {
  const url = parseUrl(value);

  if (
    url === null ||
    url.protocol !== "https:" ||
    url.username.length > 0 ||
    url.password.length > 0
  ) {
    return null;
  }

  return url.href;
}
