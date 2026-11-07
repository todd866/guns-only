import AppKit
import GameController
import WebKit

// Human check, on the TV with the 8BitDo pad (this cannot be proven headless):
// 1. Move the window onto the TV, enter full screen, quit, launch again. It should come back
//    on that display, full screen. Keyboard-only play still pauses when you click the laptop.
// 2. `Saucer Springs --tv`, or Window → Open on the TV, opens full screen on the largest
//    external display. Turning the menu item off stops forcing that on the next launch.
// 3. Start a game, then click another app on the laptop. The car must keep answering the pad.
//    Start on the pad pauses and resumes. Unplugging the last pad pauses.
// 4. Play a minute, then confirm a row landed at https://guns-only.com/telemetry (Settings
//    opt-out, or ?telemetry=off, must send nothing). The off-screen QA launch stays opted out.

// The game itself, from the same packaged web build that ships to guns-only.com/rc (owner,
// 2026-10-30: the app and the website must never drift apart). Every feature, menu, HUD and sound
// comes from that build; the app adds a native window and serves the files from its bundle under
// rcgame://. The Metal ray tracer (Renderer) takes over the 3D behind this once it holds 60 fps.
final class GameFiles: NSObject, WKURLSchemeHandler {
  let root: URL
  init(root: URL) { self.root = root }
  static let types: [String: String] = [
    "html": "text/html", "js": "text/javascript", "mjs": "text/javascript", "json": "application/json", "css": "text/css",
    "png": "image/png", "webp": "image/webp", "jpg": "image/jpeg", "svg": "image/svg+xml", "glb": "model/gltf-binary",
    "gz": "application/gzip", "bin": "application/octet-stream", "wasm": "application/wasm", "ktx2": "image/ktx2",
    "mp3": "audio/mpeg", "ogg": "audio/ogg", "wav": "audio/wav", "m4a": "audio/mp4", "woff2": "font/woff2",
  ]
  func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
    guard let url = task.request.url else { return }
    var path = url.path; if path.hasSuffix("/") { path += "index.html" }
    // Telemetry and other server endpoints have no file: acknowledge so the game carries on.
    let file = root.appendingPathComponent(String(path.drop { $0 == "/" }))
    guard file.path.hasPrefix(root.path), let data = try? Data(contentsOf: file) else {
      let r = HTTPURLResponse(url: url, statusCode: path.hasPrefix("/telemetry") ? 204 : 404, httpVersion: "HTTP/1.1", headerFields: [:])!
      task.didReceive(r); task.didFinish(); return
    }
    let type = GameFiles.types[file.pathExtension.lowercased()] ?? "application/octet-stream"
    let r = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1",
                            headerFields: ["Content-Type": type, "Content-Length": "\(data.count)", "Access-Control-Allow-Origin": "*"])!
    task.didReceive(r); task.didReceive(data); task.didFinish()
  }
  func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

// Posts the page's anonymous telemetry batch to the public endpoint. rcgame:// cannot fetch
// https://guns-only.com cross-scheme, so the app sends it. The page still applies opt-out
// before it asks; a non-2xx comes back so the page's outbox retries the same body.
final class TelemetryRelay: NSObject, WKScriptMessageHandlerWithReply {
  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) async -> (Any?, String?) {
    let body: String?
    if let text = message.body as? String { body = text }
    else if JSONSerialization.isValidJSONObject(message.body),
            let data = try? JSONSerialization.data(withJSONObject: message.body),
            let text = String(data: data, encoding: .utf8) { body = text }
    else { body = nil }
    guard let body, let url = URL(string: "https://guns-only.com/telemetry") else { return (400, nil) }
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = Data(body.utf8)
    do {
      let (_, response) = try await URLSession.shared.data(for: request)
      return ((response as? HTTPURLResponse)?.statusCode ?? 502, nil)
    } catch {
      return (503, nil)
    }
  }
}

// The TV is the largest display that is not the built-in panel. With no external display,
// that is simply the largest screen, so --tv still fills the laptop.
func largestExternalScreen() -> NSScreen? {
  let screens = NSScreen.screens
  guard !screens.isEmpty else { return nil }
  let external = screens.filter { screen in
    guard let number = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber else { return true }
    return CGDisplayIsBuiltin(CGDirectDisplayID(number.uint32Value)) == 0
  }
  let pool = external.isEmpty ? screens : external
  return pool.max { $0.frame.width * $0.frame.height < $1.frame.width * $1.frame.height }
}

