const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wattelierDesktop', {
  getRuntimeInfo: () => ipcRenderer.invoke('wattelier:get-runtime-info'),
  setOpenAtLogin: (enabled) => ipcRenderer.invoke('wattelier:set-open-at-login', Boolean(enabled)),
  setAutomaticUpdates: (enabled) =>
    ipcRenderer.invoke('wattelier:set-automatic-updates', Boolean(enabled)),
  checkForUpdates: () => ipcRenderer.invoke('wattelier:check-for-updates'),
  getTailscaleStatus: () => ipcRenderer.invoke('wattelier:tailscale-status'),
  enableTailscale: () => ipcRenderer.invoke('wattelier:tailscale-enable'),
  resetApplication: () => ipcRenderer.invoke('wattelier:reset-application'),
});
