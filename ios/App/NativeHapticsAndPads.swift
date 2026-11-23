import CoreHaptics
import GameController
import UIKit
import WebKit

final class HapticsRelay: NSObject, WKScriptMessageHandler {
    private var controllerEngines: [ObjectIdentifier: CHHapticEngine] = [:]
    private var deviceEngine: CHHapticEngine?
    private let lightFallback = UIImpactFeedbackGenerator(style: .medium)
    private let heavyFallback = UIImpactFeedbackGenerator(style: .heavy)

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any] else { return }
        let strong = Float((body["strong"] as? Double) ?? 0.6)
        let weak = Float((body["weak"] as? Double) ?? 0.3)
        let duration = max(0.02, min(1.5, ((body["ms"] as? Double) ?? 120.0) / 1000.0))
        let onlyPad = body["pad"] as? Int

        let pads = GCController.controllers().filter { $0.extendedGamepad != nil }
        var playedOnController = false

        for (index, controller) in pads.enumerated() where onlyPad == nil || onlyPad == index {
            guard let haptics = controller.haptics else { continue }
            let key = ObjectIdentifier(controller)
            if controllerEngines[key] == nil, let engine = haptics.createEngine(withLocality: .default) {
                engine.resetHandler = { [weak engine] in try? engine?.start() }
                try? engine.start()
                controllerEngines[key] = engine
            }
            guard let engine = controllerEngines[key] else { continue }
            playContinuous(on: engine, intensity: max(strong, weak), sharpness: strong > weak ? 0.3 : 0.8, duration: duration)
            playedOnController = true
        }

        if !playedOnController {
            playDeviceHaptic(intensity: max(strong, weak), sharpness: strong > weak ? 0.35 : 0.75, duration: duration)
        }
    }

    private func playContinuous(on engine: CHHapticEngine, intensity: Float, sharpness: Float, duration: TimeInterval) {
        let clampedIntensity = max(0.05, min(1.0, intensity))
        let clampedSharpness = max(0.0, min(1.0, sharpness))
        let event = CHHapticEvent(
            eventType: .hapticContinuous,
            parameters: [
                CHHapticEventParameter(parameterID: .hapticIntensity, value: clampedIntensity),
                CHHapticEventParameter(parameterID: .hapticSharpness, value: clampedSharpness),
            ],
            relativeTime: 0,
            duration: duration
        )
        if let pattern = try? CHHapticPattern(events: [event], parameters: []),
           let player = try? engine.makePlayer(with: pattern) {
            try? player.start(atTime: CHHapticTimeImmediate)
        }
    }

    private func playDeviceHaptic(intensity: Float, sharpness: Float, duration: TimeInterval) {
        if CHHapticEngine.capabilitiesForHardware().supportsHaptics {
            if deviceEngine == nil {
                deviceEngine = try? CHHapticEngine()
                deviceEngine?.resetHandler = { [weak self] in try? self?.deviceEngine?.start() }
                try? deviceEngine?.start()
            }
            if let engine = deviceEngine {
                playContinuous(on: engine, intensity: intensity, sharpness: sharpness, duration: min(duration, 0.25))
                return
            }
        }
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            if intensity >= 0.55 {
                self.heavyFallback.impactOccurred(intensity: CGFloat(min(1.0, intensity)))
            } else {
                self.lightFallback.impactOccurred(intensity: CGFloat(max(0.2, intensity)))
            }
        }
    }
}

final class GamepadBridge {
    private weak var webView: WKWebView?
    private var pollTimer: Timer?
    private var lastJSON: String?
    private var observers: [NSObjectProtocol] = []

    init(webView: WKWebView) {
        self.webView = webView
        GCController.shouldMonitorBackgroundEvents = true

        let nc = NotificationCenter.default
        observers.append(nc.addObserver(forName: .GCControllerDidConnect, object: nil, queue: .main) { [weak self] _ in
            self?.syncPollingState()
        })
        observers.append(nc.addObserver(forName: .GCControllerDidDisconnect, object: nil, queue: .main) { [weak self] _ in
            self?.syncPollingState()
        })
        syncPollingState()
    }

    deinit {
        stop()
    }

    func stop() {
        pollTimer?.invalidate()
        pollTimer = nil
        for token in observers {
            NotificationCenter.default.removeObserver(token)
        }
        observers.removeAll()
    }

    private func syncPollingState() {
        let hasPads = !GCController.controllers().filter { $0.extendedGamepad != nil }.isEmpty
        if hasPads && pollTimer == nil {
            pollTimer = Timer.scheduledTimer(withTimeInterval: 1.0 / 60.0, repeats: true) { [weak self] _ in
                self?.pushSnapshot()
            }
            pushSnapshot()
        } else if !hasPads {
            pollTimer?.invalidate()
            pollTimer = nil
            if lastJSON != nil {
                lastJSON = nil
                webView?.evaluateJavaScript("window.__rcNativePads = [];", completionHandler: nil)
            }
        }
    }

    private func pushSnapshot() {
        let pads: [[String: Any]] = GCController.controllers().compactMap { controller in
            guard let gp = controller.extendedGamepad else { return nil }
            let a = gp.buttonA.isPressed ? 1.0 : 0.0
            let b = gp.buttonB.isPressed ? 1.0 : 0.0
            let x = gp.buttonX.isPressed ? 1.0 : 0.0
            let y = gp.buttonY.isPressed ? 1.0 : 0.0
            let l1 = gp.leftShoulder.isPressed ? 1.0 : 0.0
            let r1 = gp.rightShoulder.isPressed ? 1.0 : 0.0
            let l2 = Double(gp.leftTrigger.value)
            let r2 = Double(gp.rightTrigger.value)
            let sel = (gp.buttonOptions?.isPressed ?? false) ? 1.0 : 0.0
            let start = gp.buttonMenu.isPressed ? 1.0 : 0.0
            let l3 = (gp.leftThumbstickButton?.isPressed ?? false) ? 1.0 : 0.0
            let r3 = (gp.rightThumbstickButton?.isPressed ?? false) ? 1.0 : 0.0
            let du = gp.dpad.up.isPressed ? 1.0 : 0.0
            let dd = gp.dpad.down.isPressed ? 1.0 : 0.0
            let dl = gp.dpad.left.isPressed ? 1.0 : 0.0
            let dr = gp.dpad.right.isPressed ? 1.0 : 0.0
            let axes: [Double] = [
                Double(gp.leftThumbstick.xAxis.value),
                Double(-gp.leftThumbstick.yAxis.value),
                Double(gp.rightThumbstick.xAxis.value),
                Double(-gp.rightThumbstick.yAxis.value),
            ]
            return [
                "id": controller.vendorName ?? "Controller",
                "axes": axes,
                "buttons": [a, b, x, y, l1, r1, l2, r2, sel, start, l3, r3, du, dd, dl, dr],
            ]
        }

        guard let data = try? JSONSerialization.data(withJSONObject: pads),
              let json = String(data: data, encoding: .utf8),
              json != lastJSON else { return }
        lastJSON = json
        webView?.evaluateJavaScript("window.__rcNativePads = \(json);", completionHandler: nil)
    }
}
