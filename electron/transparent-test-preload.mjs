import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('transparentTest', {
  close: () => ipcRenderer.invoke('transparent-test:close'),
});
