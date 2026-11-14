'use strict';
// Minimal OSC 1.0 encoder / decoder (no dependencies).

function pad4(n) { return (4 - (n % 4)) % 4; }

function oscString(s) {
  const b = Buffer.from(String(s), 'utf8');
  const len = b.length + 1;
  const out = Buffer.alloc(len + pad4(len));
  b.copy(out);
  return out;
}

function readString(buf, off) {
  let end = off;
  while (end < buf.length && buf[end] !== 0) end++;
  const s = buf.toString('utf8', off, end);
  const len = end - off + 1;
  return [s, off + len + pad4(len)];
}

/**
 * encode('/cue/1/start', [{type:'i', value:1}, {type:'s', value:'hi'}])
 * Supported types: i (int32), f (float32), s (string), T, F, N
 */
function encode(address, args = []) {
  let tags = ',';
  const parts = [];
  for (const a of args) {
    switch (a.type) {
      case 'i': { const b = Buffer.alloc(4); b.writeInt32BE(Math.trunc(Number(a.value)) | 0); parts.push(b); tags += 'i'; break; }
      case 'f': { const b = Buffer.alloc(4); b.writeFloatBE(Number(a.value)); parts.push(b); tags += 'f'; break; }
      case 's': parts.push(oscString(a.value)); tags += 's'; break;
      case 'T': tags += 'T'; break;
      case 'F': tags += 'F'; break;
      case 'N': tags += 'N'; break;
      default: parts.push(oscString(a.value)); tags += 's';
    }
  }
  return Buffer.concat([oscString(address), oscString(tags), ...parts]);
}

function decodeInto(buf, out) {
  if (buf.length >= 8 && buf.toString('utf8', 0, 8) === '#bundle\0') {
    let off = 16; // "#bundle\0" + 8-byte timetag
    while (off + 4 <= buf.length) {
      const size = buf.readInt32BE(off); off += 4;
      if (size <= 0 || off + size > buf.length) break;
      decodeInto(buf.subarray(off, off + size), out);
      off += size;
    }
    return;
  }
  let [address, off] = readString(buf, 0);
  if (!address.startsWith('/')) return;
  let tags = '';
  if (off < buf.length && buf[off] === 0x2c) { [tags, off] = readString(buf, off); tags = tags.slice(1); }
  const args = [];
  for (const t of tags) {
    switch (t) {
      case 'i': args.push(buf.readInt32BE(off)); off += 4; break;
      case 'f': args.push(buf.readFloatBE(off)); off += 4; break;
      case 'd': args.push(buf.readDoubleBE(off)); off += 8; break;
      case 'h': args.push(Number(buf.readBigInt64BE(off))); off += 8; break;
      case 't': off += 8; args.push(null); break;
      case 's': case 'S': { const r = readString(buf, off); args.push(r[0]); off = r[1]; break; }
      case 'b': { const n = buf.readInt32BE(off); off += 4; args.push(null); off += n + pad4(n); break; }
      case 'c': args.push(String.fromCharCode(buf.readInt32BE(off))); off += 4; break;
      case 'r': case 'm': off += 4; args.push(null); break;
      case 'T': args.push(true); break;
      case 'F': args.push(false); break;
      case 'N': args.push(null); break;
      case 'I': args.push(Infinity); break;
      default: break;
    }
  }
  out.push({ address, args });
}

function decode(buf) { const out = []; decodeInto(buf, out); return out; }

module.exports = { encode, decode };