final class GameWindow: NSObject, WKUIDelegate, NSWindowDelegate {
  static let frameName = "SaucerSpringsGame"
  static let tvDefaultsKey = "SaucerSpringsTV"
  static let fullDefaultsKey = "SaucerSpringsFullscreen"
  let window: NSWindow, web: WKWebView, files: GameFiles, telemetry: TelemetryRelay
  private var padTimer: Timer?
  private var lastPadJSON: String?
  private var playActivity: NSObjectProtocol?
  init(root: URL, offscreen: Bool = false) {
    files = GameFiles(root: root)
    let relay = TelemetryRelay()
    let config = WKWebViewConfiguration()
    config.setURLSchemeHandler(files, forURLScheme: "rcgame")
    config.mediaTypesRequiringUserActionForPlayback = []
    config.preferences.isElementFullscreenEnabled = true
    // A window that is not frontmost (the laptop is) must keep drawing. WebKit's default
    // throttles requestAnimationFrame in an inactive app down to nothing.
    config.preferences.inactiveSchedulingPolicy = .none
    config.userContentController.addScriptMessageHandler(relay, contentWorld: .page, name: "rcTelemetry")
    let frame = NSRect(x: 0, y: 0, width: 1440, height: 900)
    web = WKWebView(frame: frame, configuration: config)
    web.isInspectable = true
    window = NSWindow(contentRect: frame, styleMask: [.titled, .closable, .resizable, .miniaturizable, .fullSizeContentView], backing: .buffered, defer: false)
    telemetry = relay
    super.init()
    web.uiDelegate = self
    window.title = "RC Odyssey"; window.titlebarAppearsTransparent = true; window.contentView = web
    // QA stays opted out of the public sink. The interactive app uploads through telemetry above.
    let page = offscreen ? "rcgame://local/rc/index.html?audioQa=silent&telemetry=off" : "rcgame://local/rc/index.html"
    web.load(URLRequest(url: URL(string: page)!))
    if offscreen {
      // QA: a real window far off-screen, never activated, so nothing pops up or takes focus.
      window.setFrameOrigin(NSPoint(x: -30000, y: -30000)); window.orderBack(nil)
      // WebKit stops animation in a window macOS reports as occluded, as an off-screen one can be.
      // QA must measure the game, not the pause: switch WebKit's occlusion detection off here only.
      let sel = NSSelectorFromString("_setWindowOcclusionDetectionEnabled:")
      if web.responds(to: sel) { web.perform(sel, with: false as NSNumber) } else { print("warning: WebKit occlusion switch unavailable; frames may pause") }
    } else {
      window.delegate = self
      // GameController keeps delivering after the app loses key focus. The page reads the
      // snapshot from window.__rcNativePads when WebKit's own Gamepad list goes stale.
      GCController.shouldMonitorBackgroundEvents = true
      startPadBridge()
      restoreDisplay()
    }
  }

  func restoreDisplay() {
    if CommandLine.arguments.contains("--tv") { UserDefaults.standard.set(true, forKey: Self.tvDefaultsKey) }
    let tv = UserDefaults.standard.bool(forKey: Self.tvDefaultsKey)
    window.setFrameAutosaveName(Self.frameName)
    let saved = UserDefaults.standard.object(forKey: "NSWindow Frame \(Self.frameName)") != nil
    if tv {
      if let screen = largestExternalScreen() { window.setFrame(screen.visibleFrame, display: true) }
    } else if !saved {
      window.center()
    }
    window.makeKeyAndOrderFront(nil)
    window.makeFirstResponder(web)
    if tv || UserDefaults.standard.bool(forKey: Self.fullDefaultsKey) {
      DispatchQueue.main.async { [weak self] in self?.enterFullScreen() }
    }
  }

  func enterFullScreen() {
    guard !window.styleMask.contains(.fullScreen) else { return }
    window.toggleFullScreen(nil)
  }

