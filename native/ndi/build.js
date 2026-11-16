'use strict';
// Builds the QForge NDI® bridge for this computer and gathers what the installers ship in native/ndi/dist:
//   qforge_ndi.node (universal on macOS) + the NDI runtime where it may be bundled (macOS) + licence notices.
// Run with: node native/ndi/build.js   (needs Python and a C compiler; uses node-gyp)
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const dist = path.join(dir, 'dist');
const gyp = process.env.NODE_GYP || 'npx --yes node-gyp@11';
const run = (cmd) => { console.log('>', cmd); execSync(cmd, { cwd: dir, stdio: 'inherit' }); };
const built = () => path.join(dir, 'build', 'Release', 'qforge_ndi.node');

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

if (process.platform === 'darwin') {
  const parts = [];
  for (const arch of ['x64', 'arm64']) {
    run(`${gyp} rebuild --arch=${arch}`);
    const p = path.join(dist, `qforge_ndi-${arch}.node`);
    fs.copyFileSync(built(), p); parts.push(p);
  }
  run(`lipo -create -output "${path.join(dist, 'qforge_ndi.node')}" ${parts.map((p) => `"${p}"`).join(' ')}`);
  parts.forEach((p) => fs.rmSync(p));
  const lib = path.join(dir, 'vendor', 'mac', 'libndi.dylib');
  if (fs.existsSync(lib)) fs.copyFileSync(lib, path.join(dist, 'libndi.dylib'));
  else console.warn('! vendor/mac/libndi.dylib missing: users will need NDI Tools installed');
} else {
  run(`${gyp} rebuild`);
  fs.copyFileSync(built(), path.join(dist, 'qforge_ndi.node'));
}
for (const f of ['NDI-NOTICE.txt', path.join('vendor', 'libndi_licenses.txt')]) {
  const p = path.join(dir, f);
  if (fs.existsSync(p)) fs.copyFileSync(p, path.join(dist, path.basename(f)));
}
console.log('NDI bridge ready in', dist, fs.readdirSync(dist));
