const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wattelierConnect', {
  submit: (input) =>
    ipcRenderer.invoke('wattelier:connect-submit', {
      token: String(input?.token || ''),
      serverUrl: String(input?.serverUrl || ''),
    }),
  cancel: () => ipcRenderer.send('wattelier:connect-cancel'),
});