  @objc func toggleTV(_ sender: NSMenuItem) {
    let on = !UserDefaults.standard.bool(forKey: Self.tvDefaultsKey)
    UserDefaults.standard.set(on, forKey: Self.tvDefaultsKey)
    sender.state = on ? .on : .off
    guard on else { return }
    if window.styleMask.contains(.fullScreen) {
      window.toggleFullScreen(nil)
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) { [weak self] in
        guard let self, let screen = largestExternalScreen() else { return }
        self.window.setFrame(screen.visibleFrame, display: true)
        self.enterFullScreen()
      }
    } else if let screen = largestExternalScreen() {
      window.setFrame(screen.visibleFrame, display: true)
      enterFullScreen()
    }
  }

  func windowDidEnterFullScreen(_ notification: Notification) {
    UserDefaults.standard.set(true, forKey: Self.fullDefaultsKey)
  }
  func windowDidExitFullScreen(_ notification: Notification) {
    UserDefaults.standard.set(false, forKey: Self.fullDefaultsKey)
  }

  func startPadBridge() {
    padTimer = Timer.scheduledTimer(withTimeInterval: 1.0 / 60.0, repeats: true) { [weak self] _ in
      Task { @MainActor in self?.pushPads() }
    }
  }

  func pushPads() {
    let controllers = GCController.controllers().filter { $0.extendedGamepad != nil }
    if controllers.isEmpty {
      if let playActivity { ProcessInfo.processInfo.endActivity(playActivity); self.playActivity = nil }
      publishPads("[]")
      return
    }
    if playActivity == nil {
      playActivity = ProcessInfo.processInfo.beginActivity(options: [.userInitiated, .latencyCritical], reason: "Saucer Springs controller")
    }
    let payload = controllers.enumerated().map { index, controller in padSnapshot(controller, index: index) }
    guard let data = try? JSONSerialization.data(withJSONObject: payload), let json = String(data: data, encoding: .utf8) else { return }
    publishPads(json)
  }

  func publishPads(_ json: String) {
    guard json != lastPadJSON else { return }
    lastPadJSON = json
    web.evaluateJavaScript("window.__rcNativePads&&window.__rcNativePads(\(json))")
  }
}

private func buttonJSON(_ button: GCControllerButtonInput?) -> [String: Any] {
  guard let button else { return ["pressed": false, "value": 0] }
  return ["pressed": button.isPressed, "value": Double(button.value)]
}

private func padSnapshot(_ controller: GCController, index: Int) -> [String: Any] {
  let pad = controller.extendedGamepad!
  // Gamepad API axis 1 and 3 are positive downward. GameController's Y is positive upward.
  let axes = [
    Double(pad.leftThumbstick.xAxis.value), Double(-pad.leftThumbstick.yAxis.value),
    Double(pad.rightThumbstick.xAxis.value), Double(-pad.rightThumbstick.yAxis.value)
  ]
  let buttons: [[String: Any]] = [
    buttonJSON(pad.buttonA), buttonJSON(pad.buttonB), buttonJSON(pad.buttonX), buttonJSON(pad.buttonY),
    buttonJSON(pad.leftShoulder), buttonJSON(pad.rightShoulder), buttonJSON(pad.leftTrigger), buttonJSON(pad.rightTrigger),
    buttonJSON(pad.buttonOptions), buttonJSON(pad.buttonMenu),
    buttonJSON(pad.leftThumbstickButton), buttonJSON(pad.rightThumbstickButton),
    buttonJSON(pad.dpad.up), buttonJSON(pad.dpad.down), buttonJSON(pad.dpad.left), buttonJSON(pad.dpad.right)
  ]
  return [
    "id": controller.vendorName ?? "Controller",
    "index": index,
    "connected": true,
    "mapping": "standard",
    "axes": axes,
    "buttons": buttons
  ]
}

