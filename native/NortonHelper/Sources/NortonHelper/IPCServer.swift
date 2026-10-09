import Foundation
import Darwin

class IPCServer {
    private var serverSocketFD: Int32 = -1
    private var isRunning = false
    private let authToken: String
    private let startTime = Date()
    private let socketPath: String
    private var clientFDs = Set<Int32>()
    private var authenticatedFDs = Set<Int32>()
    
    init(socketPath: String, authToken: String) {
        self.socketPath = socketPath
        self.authToken = authToken
    }
    
    func start() {
        if FileManager.default.fileExists(atPath: socketPath) {
            unlink(socketPath)
        }
        
        let runDir = (socketPath as NSString).deletingLastPathComponent
        try? FileManager.default.createDirectory(atPath: runDir, withIntermediateDirectories: true, attributes: nil)
        
        serverSocketFD = socket(AF_UNIX, SOCK_STREAM, 0)
        guard serverSocketFD >= 0 else {
            print("[IPCServer] Failed to create socket")
            return
        }
        
        var addr = sockaddr_un()
        addr.sun_len = UInt8(MemoryLayout<sockaddr_un>.size)
        addr.sun_family = sa_family_t(AF_UNIX)
        
        let pathBytes = socketPath.utf8CString
        guard pathBytes.count <= MemoryLayout.size(ofValue: addr.sun_path) else {
            print("[IPCServer] Socket path too long")
            return
        }
        
        withUnsafeMutablePointer(to: &addr.sun_path) { ptr in
            let bptr = UnsafeMutableRawPointer(ptr).assumingMemoryBound(to: CChar.self)
            for i in 0..<pathBytes.count {
                bptr[i] = pathBytes[i]
            }
        }
        
        let addrLen = socklen_t(MemoryLayout<sockaddr_un>.size)
        
        let bindResult = withUnsafePointer(to: &addr) { ptr in
            ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sa in
                bind(serverSocketFD, sa, addrLen)
            }
        }
        
        guard bindResult == 0 else {
            let err = String(cString: strerror(errno))
            print("[IPCServer] Failed to bind Unix Domain Socket: \(err) (code \(errno))")
            return
        }
        
        guard listen(serverSocketFD, 5) == 0 else {
            print("[IPCServer] Failed to listen on socket")
            return
        }
        
        chmod(socketPath, 0o600)
        isRunning = true
        print("[IPCServer] Native Swift Helper Unix Domain Socket server listening on \(socketPath)")
        
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            self?.acceptLoop()
        }
    }
    
    private func acceptLoop() {
        while isRunning {
            var clientAddr = sockaddr_un()
            var clientAddrLen = socklen_t(MemoryLayout<sockaddr_un>.size)
            
            let clientFD = withUnsafeMutablePointer(to: &clientAddr) { ptr in
                ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sa in
                    accept(serverSocketFD, sa, &clientAddrLen)
                }
            }
            
            guard clientFD >= 0 else { continue }
            
            clientFDs.insert(clientFD)
            print("[IPCServer] Client connected to Swift IPC socket (FD: \(clientFD))")
            
            DispatchQueue.global(qos: .userInitiated).async { [weak self] in
                self?.readClientLoop(clientFD)
            }
        }
    }
    
    private func readClientLoop(_ fd: Int32) {
        var buffer = [CChar](repeating: 0, count: 4096)
        var lineAccumulator = ""
        
        while isRunning {
            let bytesRead = read(fd, &buffer, buffer.count - 1)
            guard bytesRead > 0 else { break }
            
            buffer[bytesRead] = 0
            if let chunk = String(validatingUTF8: buffer) {
                lineAccumulator += chunk
                let lines = lineAccumulator.components(separatedBy: "\n")
                lineAccumulator = lines.last ?? ""
                
                for line in lines.dropLast() where !line.trimmingCharacters(in: .whitespaces).isEmpty {
                    processLine(line, fd: fd)
                }
            }
        }
        
        close(fd)
        clientFDs.remove(fd)
        authenticatedFDs.remove(fd)
        print("[IPCServer] Client disconnected (FD: \(fd))")
    }
    
    private func processLine(_ line: String, fd: Int32) {
        guard let data = line.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let action = json["action"] as? String else {
            sendResponse(["status": "error", "error": "Invalid JSON message"], fd: fd)
            return
        }
        
        if action == "handshake" {
            let token = json["token"] as? String ?? ""
            if token == authToken {
                authenticatedFDs.insert(fd)
                sendResponse([
                    "status": "ok",
                    "action": "handshake",
                    "version": HELPER_VERSION,
                    "bundleId": HELPER_BUNDLE_ID,
                    "uptime": Date().timeIntervalSince(startTime),
                    "capturing": AudioManager.shared.isCapturing
                ], fd: fd)
            } else {
                sendResponse(["status": "error", "error": "Authentication failed"], fd: fd)
                close(fd)
            }
            return
        }
        
        guard authenticatedFDs.contains(fd) else {
            sendResponse(["status": "error", "error": "Unauthenticated request"], fd: fd)
            return
        }
        
        switch action {
        case "ping":
            sendResponse([
                "status": "ok",
                "action": "pong",
                "timestamp": Int64(Date().timeIntervalSince1970 * 1000),
                "capturing": AudioManager.shared.isCapturing
            ], fd: fd)
            
        case "get_status":
            sendResponse([
                "status": "ok",
                "version": HELPER_VERSION,
                "bundleId": HELPER_BUNDLE_ID,
                "capturing": AudioManager.shared.isCapturing,
                "uptime": Date().timeIntervalSince(startTime),
                "pid": ProcessInfo.processInfo.processIdentifier,
                "socketPath": socketPath
            ], fd: fd)
            
        case "start_capture":
            let ok = AudioManager.shared.startCapture()
            sendResponse(["status": "ok", "action": "start_capture", "capturing": ok], fd: fd)
            
        case "stop_capture":
            let ok = AudioManager.shared.stopCapture()
            sendResponse(["status": "ok", "action": "stop_capture", "capturing": !ok], fd: fd)
            
        case "shutdown":
            sendResponse(["status": "ok", "action": "shutdown"], fd: fd)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                exit(0)
            }
            
        default:
            sendResponse(["status": "error", "error": "Unknown action: \(action)"], fd: fd)
        }
    }
    
    private func sendResponse(_ response: [String: Any], fd: Int32) {
        if let data = try? JSONSerialization.data(withJSONObject: response),
           var str = String(data: data, encoding: .utf8) {
            str += "\n"
            let cstr = str.utf8CString
            cstr.withUnsafeBufferPointer { ptr in
                write(fd, ptr.baseAddress, ptr.count - 1)
            }
        }
    }
    
    func stop() {
        isRunning = false
        if serverSocketFD >= 0 {
            close(serverSocketFD)
            serverSocketFD = -1
        }
        unlink(socketPath)
    }
}
