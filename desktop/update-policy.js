const VERSION_PATTERN = /^(?:wattelier-)?v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/i;

/** @param {unknown} value */
export function parseWattelierVersion(value) {
  const match = VERSION_PATTERN.exec(String(value).trim());
  return match ? match.slice(1, 4).map(Number) : null;
}

/** @param {unknown} candidate @param {unknown} current */
export function isNewerWattelierVersion(candidate, current) {
  const next = parseWattelierVersion(candidate);
  const installed = parseWattelierVersion(current);
  if (!next || !installed) return false;
  for (let index = 0; index < 3; index += 1) {
    const nextPart = next[index] ?? 0;
    const installedPart = installed[index] ?? 0;
    if (nextPart !== installedPart) return nextPart > installedPart;
  }
  return false;
}

/** @param {unknown} value */
export function githubReleaseUrl(value) {
  try {
    const url = new URL(String(value));
    if (url.protocol !== 'https:' || url.hostname !== 'github.com') return null;
    if (!url.pathname.startsWith('/N0thyTVOff/wattelier/releases/')) return null;
    return url.href;
  } catch {
    return null;
  }
}
