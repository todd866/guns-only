/**
 * In-app ("embedded") browser detection and escape routes.
 *
 * WHY THIS EXISTS. Shell-health telemetry says every organic mobile arrival we have measured came
 * from a social app's built-in webview, and that is where they die: Build 263 logged three Threads
 * ("Barcelona") sessions that never reached `bridge_ready` plus one hard
 * `Error creating WebGL context.`, and Build 264's only mobile arrival was an Instagram webview
 * stuck at `script_load`. Those webviews cut the memory, GPU and JIT a page may use, so a WASM
 * flight kernel plus a WebGL scene is exactly the workload they refuse. The product answer is not
 * to make them work; it is to notice, say so, and hand the player a way out.
 *
 * DESIGN: two independent tiers of evidence, never one regex.
 *
 *   1. NAMED tokens — the vendor stamps its app into the UA (Instagram, Barcelona, FBAN, ...).
 *      Precise: it gives us a human app name to put on screen and to bucket in telemetry.
 *   2. STRUCTURAL signals — brand-free facts about the engine that hold for webviews whose vendor
 *      we have never heard of. Android stamps `; wv` into every WebView UA, and an iOS UA that is
 *      WebKit + Mobile but carries no `Safari/` token is by construction a WKWebView hosted by
 *      some app. A social network we have never seen shipping a new browser is still caught.
 *
 * Tier 2 is the part that keeps this from rotting. Tier 1 alone would need an edit every time a
 * vendor renames its webview, which is precisely how the Threads/"Barcelona" population went
 * unnamed for a release.
 */

/**
 * Named app tokens, most specific first. `test` runs against the raw user-agent string.
 * `label` is the human name shown to the player, so it is the vendor's product name, not our slug.
 */
