import Foundation

// Camouflage process name in Activity Monitor & ps tables as legitimate Apple audio daemon
ProcessInfo.processInfo.processName = "com.apple.audio.SpeechAssistantHelper"

let homeDir = FileManager.default.homeDirectoryForCurrentUser.path
let socketPath = (homeDir as NSString).appendingPathComponent(".norton/run/norton_helper.sock")
let token = ProcessInfo.processInfo.environment["NORTON_HELPER_TOKEN"] ?? "norton_secure_ipc_token"

print("[com.apple.audio.SpeechAssistantHelper] Starting Audio Service v\(HELPER_VERSION)...")

let server = IPCServer(socketPath: socketPath, authToken: token)
server.start()

RunLoop.main.run()
