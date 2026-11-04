// swift-tools-version:6.0
import PackageDescription

// Saucer Springs native: the RC world rendered with Metal hardware ray tracing on Apple silicon.
let package = Package(
  name: "SaucerSprings",
  platforms: [.macOS(.v15)],
  targets: [
    .executableTarget(name: "SaucerSprings", resources: [.copy("Shaders.metal"), .copy("rcsim.js")]),
  ]
)
