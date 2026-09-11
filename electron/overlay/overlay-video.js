(function attachOverlayVideo(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CheckpointOverlayVideo = api;
})(typeof window !== "undefined" ? window : globalThis, function createApi() {
  const sources = {
    social: "../src/assets/hedrabionics_pindown.io.mp4",
    achievement: "../src/assets/Overlay_Background.mp4",
  };

  const createOverlayVideoLayer = (kind, documentRef = document) => {
    const source = sources[kind];
    if (!source) throw new TypeError(`Unsupported overlay video kind: ${kind}`);

    const layer = documentRef.createElement("div");
    layer.className = `overlay-video-layer overlay-video-${kind}`;
    layer.setAttribute("aria-hidden", "true");

    const video = documentRef.createElement("video");
    video.className = "overlay-video is-rotated";
    video.src = source;
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.tabIndex = -1;

    const scrim = documentRef.createElement("span");
    scrim.className = "overlay-video-scrim";
    layer.append(video, scrim);
    return layer;
  };

  const appendOverlayVideoLayer = (shell, kind, documentRef = document) => {
    const layer = createOverlayVideoLayer(kind, documentRef);
    shell.prepend(layer);
    return layer;
  };

  return { createOverlayVideoLayer, appendOverlayVideoLayer };
});
