'use strict';
// Double-click the output window to toggle full screen (the desktop app places it automatically).
document.addEventListener('dblclick', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
});