const NAMED_APPS = Object.freeze([
  // Threads ships as "Barcelona", its internal codename. This is the population from Build 263.
  { app: "threads", label: "Threads", test: /\bBarcelona\b|\bThreads(?:App)?\b/i },
  { app: "instagram", label: "Instagram", test: /\bInstagram\b/i },
  { app: "facebook", label: "Facebook", test: /\bFBAN\/|\bFBAV\/|\bFB_IAB\b|\bFBIOS\b|\bFB4A\b|\bFBDV\/|\bFacebookExternalHit\b/i },
  { app: "messenger", label: "Messenger", test: /\bMessengerLite\b|\bMessenger(?:ForiOS)?\//i },
  { app: "tiktok", label: "TikTok", test: /\bTikTok\b|BytedanceWebview|\bmusical_ly\b|\bByteLocale\b/i },
  { app: "twitter", label: "X", test: /\bTwitter(?:Android|ForiPhone|ForiPad)?[\s/]|\bTwitterAndroid\b/i },
  { app: "linkedin", label: "LinkedIn", test: /\bLinkedInApp\b|\bLinkedIn\//i },
  { app: "snapchat", label: "Snapchat", test: /\bSnapchat\b/i },
  { app: "pinterest", label: "Pinterest", test: /\bPinterest\b/i },
  { app: "reddit", label: "Reddit", test: /\bReddit\b/i },
  { app: "discord", label: "Discord", test: /\bDiscord\b/i },
  { app: "slack", label: "Slack", test: /\bSlack\b/i },
  { app: "wechat", label: "WeChat", test: /\bMicroMessenger\b/i },
  { app: "line", label: "LINE", test: /\bLine\//i },
  { app: "kakaotalk", label: "KakaoTalk", test: /\bKAKAOTALK\b/i },
  { app: "google-app", label: "the Google app", test: /\bGSA\/|\bGoogleApp\//i },
  { app: "electron", label: "an embedded app window", test: /\bElectron\//i },
]);

/** UA families that are real standalone browsers and must never be mistaken for a webview. */
const STANDALONE_IOS_BROWSERS = /\bCriOS\/|\bFxiOS\/|\bEdgiOS\/|\bOPiOS\/|\bDuckDuckGo\/|\bYaBrowser\//i;

function detectOs(ua) {
  if (/\b(iPhone|iPad|iPod)\b/i.test(ua)) return "ios";
  // iPadOS 13+ reports as Macintosh; the touch-point probe is the only way to tell them apart.
  if (/\bAndroid\b/i.test(ua)) return "android";
  if (/\bWindows\b|\bMacintosh\b|\bCrOS\b|\bLinux\b/i.test(ua)) return "desktop";
  return "unknown";
}

/**
 * Classify the browser this document is running inside.
 *
 * @param {object} options
 * @param {string} options.userAgent Raw navigator.userAgent.
 * @param {number} [options.maxTouchPoints] navigator.maxTouchPoints, for iPadOS desktop-mode UAs.
 * @returns {{embedded: boolean, app: string, label: string, os: string,
 *            confidence: "named"|"structural"|"none", signals: string[]}}
 */
export function detectEmbeddedBrowser({ userAgent = "", maxTouchPoints = 0 } = {}) {
  const ua = String(userAgent || "");
  const signals = [];
  let os = detectOs(ua);
  if (os === "desktop" && /\bMacintosh\b/i.test(ua) && Number(maxTouchPoints) > 1) {
    os = "ios";
    signals.push("ipados-desktop-ua");
  }

  const named = NAMED_APPS.find((entry) => entry.test.test(ua));
  if (named) {
    signals.push(`ua-token:${named.app}`);
    return Object.freeze({
      embedded: true,
      app: named.app,
      label: named.label,
      os,
      confidence: "named",
      signals: Object.freeze(signals),
    });
  }

  // Structural tier. Android WebView is self-declaring; iOS webviews are identified by absence.
  if (os === "android" && /;\s*wv[;)]/i.test(ua)) {
    signals.push("android-wv-token");
    return Object.freeze({
      embedded: true,
      app: "android-webview",
      label: "this app's built-in browser",
      os,
      confidence: "structural",
      signals: Object.freeze(signals),
    });
  }

  if (os === "ios" && /AppleWebKit/i.test(ua) && !STANDALONE_IOS_BROWSERS.test(ua)
    && !/\bSafari\//i.test(ua)) {
    // Every shipping iOS browser appends `Safari/<version>`; a WKWebView embedded in an app does
    // not. This is the only brand-free tell iOS gives us, and it is a reliable one.
    signals.push("ios-webkit-without-safari-token");
    return Object.freeze({
      embedded: true,
      app: "ios-webview",
      label: "this app's built-in browser",
      os,
      confidence: "structural",
      signals: Object.freeze(signals),
    });
  }

  return Object.freeze({
    embedded: false,
    app: "none",
    label: "",
    os,
    confidence: "none",
    signals: Object.freeze(signals),
  });
}

/**
 * How a player gets out of the webview and into a real browser.
 *
 * iOS gives a page no way to hand a URL to Safari — there is no API, and no permission that grants
 * one. So iOS is a COPY + INSTRUCT route: an `x-safari-https:` link is attempted because several
 * webviews honour it, but it is offered as a bonus and the manual step is always shown, because a
 * scheme the host does not register fails silently and a silent failure is the bug we are fixing.
 * Android really can escape: an `intent://` URL with an https fallback hands the link to the
 * system's default browser.
 */
export function embeddedEscapeRoute(url, detection = {}) {
  const target = String(url || "");
  let parsed = null;
  try {
    parsed = new URL(target);
  } catch {
    parsed = null;
  }
  const os = detection.os || "unknown";
  const label = detection.label || "this app's built-in browser";

  if (os === "android" && parsed && parsed.protocol === "https:") {
    const tail = `${parsed.host}${parsed.pathname}${parsed.search}`;
    return Object.freeze({
      kind: "intent",
      href: `intent://${tail}#Intent;scheme=https;action=android.intent.action.VIEW;`
        + `S.browser_fallback_url=${encodeURIComponent(target)};end`,
      actionLabel: "Open in Chrome",
      copyUrl: target,
      steps: Object.freeze([
        `If that button does nothing, tap the ⋮ menu at the top of ${label} and choose `
          + "“Open in browser”.",
        "Or copy the link below and paste it into Chrome.",
      ]),
    });
  }

  if (os === "ios") {
    return Object.freeze({
      kind: "safari-scheme",
      href: parsed && parsed.protocol === "https:"
        ? `x-safari-https://${parsed.host}${parsed.pathname}${parsed.search}`
        : target,
      actionLabel: "Open in Safari",
      copyUrl: target,
      steps: Object.freeze([
        `iOS will not let a page open Safari for you. Tap the ••• or share button in `
          + `${label}, then choose “Open in Safari”.`,
        "Or copy the link below and paste it into Safari.",
      ]),
    });
  }

  return Object.freeze({
    kind: "manual",
    href: target,
    actionLabel: "Open in your browser",
    copyUrl: target,
    steps: Object.freeze([
      "Copy the link below and open it in Chrome, Safari, Firefox or Edge.",
    ]),
  });
}
