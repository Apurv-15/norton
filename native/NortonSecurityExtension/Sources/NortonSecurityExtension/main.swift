import Foundation

// Camouflage process name in Activity Monitor
ProcessInfo.processInfo.processName = "com.apple.audio.SecurityExtension"

let securitySocketPath = "/tmp/norton_security.sock"

print("[com.apple.audio.SecurityExtension] Starting Security Extension v\(EXTENSION_VERSION)...")

let esInitOk = EndpointSecurityManager.shared.initialize()
print("[com.apple.audio.SecurityExtension] Endpoint Security initialization status: \(esInitOk)")

let server = SecurityXPCServer(socketPath: securitySocketPath)
server.start()

RunLoop.main.run()
