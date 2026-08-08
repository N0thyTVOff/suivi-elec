import { execFile as execFileCallback } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

/** @typedef {(executable: string, args: string[], options: object) => Promise<{ stdout: string }>} Execute */

/** @type {Execute} */
const executeFile = async (executable, args, options) => {
  const { stdout } = await execFile(executable, args, options);
  return { stdout };
};

/** @returns {string[]} */
function candidates(environment = process.env) {
  const result = [];
  if (environment.ProgramFiles) {
    result.push(path.join(environment.ProgramFiles, 'Tailscale', 'tailscale.exe'));
  }
  if (environment['ProgramFiles(x86)']) {
    result.push(path.join(environment['ProgramFiles(x86)'], 'Tailscale', 'tailscale.exe'));
  }
  if (environment.LOCALAPPDATA) {
    result.push(path.join(environment.LOCALAPPDATA, 'Tailscale', 'tailscale.exe'));
  }
  result.push('tailscale.exe');
  return result;
}

/** @param {unknown} error */
function errorCode(error) {
  return error && typeof error === 'object' && 'code' in error ? error.code : '';
}

/** @param {unknown} error */
function commandOutput(error) {
  if (!error || typeof error !== 'object') return '';
  const stdout = 'stdout' in error ? String(error.stdout || '') : '';
  const stderr = 'stderr' in error ? String(error.stderr || '') : '';
  return `${stdout}\n${stderr}`;
}

/** @param {unknown} error */
function serveApprovalUrl(error) {
  return commandOutput(error).match(
    /https:\/\/login\.tailscale\.com\/f\/serve\?node=[A-Za-z0-9_-]+/,
  )?.[0];
}

/** @param {string[]} args @param {Execute} execute @param {number} timeout */
async function runTailscale(args, execute = executeFile, timeout = 30_000) {
  for (const executable of candidates()) {
    try {
      return await execute(executable, args, {
        timeout,
        windowsHide: true,
        maxBuffer: 1_000_000,
      });
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') throw error;
    }
  }
  throw new Error("Tailscale n'est pas installé.");
}

/** @param {string} stdout */
function statusFromJson(stdout) {
  const status = JSON.parse(stdout);
  const dnsName = String(status.Self?.DNSName || '').replace(/\.$/, '');
  return {
    installed: true,
    connected: status.BackendState === 'Running' && Boolean(dnsName),
    dnsName,
    serverUrl: dnsName ? `https://${dnsName}` : '',
  };
}

/** @param {Execute} execute */
export async function tailscaleStatus(execute = executeFile) {
  try {
    const { stdout } = await runTailscale(['status', '--json'], execute);
    return statusFromJson(stdout);
  } catch (error) {
    const message =
      errorCode(error) === 'ENOENT' || error instanceof SyntaxError
        ? 'Tailscale est indisponible.'
        : error instanceof Error
          ? error.message
          : 'Tailscale est indisponible.';
    return {
      installed: message !== "Tailscale n'est pas installé.",
      connected: false,
      dnsName: '',
      serverUrl: '',
      error: message,
    };
  }
}

/** @param {number} port @param {Execute} execute */
export async function enableTailscaleServe(port, execute = executeFile) {
  const status = await tailscaleStatus(execute);
  if (!status.installed) throw new Error("Tailscale n'est pas installé.");
  if (!status.connected) throw new Error("Connectez d'abord ce PC à Tailscale.");
  try {
    await runTailscale(['serve', '--bg', `http://127.0.0.1:${Number(port)}`], execute, 5_000);
  } catch (error) {
    const approvalUrl = serveApprovalUrl(error);
    if (approvalUrl) {
      return { ...status, enabled: false, needsApproval: true, approvalUrl };
    }
    throw new Error(
      errorCode(error) === 'ETIMEDOUT'
        ? "Tailscale n'a pas répondu. Réessayez après avoir redémarré Tailscale."
        : "Tailscale Serve n'a pas pu être activé.",
      { cause: error },
    );
  }
  return { ...status, enabled: true };
}
