"use strict";

const MAX_DATA_IMAGE_CHARACTERS = 1_000_000;
const MAX_URL_CHARACTERS = 4_096;
const SAFE_DATA_IMAGE_PATTERN = /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=\s]+$/i;

const sanitizeOverlayImageSource = (value) => {
  const source = String(value || "").trim();
  if (!source) return "";
  if (source.startsWith("data:")) {
    return source.length <= MAX_DATA_IMAGE_CHARACTERS && SAFE_DATA_IMAGE_PATTERN.test(source)
      ? source
      : "";
  }
  if (source.length > MAX_URL_CHARACTERS) return "";
  try {
    const url = new URL(source);
    return ["https:", "http:", "file:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
};

module.exports = {
  MAX_DATA_IMAGE_CHARACTERS,
  sanitizeOverlayImageSource,
};
