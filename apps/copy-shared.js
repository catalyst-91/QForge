// Copies apps/shared into an app folder before it runs or is packaged (one source for both apps).
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, 'shared');
const dst = path.join(process.cwd(), 'shared');
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true });
// NDI®: the page-side helpers and the native loader are shared with the main QForge app
fs.copyFileSync(path.join(__dirname, '..', 'src', 'ndi.js'), path.join(dst, 'ndi.js'));
fs.copyFileSync(path.join(__dirname, '..', 'native', 'ndi', 'index.js'), path.join(dst, 'ndi-native.js'));
// updates from GitHub releases: same module as the main QForge app
fs.copyFileSync(path.join(__dirname, '..', 'lib', 'updater.js'), path.join(dst, 'updater.js'));
console.log(`shared files copied to ${dst}`);
