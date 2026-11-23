import SwiftUI

private struct GameContainerView: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> GameViewController {
        GameViewController()
    }

    func updateUIViewController(_ uiViewController: GameViewController, context: Context) {}
}

@main
struct GunsOnlyApp: App {
    var body: some Scene {
        WindowGroup {
            GameContainerView()
                .ignoresSafeArea()
        }
    }
}
