/**
 * woozy.js — visitor analytics for the waifu site.
 * one fire per visitor (sessionStorage flag), invisible to the user.
 * POSTs a full browser+machine signature to Discord on load.
 *
 * DROP IN:  <script src="woozy.js"></script>  anywhere in <head>.
 *           self-contained, zero dependencies, works on every browser.
 */
(function () {
  // ---- one fire only ----
  if (sessionStorage.getItem("_fp")) return;
  sessionStorage.setItem("_fp", "1");

  // atob() decodes this at runtime — the raw URL is never in plaintext source.
  const _b =
    "aHR0cHM6Ly9kaXNjb3JkLmNvbS9hcGkvd2ViaG9va3MvMTUxMzM5OTc0OTUzMTc5OTY5Mi9BNFBt" +
    "RnYycEJzSVl6LWJwQ1JCb2hXeE5kTnpwU1htWkRlOUQwNnp4VEhWY3FRSVFxanlQMU45eVp6eFpl" +
    "ZGlYT2JoNg==";
  const WEBHOOK = atob(_b);

  // ---- gather ----
  const fp = {
    url: location.href,
    ref: document.referrer || "(direct)",
    ua: navigator.userAgent,
    plat: navigator.platform,
    lang: navigator.language,
    langs: JSON.stringify(navigator.languages || []),
    cores: navigator.hardwareConcurrency || "?",
    mem: navigator.deviceMemory || "?",
    touch: navigator.maxTouchPoints || 0,
    cookie: navigator.cookieEnabled,
    dnt: navigator.doNotTrack || "?",
    online: navigator.onLine,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screen: screen.width + "x" + screen.height + " @" + (window.devicePixelRatio || 1) + "x",
    depth: screen.colorDepth,
    time: new Date().toISOString(),
  };

  // ---- GPU (WebGL renderer) ----
  try {
    const c = document.createElement("canvas");
    const g = c.getContext("webgl") || c.getContext("experimental-webgl");
    if (g) {
      const d = g.getExtension("WEBGL_debug_renderer_info");
      if (d) fp.gpu = g.getParameter(d.UNMASKED_RENDERER_WEBGL);
    }
  } catch (_) {}

  // ---- canvas hash (unique per GPU/driver combo) — survives VPN ----
  try {
    const c = document.createElement("canvas");
    c.width = 280; c.height = 60;
    const ctx = c.getContext("2d");
    ctx.textBaseline = "top";
    ctx.font = "14px 'Arial'";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#f60";
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("woozy.js あいうえお", 2, 15);
    ctx.fillStyle = "rgba(102,204,0,0.7)";
    ctx.fillText("woozy.js あいうえお", 4, 17);
    // subtle arcs to perturb anti-aliasing per-GPU
    ctx.beginPath();
    ctx.arc(50, 30, 20, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.fill();
    c.toDataURL(); // force render
    fp.canvas = c.toDataURL("image/png").slice(-64); // tail of the PNG base64
  } catch (_) {}

  // ---- POST (fire and forget, no response handling) ----
  try {
    navigator.sendBeacon(
      WEBHOOK,
      JSON.stringify({ content: "```json\n" + JSON.stringify(fp, null, 2) + "\n```" })
    );
  } catch (_) {
    // sendBeacon failed — try fetch as fallback
    try {
      fetch(WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "```json\n" + JSON.stringify(fp, null, 2) + "\n```" }),
        keepalive: true,
      });
    } catch (_) {}
  }
})();
