import AVFoundation
import UIKit
import WebKit

final class GameViewController: UIViewController, WKNavigationDelegate {
    private var server: LocalBundleServer?
    private var webView: WKWebView?
    private let hapticsRelay = HapticsRelay()
    private var gamepadBridge: GamepadBridge?
    private var foregroundObserver: NSObjectProtocol?

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.05, green: 0.08, blue: 0.13, alpha: 1.0)
        UIApplication.shared.isIdleTimerDisabled = true

        configureAudioSession()
        configureWebView()

        foregroundObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.willEnterForegroundNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.ensureServerAndAudio()
        }

        if ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] == nil {
            startAndLoadGame()
        }
    }

    deinit {
        if let obs = foregroundObserver {
            NotificationCenter.default.removeObserver(obs)
        }
        gamepadBridge?.stop()
        server?.stop()
    }

    private func configureAudioSession() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
        try? session.setActive(true)
    }

    private func configureWebView() {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.websiteDataStore = .default()
        config.userContentController.add(hapticsRelay, name: "rcRumble")
        config.userContentController.add(hapticsRelay, name: "gunsRumble")

        let wv = WKWebView(frame: view.bounds, configuration: config)
        wv.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        wv.navigationDelegate = self
        wv.allowsBackForwardNavigationGestures = false
        wv.isOpaque = false
        wv.backgroundColor = view.backgroundColor
        wv.scrollView.backgroundColor = view.backgroundColor
        wv.scrollView.bounces = false
        wv.scrollView.alwaysBounceVertical = false
        wv.scrollView.alwaysBounceHorizontal = false
        wv.scrollView.contentInsetAdjustmentBehavior = .never
        wv.scrollView.isScrollEnabled = false

        view.addSubview(wv)
        self.webView = wv
        self.gamepadBridge = GamepadBridge(webView: wv)
    }

    private func startAndLoadGame() {
        guard let root = Bundle.main.url(forResource: "wwwroot", withExtension: nil) else {
            showBundleError("Offline wwwroot resources missing from app bundle.")
            return
        }
        let bundleServer = server ?? LocalBundleServer(rootURL: root)
        self.server = bundleServer
        do {
            let port = try bundleServer.start()
            if let url = URL(string: "http://127.0.0.1:\(port)/index.html") {
                webView?.load(URLRequest(url: url))
            }
        } catch {
            showBundleError("Failed to start local game server: \(error.localizedDescription)")
        }
    }

    private func ensureServerAndAudio() {
        configureAudioSession()
        guard ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] == nil else { return }
        if server == nil || server?.isRunning == false {
            startAndLoadGame()
        }
    }

    private func showBundleError(_ message: String) {
        let label = UILabel(frame: view.bounds.insetBy(dx: 32, dy: 32))
        label.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        label.numberOfLines = 0
        label.textAlignment = .center
        label.textColor = .white
        label.font = UIFont.monospacedSystemFont(ofSize: 15, weight: .medium)
        label.text = message
        view.addSubview(label)
    }
}
