import { Blob as NodeBlob } from "node:buffer";
import { encodePngRgba } from "./png.mjs";

function parseHexColor(value) {
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) return [0, 0, 0, 255];
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
    255,
  ];
}

class DeterministicImageData {
  constructor(data, width, height) {
    this.data = data instanceof Uint8ClampedArray ? data : new Uint8ClampedArray(data);
    this.width = width;
    this.height = height;
  }
}

class DeterministicCanvasContext {
  constructor(canvas) {
    this.canvas = canvas;
    this.fillStyle = "#000000";
  }

  translate() {}
  scale() {}

  fillRect(x, y, width, height) {
    const color = parseHexColor(this.fillStyle);
    const pixels = this.canvas.pixels;
    for (let targetY = Math.max(0, y); targetY < Math.min(this.canvas.height, y + height); targetY++) {
      for (let targetX = Math.max(0, x); targetX < Math.min(this.canvas.width, x + width); targetX++) {
        pixels.set(color, (targetY * this.canvas.width + targetX) * 4);
      }
    }
  }

  putImageData(image, x, y) {
    const source = image.data;
    for (let sourceY = 0; sourceY < image.height; sourceY++) {
      const targetY = y + sourceY;
      if (targetY < 0 || targetY >= this.canvas.height) continue;
      for (let sourceX = 0; sourceX < image.width; sourceX++) {
        const targetX = x + sourceX;
        if (targetX < 0 || targetX >= this.canvas.width) continue;
        const sourceOffset = (sourceY * image.width + sourceX) * 4;
        const targetOffset = (targetY * this.canvas.width + targetX) * 4;
        this.canvas.pixels.set(source.subarray(sourceOffset, sourceOffset + 4), targetOffset);
      }
    }
  }

  getImageData(x, y, width, height) {
    const result = new Uint8ClampedArray(width * height * 4);
    for (let targetY = 0; targetY < height; targetY++) {
      for (let targetX = 0; targetX < width; targetX++) {
        const sourceX = x + targetX;
        const sourceY = y + targetY;
        if (sourceX < 0 || sourceY < 0 || sourceX >= this.canvas.width || sourceY >= this.canvas.height) continue;
        const sourceOffset = (sourceY * this.canvas.width + sourceX) * 4;
        result.set(this.canvas.pixels.subarray(sourceOffset, sourceOffset + 4), (targetY * width + targetX) * 4);
      }
    }
    return new DeterministicImageData(result, width, height);
  }

  drawImage(image, _x, _y, width = image.width, height = image.height) {
    if (!image?.data || !Number.isInteger(image.width) || !Number.isInteger(image.height)) {
      throw new Error("Deterministic asset export only supports DataTexture-backed images");
    }
    const result = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      const sourceY = Math.min(image.height - 1, Math.floor(y / height * image.height));
      for (let x = 0; x < width; x++) {
        const sourceX = Math.min(image.width - 1, Math.floor(x / width * image.width));
        const sourceOffset = (sourceY * image.width + sourceX) * 4;
        result.set(image.data.subarray(sourceOffset, sourceOffset + 4), (y * width + x) * 4);
      }
    }
    this.putImageData(new DeterministicImageData(result, width, height), 0, 0);
  }
}

class DeterministicOffscreenCanvas {
  constructor(width, height) {
    this._width = width;
    this._height = height;
    this._pixels = new Uint8ClampedArray(width * height * 4);
    this._context = new DeterministicCanvasContext(this);
  }

  get width() { return this._width; }
  set width(value) { this._width = value; this.#resize(); }
  get height() { return this._height; }
  set height(value) { this._height = value; this.#resize(); }
  get pixels() { return this._pixels; }

  #resize() {
    this._pixels = new Uint8ClampedArray(Math.max(0, this._width * this._height * 4));
  }

  getContext(kind) {
    if (kind !== "2d") return null;
    return this._context;
  }

  async convertToBlob(options = {}) {
    const BlobConstructor = globalThis.Blob ?? NodeBlob;
    return new BlobConstructor([encodePngRgba(this.width, this.height, new Uint8Array(this.pixels))], {
      type: options.type ?? "image/png",
    });
  }
}

/** Installs the minimal deterministic canvas API GLTFExporter needs in Node. */
export function installDeterministicImageCanvas() {
  if (typeof globalThis.document !== "undefined" || typeof globalThis.OffscreenCanvas !== "undefined") return false;
  globalThis.OffscreenCanvas = DeterministicOffscreenCanvas;
  if (typeof globalThis.ImageData === "undefined") globalThis.ImageData = DeterministicImageData;
  return true;
}
