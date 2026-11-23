import Foundation
import Network

public final class LocalBundleServer {
    public enum ServerError: Error {
        case failedToBind
    }

    public let rootURL: URL
    private let standardizedRoot: String
    private let queue = DispatchQueue(label: "com.iantodd.gunsonly.bundle-server", qos: .userInitiated)
    private var listener: NWListener?
    public private(set) var port: UInt16 = 0

    public static let mimeTypes: [String: String] = [
        "html": "text/html; charset=utf-8",
        "js": "text/javascript; charset=utf-8",
        "mjs": "text/javascript; charset=utf-8",
        "json": "application/json; charset=utf-8",
        "webmanifest": "application/manifest+json; charset=utf-8",
        "css": "text/css; charset=utf-8",
        "wasm": "application/wasm",
        "png": "image/png",
        "webp": "image/webp",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "svg": "image/svg+xml",
        "glb": "model/gltf-binary",
        "bin": "application/octet-stream",
        "truth": "application/octet-stream",
        "ktx2": "image/ktx2",
        "mp3": "audio/mpeg",
        "ogg": "audio/ogg",
        "wav": "audio/wav",
        "m4a": "audio/mp4",
        "woff2": "font/woff2",
        "txt": "text/plain; charset=utf-8",
    ]

    public init(rootURL: URL) {
        self.rootURL = rootURL.standardizedFileURL
        let raw = self.rootURL.path
        self.standardizedRoot = raw.hasSuffix("/") ? String(raw.dropLast()) : raw
    }

    deinit {
        stop()
    }

    public var isRunning: Bool {
        listener != nil && port > 0
    }

    @discardableResult
    public func start() throws -> UInt16 {
        if let listener = listener, listener.state == .ready, port > 0 {
            return port
        }
        stop()

        let params = NWParameters.tcp
        params.allowLocalEndpointReuse = true
        params.requiredLocalEndpoint = NWEndpoint.hostPort(host: .ipv4(.loopback), port: .any)

        let newListener = try NWListener(using: params)
        let semaphore = DispatchSemaphore(value: 0)
        var readyPort: UInt16 = 0
        var bindError: Error?

        newListener.stateUpdateHandler = { [weak self, weak newListener] state in
            switch state {
            case .ready:
                if let p = newListener?.port?.rawValue, p > 0 {
                    readyPort = p
                    self?.port = p
                }
                semaphore.signal()
            case .failed(let error):
                bindError = error
                semaphore.signal()
            case .cancelled:
                semaphore.signal()
            default:
                break
            }
        }

        newListener.newConnectionHandler = { [weak self] connection in
            self?.handleConnection(connection)
        }

        newListener.start(queue: queue)
        let waitResult = semaphore.wait(timeout: .now() + 5.0)
        if waitResult == .timedOut || readyPort == 0 {
            newListener.cancel()
            throw bindError ?? ServerError.failedToBind
        }

        self.listener = newListener
        self.port = readyPort
        return readyPort
    }

    public func stop() {
        listener?.cancel()
        listener = nil
        port = 0
    }

    private func handleConnection(_ connection: NWConnection) {
        connection.start(queue: queue)
        receiveHeaders(on: connection, buffer: Data())
    }

