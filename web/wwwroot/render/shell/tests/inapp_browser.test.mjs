import test from "node:test";
import assert from "node:assert/strict";

import { detectEmbeddedBrowser, embeddedEscapeRoute } from "../inapp_browser.js";

// The two user agents shell-health actually recorded dying in production, verbatim in shape.
const THREADS_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15"
  + " (KHTML, like Gecko) Mobile/15E148 [FBAN/Barcelona;FBAV/342.0.0.30.106;]";
const INSTAGRAM_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15"
  + " (KHTML, like Gecko) Mobile/15E148 Instagram 302.0.0.23.113 (iPhone13,2; iOS 16_6; en_US)";
const FACEBOOK_ANDROID = "Mozilla/5.0 (Linux; Android 13; SM-A536B Build/TP1A.220624.014; wv)"
  + " AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/119.0.0.0 Mobile Safari/537.36"
  + " [FB_IAB/FB4A;FBAV/440.0.0.30.111;]";
const TIKTOK_ANDROID = "Mozilla/5.0 (Linux; Android 12; V2027 Build/SP1A.210812.003; wv)"
  + " AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/107.0.0.0 Mobile Safari/537.36"
  + " musical_ly_2022803040 JsSdk/1.0 NetType/WIFI BytedanceWebview/d8a21c6";
const SAFARI_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15"
  + " (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const CHROME_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15"
  + " (KHTML, like Gecko) CriOS/125.0.6422.80 Mobile/15E148 Safari/604.1";
const CHROME_ANDROID = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36"
  + " (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36";
const CHROME_DESKTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
  + " (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

test("the Threads webview is named, not lumped in with Facebook", () => {
  const detection = detectEmbeddedBrowser({ userAgent: THREADS_IOS });
  assert.equal(detection.embedded, true);
  assert.equal(detection.app, "threads",
    "Threads stamps FBAN/Barcelona; the codename must win over the Facebook token");
  assert.equal(detection.label, "Threads");
  assert.equal(detection.os, "ios");
  assert.equal(detection.confidence, "named");
});

test("the Instagram webview from the Build 264 arrival is detected", () => {
  const detection = detectEmbeddedBrowser({ userAgent: INSTAGRAM_IOS });
  assert.equal(detection.embedded, true);
  assert.equal(detection.app, "instagram");
  assert.equal(detection.os, "ios");
});

test("named Android webviews are detected with their app", () => {
  assert.equal(detectEmbeddedBrowser({ userAgent: FACEBOOK_ANDROID }).app, "facebook");
  assert.equal(detectEmbeddedBrowser({ userAgent: TIKTOK_ANDROID }).app, "tiktok");
});

test("an unnamed webview is still caught by structural signals", () => {
  // The whole point of tier 2: a social app we have never heard of ships a webview tomorrow and
  // the player still gets the fallback rather than a blank sky.
  const android = detectEmbeddedBrowser({
    userAgent: "Mozilla/5.0 (Linux; Android 14; Nothing A065 Build/UP1A; wv) AppleWebKit/537.36"
      + " (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 SomeNewApp/3.1",
  });
  assert.equal(android.embedded, true);
  assert.equal(android.app, "android-webview");
  assert.equal(android.confidence, "structural");

  const ios = detectEmbeddedBrowser({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15"
      + " (KHTML, like Gecko) Mobile/15E148",
  });
  assert.equal(ios.embedded, true, "WebKit + Mobile with no Safari token is a WKWebView");
  assert.equal(ios.app, "ios-webview");
  assert.equal(ios.confidence, "structural");
});

test("real browsers are never accused of being webviews", () => {
  for (const ua of [SAFARI_IOS, CHROME_IOS, CHROME_ANDROID, CHROME_DESKTOP]) {
    const detection = detectEmbeddedBrowser({ userAgent: ua });
    assert.equal(detection.embedded, false, `false positive on ${ua}`);
    assert.equal(detection.app, "none");
  }
});

test("iPadOS reporting a desktop user agent is still classified as iOS", () => {
  const detection = detectEmbeddedBrowser({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15"
      + " (KHTML, like Gecko) Instagram 300.0",
    maxTouchPoints: 5,
  });
  assert.equal(detection.os, "ios");
});

test("Android gets a real escape: an intent URL with an https fallback", () => {
  const route = embeddedEscapeRoute("https://guns-only.com/?beat=3",
    detectEmbeddedBrowser({ userAgent: FACEBOOK_ANDROID }));
  assert.equal(route.kind, "intent");
  assert.match(route.href, /^intent:\/\/guns-only\.com\/\?beat=3#Intent;/);
  assert.match(route.href, /scheme=https;/);
  assert.match(route.href, /S\.browser_fallback_url=https%3A%2F%2Fguns-only\.com/);
  assert.equal(route.copyUrl, "https://guns-only.com/?beat=3");
});

test("iOS gets instructions and a copyable URL, because it cannot be forced", () => {
  const route = embeddedEscapeRoute("https://guns-only.com/",
    detectEmbeddedBrowser({ userAgent: THREADS_IOS }));
  assert.equal(route.kind, "safari-scheme");
  assert.equal(route.copyUrl, "https://guns-only.com/");
  assert.ok(route.steps.length >= 2, "the manual route must always be spelled out on iOS");
  assert.match(route.steps.join(" "), /Open in Safari/,
    "the instruction must name the menu item the player is looking for");
  assert.match(route.steps.join(" "), /Threads/,
    "naming the app the player is trapped in is what makes the instruction followable");
});
