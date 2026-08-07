/** @param {{ requestSingleInstanceLock: () => boolean }} appInstance */
export function requestSingleInstance(appInstance) {
  return appInstance.requestSingleInstanceLock();
}

/**
 * @param {string | undefined} senderUrl
 * @param {number | string} port
 */
export function isTrustedDesktopUrl(senderUrl, port) {
  if (!senderUrl) return false;
  try {
    const url = new URL(senderUrl);
    return (
      url.protocol === 'http:' &&
      ['127.0.0.1', 'localhost'].includes(url.hostname) &&
      Number(url.port) === Number(port)
    );
  } catch {
    return false;
  }
}

/** @param {{ version: string, portable: boolean, openAtLogin: boolean, automaticUpdates?: boolean, applicationMode?: 'server' | 'client' }} options */
export function desktopRuntimeInfo({
  version,
  portable,
  openAtLogin,
  automaticUpdates = false,
  applicationMode = 'server',
}) {
  return {
    version,
    mode: portable ? 'portable' : 'installed',
    portable: Boolean(portable),
    openAtLogin: portable ? false : Boolean(openAtLogin),
    automaticUpdates: portable ? false : Boolean(automaticUpdates),
    applicationMode,
  };
}
