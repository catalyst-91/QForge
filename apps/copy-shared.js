// Copies apps/shared into an app folder before it runs or is packaged (one source for both apps).
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, 'shared');
const dst = path.join(process.cwd(), 'shared');
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true });
console.log(`shared files copied to ${dst}`);
