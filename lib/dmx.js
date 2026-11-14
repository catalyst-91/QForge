'use strict';
// Art-Net (ArtDMX) and sACN (E1.31) senders — no dependencies.
const dgram = require('dgram');
const crypto = require('crypto');

const CID = crypto.randomBytes(16);
const SOURCE_NAME = 'QForge';

function artDmxPacket(universe, data, seq) {
  const buf = Buffer.alloc(18 + 512);
  buf.write('Art-Net\0', 0, 'ascii');
  buf.writeUInt16LE(0x5000, 8);       // OpDmx
  buf.writeUInt16BE(14, 10);          // protocol version
  buf[12] = seq & 0xff;               // sequence
  buf[13] = 0;                        // physical
  buf[14] = universe & 0xff;          // SubUni
  buf[15] = (universe >> 8) & 0x7f;   // Net
  buf.writeUInt16BE(512, 16);
  for (let i = 0; i < 512; i++) buf[18 + i] = data[i] | 0;
  return buf;
}

function sacnPacket(universe, data, seq, priority = 100) {
  const buf = Buffer.alloc(638);
  // Root layer
  buf.writeUInt16BE(0x0010, 0);
  buf.writeUInt16BE(0x0000, 2);
  buf.write('ASC-E1.17\0\0\0', 4, 'ascii');
  buf.writeUInt16BE(0x7000 | (638 - 16), 16);
  buf.writeUInt32BE(0x00000004, 18);
  CID.copy(buf, 22);
  // Framing layer
  buf.writeUInt16BE(0x7000 | (638 - 38), 38);
  buf.writeUInt32BE(0x00000002, 40);
  buf.write(SOURCE_NAME, 44, 'utf8');
  buf[108] = priority;
  buf.writeUInt16BE(0, 109);           // sync address
  buf[111] = seq & 0xff;
  buf[112] = 0;                        // options
  buf.writeUInt16BE(universe, 113);
  // DMP layer
  buf.writeUInt16BE(0x7000 | (638 - 115), 115);
  buf[117] = 0x02;
  buf[118] = 0xa1;
  buf.writeUInt16BE(0x0000, 119);
  buf.writeUInt16BE(0x0001, 121);
  buf.writeUInt16BE(513, 123);
  buf[125] = 0;                        // start code
  for (let i = 0; i < 512; i++) buf[126 + i] = data[i] | 0;
  return buf;
}

class DmxSender {
  constructor() {
    this.sock = null;
    this.universes = new Map(); // key -> { proto, host, universe, data, seq }
    this.timer = null;
  }
  ensure() {
    if (this.sock) return;
    this.sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.sock.on('error', () => {});
    this.sock.bind(() => { try { this.sock.setBroadcast(true); this.sock.setMulticastTTL(8); } catch { /* ignore */ } });
    // keep-alive refresh (Art-Net nodes expect a frame at least every ~1s)
    this.timer = setInterval(() => { for (const u of this.universes.values()) this.sendOne(u); }, 1000);
  }
  key(proto, host, universe) { return `${proto}|${host || ''}|${universe}`; }
  set(proto, host, universe, data) {
    this.ensure();
    const k = this.key(proto, host, universe);
    let u = this.universes.get(k);
    if (!u) { u = { proto, host, universe: Number(universe) || 0, data: new Uint8Array(512), seq: 1 }; this.universes.set(k, u); }
    for (let i = 0; i < 512; i++) u.data[i] = data[i] | 0;
    this.sendOne(u);
  }
  sendOne(u) {
    if (!this.sock) return;
    u.seq = (u.seq % 255) + 1;
    try {
      if (u.proto === 'sacn') {
        const host = u.host && u.host.trim() ? u.host.trim() : `239.255.${(u.universe >> 8) & 0xff}.${u.universe & 0xff}`;
        this.sock.send(sacnPacket(u.universe, u.data, u.seq), 5568, host);
      } else {
        this.sock.send(artDmxPacket(u.universe, u.data, u.seq), 6454, u.host && u.host.trim() ? u.host.trim() : '255.255.255.255');
      }
    } catch { /* ignore */ }
  }
  close() { clearInterval(this.timer); if (this.sock) try { this.sock.close(); } catch { /* ignore */ } this.sock = null; }
}

module.exports = { DmxSender, artDmxPacket, sacnPacket };
