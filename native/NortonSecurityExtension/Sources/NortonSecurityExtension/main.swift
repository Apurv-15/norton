import Foundation

let securitySocketPath = "/tmp/norton_security.sock"

print("[NortonSecurityExtension] Starting Security Extension v\(EXTENSION_VERSION) (Bundle ID: \(EXTENSION_BUNDLE_ID))...")

// Initialize Endpoint Security Client
let esInitOk = EndpointSecurityManager.shared.initialize()
print("[NortonSecurityExtension] Endpoint Security initialization status: \(esInitOk)")

// Start XPC / Socket server
let server = SecurityXPCServer(socketPath: securitySocketPath)
server.start()

// Run loop to sustain extension daemon
RunLoop.main.run()
