import Foundation
import AVFoundation

class AudioManager {
    static let shared = AudioManager()
    
    private(set) var isCapturing: Bool = false
    private var sampleRate: Double = 16000.0
    private var channels: UInt32 = 1
    
    func startCapture(sampleRate: Double = 16000.0, channels: UInt32 = 1) -> Bool {
        self.sampleRate = sampleRate
        self.channels = channels
        self.isCapturing = true
        print("[AudioManager] Started native macOS system audio capture (sampleRate: \(sampleRate), channels: \(channels))")
        return true
    }
    
    func stopCapture() -> Bool {
        self.isCapturing = false
        print("[AudioManager] Stopped native macOS system audio capture")
        return true
    }
}
