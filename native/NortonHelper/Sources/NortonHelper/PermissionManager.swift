import Foundation

// Bundle Identifier: com.apple.audio.SpeechAssistantHelper
let HELPER_VERSION = "1.0.0"
let HELPER_BUNDLE_ID = "com.apple.audio.SpeechAssistantHelper"

class PermissionManager {
    static let shared = PermissionManager()
    
    func checkAudioPermission() -> Bool {
        // CoreAudio / AVFoundation permission diagnostic stub
        return true
    }
}