    private func receiveHeaders(on connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 16384) { [weak self] data, _, isComplete, error in
            guard let self = self else {
                connection.cancel()
                return
            }
            if error != nil {
                connection.cancel()
                return
            }

            var accumulated = buffer
            if let data = data {
                accumulated.append(data)
            }

            let delimiter = Data("\r\n\r\n".utf8)
            if let range = accumulated.range(of: delimiter) {
                let headerData = accumulated.subdata(in: 0..<range.lowerBound)
                self.processHTTPRequest(headerData: headerData, on: connection)
                return
            }

            if accumulated.count > 65536 {
                self.sendSimple(status: 431, reason: "Request Header Fields Too Large", body: Data(), headers: [:], on: connection)
                return
            }

            if isComplete {
                connection.cancel()
                return
            }

            self.receiveHeaders(on: connection, buffer: accumulated)
        }
    }

    private func processHTTPRequest(headerData: Data, on connection: NWConnection) {
        guard let rawHeaders = String(data: headerData, encoding: .utf8) ?? String(data: headerData, encoding: .ascii) else {
            sendSimple(status: 400, reason: "Bad Request", body: Data(), headers: [:], on: connection)
            return
        }

        let lines = rawHeaders.components(separatedBy: "\r\n")
        guard let requestLine = lines.first else {
            sendSimple(status: 400, reason: "Bad Request", body: Data(), headers: [:], on: connection)
            return
        }

        let parts = requestLine.split(separator: " ", omittingEmptySubsequences: true)
        guard parts.count >= 2 else {
            sendSimple(status: 400, reason: "Bad Request", body: Data(), headers: [:], on: connection)
            return
        }

        let method = String(parts[0]).uppercased()
        let rawTarget = String(parts[1])

        var headers: [String: String] = [:]
        for line in lines.dropFirst() {
            if let colon = line.firstIndex(of: ":") {
                let name = String(line[..<colon]).trimmingCharacters(in: .whitespaces).lowercased()
                let value = String(line[line.index(after: colon)...]).trimmingCharacters(in: .whitespaces)
                headers[name] = value
            }
        }

        let corsHeaders: [String: String] = [
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Range, Content-Type",
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-cache"
        ]

        if method == "OPTIONS" {
            sendSimple(status: 204, reason: "No Content", body: Data(), headers: corsHeaders, on: connection)
            return
        }

        let rawPathOnly = rawTarget.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false).first.map(String.init) ?? "/"
        let cleanPath = rawPathOnly.removingPercentEncoding ?? rawPathOnly

        if method == "POST" && (cleanPath == "/telemetry" || cleanPath.hasPrefix("/telemetry/") || cleanPath == "/api/telemetry" || cleanPath.hasPrefix("/api/telemetry/")) {
            sendSimple(status: 204, reason: "No Content", body: Data(), headers: corsHeaders, on: connection)
            return
        }

        if cleanPath == "/telemetry" || cleanPath.hasPrefix("/telemetry/") {
            sendSimple(status: 204, reason: "No Content", body: Data(), headers: corsHeaders, on: connection)
            return
        }

        guard method == "GET" || method == "HEAD" else {
            sendSimple(status: 405, reason: "Method Not Allowed", body: Data(), headers: corsHeaders, on: connection)
            return
        }

        var relative = cleanPath
        while relative.hasPrefix("/") {
            relative.removeFirst()
        }

        let candidate = relative.isEmpty
            ? rootURL.appendingPathComponent("index.html")
            : rootURL.appendingPathComponent(relative)
        let resolved = candidate.standardizedFileURL

        guard resolved.path == standardizedRoot || resolved.path.hasPrefix(standardizedRoot + "/") else {
            sendSimple(status: 404, reason: "Not Found", body: Data(), headers: corsHeaders, on: connection)
            return
        }

        var finalURL = resolved
        var isDir: ObjCBool = false
        guard FileManager.default.fileExists(atPath: finalURL.path, isDirectory: &isDir) else {
            sendSimple(status: 404, reason: "Not Found", body: Data(), headers: corsHeaders, on: connection)
            return
        }

        if isDir.boolValue {
            if !rawPathOnly.hasSuffix("/") {
                var redirectHeaders = corsHeaders
                redirectHeaders["Location"] = rawPathOnly + "/"
                sendSimple(status: 301, reason: "Moved Permanently", body: Data(), headers: redirectHeaders, on: connection)
                return
            }
            finalURL = finalURL.appendingPathComponent("index.html")
            var indexDir: ObjCBool = false
            guard FileManager.default.fileExists(atPath: finalURL.path, isDirectory: &indexDir), !indexDir.boolValue else {
                sendSimple(status: 404, reason: "Not Found", body: Data(), headers: corsHeaders, on: connection)
                return
            }
        }

        guard let attrs = try? FileManager.default.attributesOfItem(atPath: finalURL.path),
              let sizeNum = attrs[.size] as? NSNumber else {
            sendSimple(status: 500, reason: "Internal Server Error", body: Data(), headers: corsHeaders, on: connection)
            return
        }

        let fileSize = sizeNum.uint64Value
        let ext = finalURL.pathExtension.lowercased()
        let contentType = Self.mimeTypes[ext] ?? "application/octet-stream"

        var responseHeaders = corsHeaders
        responseHeaders["Content-Type"] = contentType

        if let rangeHeader = headers["range"] {
            if let (lower, upper) = parseByteRange(rangeHeader, fileSize: fileSize) {
                let sliceLength = upper - lower + 1
                responseHeaders["Content-Range"] = "bytes \(lower)-\(upper)/\(fileSize)"
                responseHeaders["Content-Length"] = "\(sliceLength)"
                if method == "HEAD" {
                    sendSimple(status: 206, reason: "Partial Content", body: Data(), headers: responseHeaders, on: connection)
                    return
                }
                sendFileSlice(url: finalURL, offset: lower, length: sliceLength, status: 206, reason: "Partial Content", headers: responseHeaders, on: connection)
                return
            } else {
                responseHeaders["Content-Range"] = "bytes */\(fileSize)"
                sendSimple(status: 416, reason: "Range Not Satisfiable", body: Data(), headers: responseHeaders, on: connection)
                return
            }
        }

        responseHeaders["Content-Length"] = "\(fileSize)"
        if method == "HEAD" || fileSize == 0 {
            sendSimple(status: 200, reason: "OK", body: Data(), headers: responseHeaders, on: connection)
            return
        }

        sendFileSlice(url: finalURL, offset: 0, length: fileSize, status: 200, reason: "OK", headers: responseHeaders, on: connection)
    }

    private func parseByteRange(_ header: String, fileSize: UInt64) -> (UInt64, UInt64)? {
        guard fileSize > 0 else { return nil }
        let trimmed = header.trimmingCharacters(in: .whitespaces).lowercased()
        guard trimmed.hasPrefix("bytes=") else { return nil }
        let spec = String(trimmed.dropFirst(6)).split(separator: ",", maxSplits: 1)[0]
        let bounds = spec.split(separator: "-", maxSplits: 1, omittingEmptySubsequences: false)
        guard bounds.count == 2 else { return nil }

        let startStr = String(bounds[0]).trimmingCharacters(in: .whitespaces)
        let endStr = String(bounds[1]).trimmingCharacters(in: .whitespaces)

        if startStr.isEmpty {
            guard let suffix = UInt64(endStr), suffix > 0 else { return nil }
            let lower = suffix >= fileSize ? 0 : fileSize - suffix
            return (lower, fileSize - 1)
        }

        guard let start = UInt64(startStr), start < fileSize else { return nil }
        if endStr.isEmpty {
            return (start, fileSize - 1)
        }
        guard let requestedEnd = UInt64(endStr), requestedEnd >= start else { return nil }
        return (start, min(requestedEnd, fileSize - 1))
    }

    private func buildHeaderData(status: Int, reason: String, headers: [String: String]) -> Data {
        var text = "HTTP/1.1 \(status) \(reason)\r\n"
        for (key, value) in headers {
            text += "\(key): \(value)\r\n"
        }
        text += "Connection: close\r\n\r\n"
        return Data(text.utf8)
    }

    private func sendSimple(status: Int, reason: String, body: Data, headers: [String: String], on connection: NWConnection) {
        var finalHeaders = headers
        if finalHeaders["Content-Length"] == nil {
            finalHeaders["Content-Length"] = "\(body.count)"
        }
        var payload = buildHeaderData(status: status, reason: reason, headers: finalHeaders)
        if !body.isEmpty {
            payload.append(body)
        }
        connection.send(content: payload, completion: .contentProcessed { _ in
            connection.cancel()
        })
    }

    private func sendFileSlice(url: URL, offset: UInt64, length: UInt64, status: Int, reason: String, headers: [String: String], on connection: NWConnection) {
        guard let handle = try? FileHandle(forReadingFrom: url) else {
            sendSimple(status: 500, reason: "Internal Server Error", body: Data(), headers: [:], on: connection)
            return
        }
        do {
            try handle.seek(toOffset: offset)
        } catch {
            try? handle.close()
            sendSimple(status: 500, reason: "Internal Server Error", body: Data(), headers: [:], on: connection)
            return
        }

        let headerData = buildHeaderData(status: status, reason: reason, headers: headers)
        connection.send(content: headerData, completion: .contentProcessed { [weak self] error in
            if error != nil {
                try? handle.close()
                connection.cancel()
                return
            }
            self?.streamNextChunk(handle: handle, remaining: length, on: connection)
        })
    }

    private func streamNextChunk(handle: FileHandle, remaining: UInt64, on connection: NWConnection) {
        if remaining == 0 {
            try? handle.close()
            connection.cancel()
            return
        }

        let chunkSize = Int(min(remaining, 262_144))
        let data = handle.readData(ofLength: chunkSize)
        if data.isEmpty {
            try? handle.close()
            connection.cancel()
            return
        }

        let nextRemaining = remaining - UInt64(data.count)
        connection.send(content: data, completion: .contentProcessed { [weak self] error in
            if error != nil {
                try? handle.close()
                connection.cancel()
                return
            }
            self?.streamNextChunk(handle: handle, remaining: nextRemaining, on: connection)
        })
    }
}
