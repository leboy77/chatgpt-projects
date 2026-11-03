(function attachZipBuilder(root) {
  "use strict";

  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      table[index] = value >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const value of bytes) {
      crc = crcTable[(crc ^ value) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function u16(value) {
    return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
  }

  function u32(value) {
    return new Uint8Array([
      value & 0xff,
      (value >>> 8) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 24) & 0xff,
    ]);
  }

  function concat(chunks) {
    const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const output = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.length;
    }
    return output;
  }

  function dosDateTime(date = new Date()) {
    const time =
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2);
    const day =
      ((date.getFullYear() - 1980) << 9) |
      ((date.getMonth() + 1) << 5) |
      date.getDate();
    return { time, day };
  }

  async function deflateRaw(bytes) {
    if (typeof CompressionStream !== "function") return null;
    const stream = new Blob([bytes])
      .stream()
      .pipeThrough(new CompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function createZip(files) {
    const localChunks = [];
    const entries = [];
    let offset = 0;
    const stamp = dosDateTime();
    for (const file of files) {
      const nameBytes = new TextEncoder().encode(file.name);
      const source = new Uint8Array(await file.arrayBuffer());
      const deflated = await deflateRaw(source);
      const useDeflate = deflated && deflated.length < source.length;
      const body = useDeflate ? deflated : source;
      const crc = crc32(source);
      const method = useDeflate ? 8 : 0;
      const header = concat([
        u32(0x04034b50),
        u16(20),
        u16(0x0800),
        u16(method),
        u16(stamp.time),
        u16(stamp.day),
        u32(crc),
        u32(body.length),
        u32(source.length),
        u16(nameBytes.length),
        u16(0),
        nameBytes,
      ]);
      localChunks.push(header, body);
      entries.push({
        nameBytes,
        crc,
        method,
        compressedSize: body.length,
        size: source.length,
        offset,
      });
      offset += header.length + body.length;
    }

    const centralChunks = [];
    for (const entry of entries) {
      centralChunks.push(
        concat([
          u32(0x02014b50),
          u16(20),
          u16(20),
          u16(0x0800),
          u16(entry.method),
          u16(stamp.time),
          u16(stamp.day),
          u32(entry.crc),
          u32(entry.compressedSize),
          u32(entry.size),
          u16(entry.nameBytes.length),
          u16(0),
          u16(0),
          u16(0),
          u16(0),
          u32(0),
          u32(entry.offset),
          entry.nameBytes,
        ]),
      );
    }
    const central = concat(centralChunks);
    const end = concat([
      u32(0x06054b50),
      u16(0),
      u16(0),
      u16(entries.length),
      u16(entries.length),
      u32(central.length),
      u32(offset),
      u16(0),
    ]);
    return new Blob([...localChunks, central, end], {
      type: "application/zip",
    });
  }

  const api = { createZip, crc32 };
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.VisualForgeZip = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
