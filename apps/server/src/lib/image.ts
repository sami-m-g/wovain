/* oxlint-disable no-bitwise -- image headers pack sizes and flags into bit fields */
// Reads width, height and transparency from an image's header bytes.
// Covers what ChatGPT and fal return (PNG, JPEG, WebP) without an image library.

export interface ImageInfo {
  format: "png" | "jpeg" | "webp";
  height: number;
  transparent: boolean;
  width: number;
}

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
// PNG color types with an alpha channel: grayscale+alpha, RGBA.
const PNG_ALPHA_TYPES = new Set([4, 6]);
const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCodePoint(...bytes.subarray(start, start + length));

const readPng = (bytes: Uint8Array, view: DataView): ImageInfo | undefined => {
  if (!PNG_SIGNATURE.equals(bytes.subarray(0, PNG_SIGNATURE.length))) {
    return undefined;
  }
  // IHDR is always first; a tRNS chunk can also add transparency.
  const colorType = bytes[25] ?? 0;
  return {
    format: "png",
    height: view.getUint32(20),
    transparent:
      PNG_ALPHA_TYPES.has(colorType) ||
      new TextDecoder("latin1").decode(bytes).includes("tRNS"),
    width: view.getUint32(16),
  };
};

const readJpeg = (bytes: Uint8Array, view: DataView): ImageInfo | undefined => {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return undefined;
  }
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      return undefined;
    }
    const marker = bytes[offset + 1] ?? 0;
    if (JPEG_SOF_MARKERS.has(marker)) {
      return {
        format: "jpeg",
        height: view.getUint16(offset + 5),
        transparent: false,
        width: view.getUint16(offset + 7),
      };
    }
    offset += 2 + view.getUint16(offset + 2);
  }
  return undefined;
};

const readWebp = (bytes: Uint8Array, view: DataView): ImageInfo | undefined => {
  if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") {
    return undefined;
  }
  const chunk = ascii(bytes, 12, 4);
  if (chunk === "VP8X") {
    const flags = bytes[20] ?? 0;
    const width = 1 + (view.getUint32(24, true) & 0xff_ff_ff);
    const height = 1 + (view.getUint32(27, true) & 0xff_ff_ff);
    return { format: "webp", height, transparent: (flags & 0x10) !== 0, width };
  }
  if (chunk === "VP8L") {
    const bits = view.getUint32(21, true);
    return {
      format: "webp",
      height: 1 + ((bits >> 14) & 0x3f_ff),
      transparent: ((bits >> 28) & 1) === 1,
      width: 1 + (bits & 0x3f_ff),
    };
  }
  if (chunk === "VP8 ") {
    return {
      format: "webp",
      height: view.getUint16(28, true) & 0x3f_ff,
      transparent: false,
      width: view.getUint16(26, true) & 0x3f_ff,
    };
  }
  return undefined;
};

export const readImageInfo = (bytes: Uint8Array): ImageInfo | undefined => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return readPng(bytes, view) ?? readJpeg(bytes, view) ?? readWebp(bytes, view);
};
