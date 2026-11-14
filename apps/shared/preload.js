'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('client', {
  net: () => ipcRenderer.invoke('client:net'),
  displays: () => ipcRenderer.invoke('client:displays'),
  place: (opts) => ipcRenderer.invoke('client:place', opts),
  fullscreen: (on) => ipcRenderer.invoke('client:fullscreen', on),
  loginItem: (on) => ipcRenderer.invoke('client:login-item', on),
  awake: (on) => ipcRenderer.invoke('client:awake', on),
  newWindow: () => ipcRenderer.invoke('client:new-window'),
  title: (t) => ipcRenderer.invoke('client:title', t),
  onMenu: (cb) => ipcRenderer.on('client:menu', () => cb()),
  onReconnect: (cb) => ipcRenderer.on('client:reconnect', () => cb()),
});
