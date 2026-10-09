import Foundation
import Darwin

class SecurityXPCServer {
    private var serverSocketFD: Int32 = -1
    private var isRunning = false
    private let socketPath: String
    private let startTime = Date()
    
    init(socketPath: String) {
        self.socketPath = socketPath
    }
    
    func start() {
        if FileManager.default.fileExists(atPath: socketPath) {
            unlink(socketPath)
        }
        
        let runDir = (socketPath as NSString).deletingLastPathComponent
        try? FileManager.default.createDirectory(atPath: runDir, withIntermediateDirectories: true, attributes: nil)
        
        serverSocketFD = socket(AF_UNIX, SOCK_STREAM, 0)
        guard serverSocketFD >= 0 else { return }
        
        var addr = sockaddr_un()
        addr.sun_family = sa_family_t(AF_UNIX)
        let pathBytes = socketPath.utf8CString
        
        withUnsafeMutablePointer(to: &addr.sun_path) { ptr in
            let bptr = UnsafeMutableRawPointer(ptr).assumingMemoryBound(to: CChar.self)
            for i in 0..<pathBytes.count {
                bptr[i] = pathBytes[i]
            }
        }
        
        let addrLen = socklen_t(MemoryLayout<sa_family_t>.size + pathBytes.count)
        let bindResult = withUnsafePointer(to: &addr) { ptr in
            ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sa in
                bind(serverSocketFD, sa, addrLen)
            }
        }
        
        guard bindResult == 0 && listen(serverSocketFD, 5) == 0 else { return }
        chmod(socketPath, 0o600)
        isRunning = true
        print("[NortonSecurityExtension] Security XPC/IPC listener active on \(socketPath)")
        
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            self?.acceptLoop()
        }
    }
    
    private func acceptLoop() {
        while isRunning {
            var clientAddr = sockaddr_un()
            var clientAddrLen = socklen_t(MemoryLayout<sockaddr_un>.size)
            let fd = withUnsafeMutablePointer(to: &clientAddr) { ptr in
                ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sa in
                    accept(serverSocketFD, sa, &clientAddrLen)
                }
            }
            guard fd >= 0 else { continue }
            DispatchQueue.global(qos: .userInitiated).async { [weak self] in
                self?.readLoop(fd)
            }
        }
    }
    
    private func readLoop(_ fd: Int32) {
        var buffer = [CChar](repeating: 0, count: 4096)
        while isRunning {
            let n = read(fd, &buffer, buffer.count - 1)
            guard n > 0 else { break }
            buffer[n] = 0
            if let text = String(validatingUTF8: buffer) {
                let lines = text.components(separatedBy: "\n")
                for line in lines where !line.trimmingCharacters(in: .whitespaces).isEmpty {
                    processMessage(line, fd: fd)
                }
            }
        }
        close(fd)
    }
    
    private func processMessage(_ line: String, fd: Int32) {
        guard let data = line.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let action = json["action"] as? String else { return }
        
        switch action {
        case "getSecurityStatus", "getProtectionStatus":
            let status: [String: Any] = [
                "success": true,
                "data": [
                    "status": EndpointSecurityManager.shared.isConnected ? "PROTECTION_ACTIVE" : "PROTECTION_REQUIRES_APPROVAL",
                    "extensionVersion": EXTENSION_VERSION,
                    "bundleId": EXTENSION_BUNDLE_ID,
                    "endpointSecurityConnected": EndpointSecurityManager.shared.isConnected,
                    "endpointSecurityAuthorized": EndpointSecurityManager.shared.isAuthorized,
                    "uptime": Date().timeIntervalSince(startTime)
                ],
                "error": NSNull()
            ]
            sendResponse(status, fd: fd)
            
        case "ping":
            sendResponse(["success": true, "data": ["pong": true, "version": EXTENSION_VERSION], "error": NSNull()], fd: fd)
            
        default:
            sendResponse(["success": false, "data": NSNull(), "error": ["code": "UNKNOWN_ACTION", "message": "Unknown action: \(action)"]], fd: fd)
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
}