// The minimal menu a Mac game needs: Quit (⌘Q), full screen (⌃⌘F), close (⌘W).
func installMenu(target: GameWindow? = nil) {
  let main = NSMenu(), appItem = NSMenuItem(), appMenu = NSMenu()
  appMenu.addItem(withTitle: "Quit Saucer Springs", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
  appItem.submenu = appMenu; main.addItem(appItem)
  let winItem = NSMenuItem(), winMenu = NSMenu(title: "Window")
  let fs = winMenu.addItem(withTitle: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f"); fs.keyEquivalentModifierMask = [.control, .command]
  if let target {
    let tv = winMenu.addItem(withTitle: "Open on the TV", action: #selector(GameWindow.toggleTV(_:)), keyEquivalent: "t")
    tv.keyEquivalentModifierMask = [.command, .option]
    tv.target = target
    tv.state = UserDefaults.standard.bool(forKey: "SaucerSpringsTV") ? .on : .off
  }
  winMenu.addItem(withTitle: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
  winItem.submenu = winMenu; main.addItem(winItem)
  NSApplication.shared.mainMenu = main
}

// --snapshot out.png [--wait seconds] [--click-start]: run the game off-screen and save what it shows.
func snapshotGame(root: URL, to path: String, wait: Double, clickStart: Bool) {
  // A hidden QA window is a background app to macOS: keep App Nap from throttling it.
  let awake = ProcessInfo.processInfo.beginActivity(options: [.userInitiated, .latencyCritical], reason: "frame-rate QA"); _ = awake
  let app = NSApplication.shared; app.setActivationPolicy(.prohibited)
  let game = GameWindow(root: root, offscreen: true)
  DispatchQueue.main.asyncAfter(deadline: .now() + wait) {
    let finish = {
      DispatchQueue.main.asyncAfter(deadline: .now() + 4) {
        game.web.evaluateJavaScript("JSON.stringify({assets: window.__gunsOnlyRC?.snapshot?.().assets, frames: window.__gunsOnlyRC?.frames?.(), errors: (window.__rcErrors||[]).slice(0,5)})") { r, _ in print("state: \(r ?? "nil")") }
        game.web.takeSnapshot(with: nil) { img, err in
          if let img, let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), let png = rep.representation(using: .png, properties: [:]) {
            try? png.write(to: URL(fileURLWithPath: path)); print("snapshot \(path)")
          } else { print("snapshot failed: \(String(describing: err))") }
          exit(0)
        }
      }
    }
    if clickStart { game.web.evaluateJavaScript("document.getElementById('start')?.click(); true") { _, _ in finish() } } else { finish() }
  }
  withExtendedLifetime(game) { app.run() }
}

// --perf out.json [--size WxH] [--seconds N]: the app's frame-rate gate. Runs the game off-screen
// at a real window size, drives it with tools/rc/native/drive-script.js, and reports the game's own
// frame times (p50/p95 over its last 600 frames) and the pixels it renders.
func perfGame(root: URL, out: String, size: NSSize, seconds: Double, drive: String) {
  // A hidden QA window is a background app to macOS: keep App Nap from throttling it.
  let awake = ProcessInfo.processInfo.beginActivity(options: [.userInitiated, .latencyCritical], reason: "frame-rate QA"); _ = awake
  let app = NSApplication.shared; app.setActivationPolicy(.prohibited)
  let game = GameWindow(root: root, offscreen: true)
  game.window.setContentSize(size)
  func poll(_ tries: Int) {
    game.web.evaluateJavaScript("window.__gunsOnlyRC?.snapshot?.().assets === 'blender'") { r, _ in
      if (r as? Bool) == true {
        game.web.evaluateJavaScript("document.getElementById('start')?.click(); true") { _, _ in
          DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
            game.web.evaluateJavaScript(drive) { _, _ in
              DispatchQueue.main.asyncAfter(deadline: .now() + seconds) {
                let js = "JSON.stringify({profile: window.__gunsOnlyRC.profile?.(), frames: window.__gunsOnlyRC.frames(), dpr: devicePixelRatio, css: [innerWidth, innerHeight], pixels: Math.round(innerWidth * innerHeight * Math.min(devicePixelRatio, 1.75) ** 2), load: null})"
                game.web.evaluateJavaScript(js) { r, _ in
                  let text = (r as? String) ?? "{}"; try? text.write(toFile: out, atomically: true, encoding: .utf8); print(text); exit(0)
                }
              }
            }
          }
        }
      } else if tries > 0 { DispatchQueue.main.asyncAfter(deadline: .now() + 1) { poll(tries - 1) } }
      else { print("game never finished loading"); exit(1) }
    }
  }
  DispatchQueue.main.asyncAfter(deadline: .now() + 2) { poll(120) }
  withExtendedLifetime(game) { app.run() }
}
