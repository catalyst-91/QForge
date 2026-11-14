'use strict';
// Serves the app UI and local media files over the privileged "qp://" scheme.
//   qp://app/index.html            -> <app>/src/index.html
//   qp://app/__media/<encodedPath> -> any local file (with HTTP Range support for video seeking)
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp', '.ico': 'image/x-icon',
  '.wav': 'audio/wav', '.wave': 'audio/wav', '.mp3': 'audio/mpeg', '.aif': 'audio/aiff', '.aiff': 'audio/aiff',
  '.flac': 'audio/flac', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska',
};

function serveFile(filePath, request) {
  let stat;
  try { stat = fs.statSync(filePath); } catch { return new Response('Not found', { status: 404 }); }
  if (!stat.isFile()) return new Response('Not found', { status: 404 });
  const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' };
  const range = request.headers.get('range');
  if (range && stat.size > 0) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (m) {
      let start, end;
      if (m[1] === '' && m[2] !== '') { start = Math.max(0, stat.size - parseInt(m[2], 10)); end = stat.size - 1; }
      else { start = m[1] ? parseInt(m[1], 10) : 0; end = m[2] ? Math.min(parseInt(m[2], 10), stat.size - 1) : stat.size - 1; }
      if (start > end || start >= stat.size) {
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } });
      }
      headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
      headers['Content-Length'] = String(end - start + 1);
      return new Response(Readable.toWeb(fs.createReadStream(filePath, { start, end })), { status: 206, headers });
    }
  }
  headers['Content-Length'] = String(stat.size);
  return new Response(Readable.toWeb(fs.createReadStream(filePath)), { status: 200, headers });
}

function handleRequest(request, srcDir) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  if (pathname.startsWith('/__media/')) {
    const filePath = decodeURIComponent(pathname.slice('/__media/'.length));
    return serveFile(filePath, request);
  }
  const rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  const full = path.normalize(path.join(srcDir, rel));
  if (!full.startsWith(path.normalize(srcDir + path.sep))) return new Response('Forbidden', { status: 403 });
  return serveFile(full, request);
}

module.exports = { handleRequest, serveFile, MIME };
