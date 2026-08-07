const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wattelierConnect', {
  submit: (token) => ipcRenderer.invoke('wattelier:connect-submit', String(token)),
  cancel: () => ipcRenderer.send('wattelier:connect-cancel'),
});
