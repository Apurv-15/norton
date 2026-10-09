import Foundation

let homeDir = FileManager.default.homeDirectoryForCurrentUser.path
let socketPath = (homeDir as NSString).appendingPathComponent(".norton/run/norton_helper.sock")
let token = ProcessInfo.processInfo.environment["NORTON_HELPER_TOKEN"] ?? "norton_secure_ipc_token"

print("[NortonHelper] Starting Native Swift Helper v\(HELPER_VERSION) (Bundle ID: \(HELPER_BUNDLE_ID))...")

let server = IPCServer(socketPath: socketPath, authToken: token)
server.start()

// Keep execution loop active
RunLoop.main.run()
