'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');

// NDI® (loaded on first use). NDI® is a registered trademark of Vizrt NDI AB — https://ndi.video
let ndiApi = null;
function ndi() {
  if (ndiApi) return ndiApi;
  try { ndiApi = require('./ndi-native.js')({ resourcesPath: process.resourcesPath, appRoot: path.resolve(__dirname, '..', '..', '..') }); }
  catch (e) { const err = { ok: false, error: `NDI unavailable: ${e.message}` }; ndiApi = { status: () => err, find: () => [], connections: () => 0, receiving: () => false, closeAll() {}, createSender() { throw new Error(err.error); }, receive() { throw new Error(err.error); }, sendVideo() {}, sendAudio() {}, destroySender() {}, stopReceive() {} }; }
  return ndiApi;
}
window.addEventListener('beforeunload', () => { if (ndiApi) ndiApi.closeAll(); });

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
  sourceId: () => ipcRenderer.invoke('client:source-id'),
  ndi: {
    status: () => ndi().status(),
    find: (waitMs, extraIps) => ndi().find(waitMs, extraIps),
    createSender: (name) => ndi().createSender(name),
    sendVideo: (id, data, w, h, stride, fourcc, fpsN, fpsD) => ndi().sendVideo(id, data, w, h, stride, fourcc, fpsN, fpsD),
    sendAudio: (id, planar, ch, n, rate) => ndi().sendAudio(id, planar, ch, n, rate),
    connections: (id) => ndi().connections(id),
    destroySender: (id) => ndi().destroySender(id),
    receive: (source, opts, onVideo, onAudio) => ndi().receive(source, opts, onVideo, onAudio),
    receiving: (id) => ndi().receiving(id),
    stopReceive: (id) => ndi().stopReceive(id),
  },
});
