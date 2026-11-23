import XCTest
@testable import GunsOnlyiOS

final class LocalBundleServerTests: XCTestCase {
    private var tempRoot: URL!
    private var server: LocalBundleServer!
    private var port: UInt16 = 0

    override func setUpWithError() throws {
        tempRoot = FileManager.default.temporaryDirectory
            .appendingPathComponent("guns-only-ios-srv-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: tempRoot, withIntermediateDirectories: true)
        try Data("<html><body>ok</body></html>".utf8).write(to: tempRoot.appendingPathComponent("index.html"))
        try Data([0x00, 0x61, 0x73, 0x6D, 0x01, 0x00, 0x00, 0x00]).write(to: tempRoot.appendingPathComponent("sample.wasm"))
        try Data(0..<20).write(to: tempRoot.appendingPathComponent("atlas.bin"))

        let sub = tempRoot.appendingPathComponent("rc", isDirectory: true)
        try FileManager.default.createDirectory(at: sub, withIntermediateDirectories: true)
        try Data("<html>rc</html>".utf8).write(to: sub.appendingPathComponent("index.html"))

        server = LocalBundleServer(rootURL: tempRoot)
        port = try server.start()
    }

    override func tearDownWithError() throws {
        server?.stop()
        if let tempRoot = tempRoot {
            try? FileManager.default.removeItem(at: tempRoot)
        }
    }

    func testServesIndexAndWasmMimeType() async throws {
        let (indexData, indexResp) = try await URLSession.shared.data(from: URL(string: "http://127.0.0.1:\(port)/")!)
        let httpIndex = try XCTUnwrap(indexResp as? HTTPURLResponse)
        XCTAssertEqual(httpIndex.statusCode, 200)
        XCTAssertTrue((httpIndex.value(forHTTPHeaderField: "Content-Type") ?? "").contains("text/html"))
        XCTAssertEqual(String(data: indexData, encoding: .utf8), "<html><body>ok</body></html>")

        let (_, wasmResp) = try await URLSession.shared.data(from: URL(string: "http://127.0.0.1:\(port)/sample.wasm")!)
        let httpWasm = try XCTUnwrap(wasmResp as? HTTPURLResponse)
        XCTAssertEqual(httpWasm.statusCode, 200)
        XCTAssertEqual(httpWasm.value(forHTTPHeaderField: "Content-Type"), "application/wasm")
    }

    func testServesByteRange206AndTelemetry204() async throws {
        var req = URLRequest(url: URL(string: "http://127.0.0.1:\(port)/atlas.bin")!)
        req.setValue("bytes=4-11", forHTTPHeaderField: "Range")
        let (sliceData, sliceResp) = try await URLSession.shared.data(for: req)
        let httpSlice = try XCTUnwrap(sliceResp as? HTTPURLResponse)
        XCTAssertEqual(httpSlice.statusCode, 206)
        XCTAssertEqual(httpSlice.value(forHTTPHeaderField: "Content-Range"), "bytes 4-11/20")
        XCTAssertEqual(httpSlice.value(forHTTPHeaderField: "Accept-Ranges"), "bytes")
        XCTAssertEqual(sliceData, Data(4...11))

        var telReq = URLRequest(url: URL(string: "http://127.0.0.1:\(port)/telemetry")!)
        telReq.httpMethod = "POST"
        telReq.httpBody = Data("{\"ok\":true}".utf8)
        let (_, telResp) = try await URLSession.shared.data(for: telReq)
        let httpTel = try XCTUnwrap(telResp as? HTTPURLResponse)
        XCTAssertEqual(httpTel.statusCode, 204)
    }

    func testDirectorySlashAndTraversalGuard() async throws {
        let (dirData, dirResp) = try await URLSession.shared.data(from: URL(string: "http://127.0.0.1:\(port)/rc")!)
        let httpDir = try XCTUnwrap(dirResp as? HTTPURLResponse)
        XCTAssertEqual(httpDir.statusCode, 200)
        XCTAssertEqual(String(data: dirData, encoding: .utf8), "<html>rc</html>")

        let (_, notFoundResp) = try await URLSession.shared.data(from: URL(string: "http://127.0.0.1:\(port)/%2e%2e/secret")!)
        let http404 = try XCTUnwrap(notFoundResp as? HTTPURLResponse)
        XCTAssertEqual(http404.statusCode, 404)
    }
}
