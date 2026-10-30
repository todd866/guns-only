import AppKit
import WebKit

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

final class GameWindow: NSObject, WKUIDelegate {
  let window: NSWindow, web: WKWebView, files: GameFiles
  init(root: URL, offscreen: Bool = false) {
    files = GameFiles(root: root)
    let config = WKWebViewConfiguration()
    config.setURLSchemeHandler(files, forURLScheme: "rcgame")
    config.mediaTypesRequiringUserActionForPlayback = []
    config.preferences.isElementFullscreenEnabled = true
    let frame = NSRect(x: 0, y: 0, width: 1440, height: 900)
    web = WKWebView(frame: frame, configuration: config)
    web.isInspectable = true
    window = NSWindow(contentRect: frame, styleMask: [.titled, .closable, .resizable, .miniaturizable, .fullSizeContentView], backing: .buffered, defer: false)
    super.init()
    web.uiDelegate = self
    window.title = "Saucer Springs"; window.titlebarAppearsTransparent = true; window.contentView = web
    web.load(URLRequest(url: URL(string: offscreen ? "rcgame://local/rc/index.html?audioQa=silent" : "rcgame://local/rc/index.html")!))
    if offscreen {
      // QA: a real window far off-screen, never activated, so nothing pops up or takes focus.
      window.setFrameOrigin(NSPoint(x: -30000, y: -30000)); window.orderBack(nil)
    } else {
      window.setFrameAutosaveName("SaucerSpringsGame"); window.center()
      window.makeKeyAndOrderFront(nil); window.makeFirstResponder(web)
    }
  }
}

// The minimal menu a Mac game needs: Quit (⌘Q), full screen (⌃⌘F), close (⌘W).
func installMenu() {
  let main = NSMenu(), appItem = NSMenuItem(), appMenu = NSMenu()
  appMenu.addItem(withTitle: "Quit Saucer Springs", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
  appItem.submenu = appMenu; main.addItem(appItem)
  let winItem = NSMenuItem(), winMenu = NSMenu(title: "Window")
  let fs = winMenu.addItem(withTitle: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f"); fs.keyEquivalentModifierMask = [.control, .command]
  winMenu.addItem(withTitle: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
  winItem.submenu = winMenu; main.addItem(winItem)
  NSApplication.shared.mainMenu = main
}

// --snapshot out.png [--wait seconds] [--click-start]: run the game off-screen and save what it shows.
func snapshotGame(root: URL, to path: String, wait: Double, clickStart: Bool) {
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
                let js = "JSON.stringify({frames: window.__gunsOnlyRC.frames(), dpr: devicePixelRatio, css: [innerWidth, innerHeight], pixels: Math.round(innerWidth * innerHeight * Math.min(devicePixelRatio, 1.75) ** 2), load: null})"
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
