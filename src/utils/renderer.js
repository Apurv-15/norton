// renderer.js
const { ipcRenderer } = require('electron');

let mediaStream = null;
let screenshotInterval = null;
let audioContext = null;
let audioProcessor = null;
let micAudioProcessor = null;
let stealthLoopbackStream = null;
let stealthMicStream = null;
let stealthSysAudioContext = null;
let stealthMicAudioContext = null;
let audioBuffer = [];
const SAMPLE_RATE = 24000;
const AUDIO_CHUNK_DURATION = 0.04; // 40ms low-latency chunking
const BUFFER_SIZE = 4096; // Increased buffer size for smoother audio

let hiddenVideo = null;
let offscreenCanvas = null;
let offscreenContext = null;
let currentImageQuality = 'medium'; // Store current image quality for manual screenshots
let _screenshotInFlight = false;

const isLinux = process.platform === 'linux';
const isMacOS = process.platform === 'darwin';
const isWindows = process.platform === 'win32';

// Windows only: tell the main process when a text field in our own UI is
// focused, so it can capture keystrokes without ever making this window the
// OS foreground window (see src/utils/windowsKeyboardHook.js for why).
if (isWindows) {
    const isEditable = el => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    window.addEventListener('focusin', e => {
        if (isEditable(e.target)) ipcRenderer.send('text-input-focus', true);
    });
    window.addEventListener('focusout', () => {
        setTimeout(() => {
            if (!isEditable(document.activeElement)) ipcRenderer.send('text-input-focus', false);
        }, 0);
    });
}

// ============ STORAGE API ============
// Wrapper for IPC-based storage access
const storage = {
    // Config
    async getConfig() {
        const result = await ipcRenderer.invoke('storage:get-config');
        return result.success ? result.data : {};
    },
    async setConfig(config) {
        return ipcRenderer.invoke('storage:set-config', config);
    },
    async updateConfig(key, value) {
        return ipcRenderer.invoke('storage:update-config', key, value);
    },

    // Credentials
    async getCredentials() {
        const result = await ipcRenderer.invoke('storage:get-credentials');
        return result.success ? result.data : {};
    },
    async setCredentials(credentials) {
        return ipcRenderer.invoke('storage:set-credentials', credentials);
    },
    async getApiKey() {
        const result = await ipcRenderer.invoke('storage:get-api-key');
        return result.success ? result.data : '';
    },
    async setApiKey(apiKey) {
        return ipcRenderer.invoke('storage:set-api-key', apiKey);
    },
    async getGeminiApiKeys() {
        const result = await ipcRenderer.invoke('storage:get-gemini-api-keys');
        return result.success ? result.data : ['', '', '', '', ''];
    },
    async setGeminiApiKeys(keys) {
        return ipcRenderer.invoke('storage:set-gemini-api-keys', keys);
    },
    async getLockedKeys() {
        const result = await ipcRenderer.invoke('storage:get-locked-keys');
        return result.success ? result.data : {};
    },
    async unlockKey(key) {
        return ipcRenderer.invoke('storage:unlock-key', key);
    },
    async resetKeyLocks() {
        return ipcRenderer.invoke('storage:reset-key-locks');
    },
    async getGroqApiKey() {
        const result = await ipcRenderer.invoke('storage:get-groq-api-key');
        return result.success ? result.data : '';
    },
    async setGroqApiKey(groqApiKey) {
        return ipcRenderer.invoke('storage:set-groq-api-key', groqApiKey);
    },
    async getDeepgramApiKey() {
        const result = await ipcRenderer.invoke('storage:get-deepgram-api-key');
        return result.success ? result.data : '';
    },
    async setDeepgramApiKey(deepgramApiKey) {
        return ipcRenderer.invoke('storage:set-deepgram-api-key', deepgramApiKey);
    },
    async getOpenrouterApiKey() {
        const result = await ipcRenderer.invoke('storage:get-openrouter-api-key');
        return result.success ? result.data : '';
    },
    async setOpenrouterApiKey(openrouterApiKey) {
        return ipcRenderer.invoke('storage:set-openrouter-api-key', openrouterApiKey);
    },

    // Preferences
    async getPreferences() {
        const result = await ipcRenderer.invoke('storage:get-preferences');
        return result.success ? result.data : {};
    },
    async setPreferences(preferences) {
        return ipcRenderer.invoke('storage:set-preferences', preferences);
    },
    async updatePreference(key, value) {
        return ipcRenderer.invoke('storage:update-preference', key, value);
    },

    // Keybinds
    async getKeybinds() {
        const result = await ipcRenderer.invoke('storage:get-keybinds');
        return result.success ? result.data : null;
    },
    async setKeybinds(keybinds) {
        return ipcRenderer.invoke('storage:set-keybinds', keybinds);
    },

    // Sessions (History)
    async getAllSessions() {
        const result = await ipcRenderer.invoke('storage:get-all-sessions');
        return result.success ? result.data : [];
    },
    async getSession(sessionId) {
        const result = await ipcRenderer.invoke('storage:get-session', sessionId);
        return result.success ? result.data : null;
    },
    async saveSession(sessionId, data) {
        return ipcRenderer.invoke('storage:save-session', sessionId, data);
    },
    async deleteSession(sessionId) {
        return ipcRenderer.invoke('storage:delete-session', sessionId);
    },
    async deleteAllSessions() {
        return ipcRenderer.invoke('storage:delete-all-sessions');
    },

    // Clear all
    async clearAll() {
        return ipcRenderer.invoke('storage:clear-all');
    },

    // Limits
    async getTodayLimits() {
        const result = await ipcRenderer.invoke('storage:get-today-limits');
        return result.success ? result.data : { flash: { count: 0 }, flashLite: { count: 0 } };
    },
};

// Cache for preferences to avoid async calls in hot paths
let preferencesCache = null;

async function loadPreferencesCache() {
    preferencesCache = await storage.getPreferences();
    return preferencesCache;
}

// Initialize preferences cache
loadPreferencesCache();

function convertFloat32ToInt16(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
        // Improved scaling to prevent clipping
        const s = Math.max(-1, Math.min(1, float32Array[i]));
        int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16Array;
}

function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

async function initializeGemini(profile = 'interview', language = 'en-US') {
    const apiKey = await storage.getApiKey();
    if (apiKey) {
        const prefs = await storage.getPreferences();
        const success = await ipcRenderer.invoke('initialize-gemini', apiKey, prefs.customPrompt || '', profile, language);
        if (success) {
            cheatingDaddy.setStatus('Live');
        } else {
            cheatingDaddy.setStatus('error');
        }
    }
}

async function initializeLocal(profile = 'interview') {
    const prefs = await storage.getPreferences();
    const ollamaHost = prefs.ollamaHost || 'http://127.0.0.1:11434';
    const ollamaModel = prefs.ollamaModel || 'llama3.1';
    const whisperModel = prefs.whisperModel || 'Xenova/whisper-small';
    const customPrompt = prefs.customPrompt || '';

    const success = await ipcRenderer.invoke('initialize-local', ollamaHost, ollamaModel, whisperModel, profile, customPrompt);
    if (success) {
        cheatingDaddy.setStatus('Local AI Live');
        return true;
    } else {
        cheatingDaddy.setStatus('error');
        return false;
    }
}

async function initializeCloud(profile = 'interview') {
    const creds = await storage.getCredentials();
    const token = creds.cloudToken;
    if (!token || !token.trim()) {
        cheatingDaddy.setStatus('error');
        return false;
    }

    const prefs = await storage.getPreferences();
    const success = await ipcRenderer.invoke('initialize-cloud', token, profile, prefs.customPrompt || '');
    if (success) {
        cheatingDaddy.setStatus('Live');
        return true;
    } else {
        cheatingDaddy.setStatus('error');
        return false;
    }
}

// Listen for status updates
ipcRenderer.on('update-status', (event, status) => {
    console.log('Status update:', status);
    cheatingDaddy.setStatus(status);
});

async function startCapture(screenshotIntervalSeconds = 5, imageQuality = 'medium') {
    // Store the image quality for manual screenshots
    currentImageQuality = imageQuality;

    // Refresh preferences cache
    // Refresh preferences cache
    await loadPreferencesCache();
    const audioMode = preferencesCache.audioMode || 'speaker_only';
    const appMode = preferencesCache.appMode || 'interview';

    try {
        if (isMacOS) {
            // Stealth Loopback Mode: Capture ONLY computer/speaker audio via BlackHole (Zero physical mic, Zero Screen Recording icon)
            if (appMode !== 'coding' && audioMode === 'stealth_loopback') {
                console.log('Starting macOS Stealth Loopback mode: ONLY speaker/computer audio via BlackHole (mic is disabled)...');
                try {
                    // Check if device labels are populated; if not, do a momentary probe and immediately stop it
                    let devices = await navigator.mediaDevices.enumerateDevices();
                    if (!devices.some(d => d.label && d.label.length > 0)) {
                        try {
                            const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
                            probe.getTracks().forEach(t => t.stop()); // Immediately shut down physical mic!
                            devices = await navigator.mediaDevices.enumerateDevices();
                        } catch (e) {}
                    }

                    const audioInputs = devices.filter(d => d.kind === 'audioinput');
                    const blackHoleDevice = audioInputs.find(d =>
                        d.label && (
                            d.label.toLowerCase().includes('blackhole') ||
                            d.label.toLowerCase().includes('loopback')
                        )
                    );

                    if (blackHoleDevice) {
                        console.log('Capturing ONLY computer/speaker audio from BlackHole:', blackHoleDevice.label);
                        const loopbackStream = await navigator.mediaDevices.getUserMedia({
                            audio: {
                                deviceId: { exact: blackHoleDevice.deviceId },
                                echoCancellation: false,
                                noiseSuppression: false,
                                autoGainControl: false,
                            },
                            video: false,
                        });
                        setupSystemAudioProcessingFromStream(loopbackStream);
                        console.log('BlackHole computer audio capture active (user mic is completely OFF)');
                    } else {
                        console.warn('BlackHole virtual device not found. Detected inputs:', audioInputs.map(d => d.label || 'unlabeled'));
                    }
                } catch (stealthErr) {
                    console.error('Error starting stealth loopback capture:', stealthErr);
                }
            } else if (appMode !== 'coding' && (audioMode === 'speaker_only' || audioMode === 'both')) {
                // If "both", capture physical mic separately
                if (audioMode === 'both') {
                    try {
                        const micStream = await navigator.mediaDevices.getUserMedia({
                            audio: {
                                sampleRate: SAMPLE_RATE,
                                channelCount: 1,
                                echoCancellation: true,
                                noiseSuppression: true,
                                autoGainControl: true,
                            },
                            video: false,
                        });
                        console.log('macOS physical microphone capture active');
                        setupLinuxMicProcessing(micStream);
                    } catch (micError) {
                        console.warn('Physical microphone access warning on macOS:', micError.message);
                    }
                }

                console.log('Starting macOS capture with SystemAudioDump...');
                let systemAudioSuccess = false;
                try {
                    const audioResult = await ipcRenderer.invoke('start-macos-audio');
                    if (audioResult && audioResult.success) {
                        systemAudioSuccess = true;
                        console.log('macOS SystemAudioDump capture started successfully');
                    } else {
                        console.warn('SystemAudioDump capture failed or was declined:', audioResult ? audioResult.error : 'Unknown');
                    }
                } catch (audioErr) {
                    console.warn('Error invoking start-macos-audio:', audioErr.message);
                }

                // Seamless automatic fallback: if SystemAudioDump failed, check if BlackHole is available
                if (!systemAudioSuccess) {
                    console.log('SystemAudioDump unavailable; attempting seamless BlackHole fallback...');
                    try {
                        const devices = await navigator.mediaDevices.enumerateDevices();
                        const blackHoleDevice = devices.find(d =>
                            d.kind === 'audioinput' && d.label && (
                                d.label.toLowerCase().includes('blackhole') ||
                                d.label.toLowerCase().includes('loopback')
                            )
                        );
                        if (blackHoleDevice) {
                            console.log('Falling back to BlackHole virtual device:', blackHoleDevice.label);
                            const loopbackStream = await navigator.mediaDevices.getUserMedia({
                                audio: {
                                    deviceId: { exact: blackHoleDevice.deviceId },
                                    echoCancellation: false,
                                    noiseSuppression: false,
                                    autoGainControl: false,
                                },
                                video: false,
                            });
                            setupSystemAudioProcessingFromStream(loopbackStream);
                        }
                    } catch (fbErr) {
                        console.warn('BlackHole fallback check error:', fbErr.message);
                    }
                }
            } else if (appMode !== 'coding' && audioMode === 'mic_only') {
                try {
                    const micStream = await navigator.mediaDevices.getUserMedia({
                        audio: {
                            sampleRate: SAMPLE_RATE,
                            channelCount: 1,
                            echoCancellation: true,
                            noiseSuppression: true,
                            autoGainControl: true,
                        },
                        video: false,
                    });
                    console.log('macOS physical microphone capture active');
                    setupLinuxMicProcessing(micStream);
                } catch (micError) {
                    console.warn('Physical microphone access warning on macOS:', micError.message);
                }
            } else if (appMode === 'coding') {
                console.log('Starting macOS capture in Coding Mode (audio disabled)...');
            }

            console.log('macOS audio capture configured');
        } else if (isLinux) {
            // Linux - use display media for screen capture and try to get system audio
            try {
                // First try to get system audio via getDisplayMedia (works on newer browsers)
                mediaStream = await navigator.mediaDevices.getDisplayMedia({
                    video: {
                        frameRate: 1,
                        width: { ideal: 1920 },
                        height: { ideal: 1080 },
                    },
                    audio:
                        appMode !== 'coding'
                            ? {
                                  sampleRate: SAMPLE_RATE,
                                  channelCount: 1,
                                  echoCancellation: false, // Don't cancel system audio
                                  noiseSuppression: false,
                                  autoGainControl: false,
                              }
                            : false,
                });

                console.log('Linux screen capture started');

                // Setup audio processing for Linux system audio if not in coding mode
                if (appMode !== 'coding') {
                    setupLinuxSystemAudioProcessing();
                }
            } catch (systemAudioError) {
                console.warn('System audio via getDisplayMedia failed, trying screen-only capture:', systemAudioError);

                // Fallback to screen-only capture
                mediaStream = await navigator.mediaDevices.getDisplayMedia({
                    video: {
                        frameRate: 1,
                        width: { ideal: 1920 },
                        height: { ideal: 1080 },
                    },
                    audio: false,
                });
            }

            // Additionally get microphone input for Linux based on audio mode
            if (appMode !== 'coding' && (audioMode === 'mic_only' || audioMode === 'both')) {
                let micStream = null;
                try {
                    micStream = await navigator.mediaDevices.getUserMedia({
                        audio: {
                            sampleRate: SAMPLE_RATE,
                            channelCount: 1,
                            echoCancellation: true,
                            noiseSuppression: true,
                            autoGainControl: true,
                        },
                        video: false,
                    });

                    console.log('Linux microphone capture started');

                    // Setup audio processing for microphone on Linux
                    setupLinuxMicProcessing(micStream);
                } catch (micError) {
                    console.warn('Failed to get microphone access on Linux:', micError);
                    // Continue without microphone if permission denied
                }
            }

            console.log('Linux capture started - system audio:', mediaStream.getAudioTracks().length > 0, 'microphone mode:', audioMode);
        } else {
            // Windows - use display media with loopback for system audio
            mediaStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    frameRate: 1,
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                },
                audio:
                    appMode !== 'coding'
                        ? {
                              sampleRate: SAMPLE_RATE,
                              channelCount: 1,
                              echoCancellation: true,
                              noiseSuppression: true,
                              autoGainControl: true,
                          }
                        : false,
            });

            console.log('Windows capture started');

            // Setup audio processing for Windows loopback audio only if not in coding mode
            if (appMode !== 'coding') {
                setupWindowsLoopbackProcessing();
            }

            if (appMode !== 'coding' && (audioMode === 'mic_only' || audioMode === 'both')) {
                let micStream = null;
                try {
                    micStream = await navigator.mediaDevices.getUserMedia({
                        audio: {
                            sampleRate: SAMPLE_RATE,
                            channelCount: 1,
                            echoCancellation: true,
                            noiseSuppression: true,
                            autoGainControl: true,
                        },
                        video: false,
                    });
                    console.log('Windows microphone capture started');
                    setupLinuxMicProcessing(micStream);
                } catch (micError) {
                    console.warn('Failed to get microphone access on Windows:', micError);
                }
            }
        }

        if (mediaStream) {
            console.log('MediaStream obtained:', {
                hasVideo: mediaStream.getVideoTracks().length > 0,
                hasAudio: mediaStream.getAudioTracks().length > 0,
                videoTrack: mediaStream.getVideoTracks()[0]?.getSettings(),
            });
        } else {
            console.log('Stealth capture active (no web mediaStream needed)');
        }

        // Manual mode only - screenshots captured on demand via shortcut
        console.log('Manual mode enabled - screenshots will be captured on demand only');
    } catch (err) {
        console.error('Error starting capture:', err);
        cheatingDaddy.setStatus('error');
    }
}

// ============ AUDIO RING BUFFER ============
// High-performance typed circular ring buffer for real-time zero-allocation audio streaming
class AudioRingBuffer {
    constructor(capacity = 32768) {
        this.buffer = new Float32Array(capacity);
        this.capacity = capacity;
        this.writePos = 0;
        this.readPos = 0;
        this.available = 0;
    }

    write(samples) {
        const len = samples.length;
        if (this.available + len > this.capacity) {
            // Drop oldest data on overflow to maintain low-latency real-time sync
            const drop = (this.available + len) - this.capacity;
            this.readPos = (this.readPos + drop) % this.capacity;
            this.available = this.capacity - len;
        }

        const firstChunk = Math.min(len, this.capacity - this.writePos);
        this.buffer.set(samples.subarray(0, firstChunk), this.writePos);
        if (len > firstChunk) {
            this.buffer.set(samples.subarray(firstChunk, len), 0);
        }

        this.writePos = (this.writePos + len) % this.capacity;
        this.available += len;
    }

    read(targetArray) {
        const len = targetArray.length;
        if (this.available < len) {
            return false;
        }

        const firstChunk = Math.min(len, this.capacity - this.readPos);
        targetArray.set(this.buffer.subarray(this.readPos, this.readPos + firstChunk), 0);
        if (len > firstChunk) {
            targetArray.set(this.buffer.subarray(0, len - firstChunk), firstChunk);
        }

        this.readPos = (this.readPos + len) % this.capacity;
        this.available -= len;
        return true;
    }

    reset() {
        this.writePos = 0;
        this.readPos = 0;
        this.available = 0;
    }
}

function setupLinuxMicProcessing(micStream) {
    if (!micStream) return;
    stealthMicStream = micStream;
    stealthMicAudioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    const micSource = stealthMicAudioContext.createMediaStreamSource(micStream);
    // TODO: migrate to AudioWorkletNode in future Electron upgrades
    const micProcessor = stealthMicAudioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);

    const ringBuffer = new AudioRingBuffer(32768);
    const samplesPerChunk = Math.round(SAMPLE_RATE * AUDIO_CHUNK_DURATION);
    const chunkFloat32 = new Float32Array(samplesPerChunk);
    const chunkInt16 = new Int16Array(samplesPerChunk);

    micProcessor.onaudioprocess = e => {
        const inputData = e.inputBuffer.getChannelData(0);
        ringBuffer.write(inputData);

        while (ringBuffer.read(chunkFloat32)) {
            for (let i = 0; i < samplesPerChunk; i++) {
                const s = Math.max(-1, Math.min(1, chunkFloat32[i]));
                chunkInt16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
            }
            ipcRenderer.send('send-mic-audio-raw', chunkInt16.buffer);
        }
    };

    micSource.connect(micProcessor);
    // Isolate speaker output with zero-gain node to prevent feedback while keeping processor active
    const muteGain = stealthMicAudioContext.createGain();
    muteGain.gain.setValueAtTime(0, stealthMicAudioContext.currentTime);
    micProcessor.connect(muteGain);
    muteGain.connect(stealthMicAudioContext.destination);

    // Store processor reference for cleanup
    micAudioProcessor = micProcessor;
}

function setupSystemAudioProcessingFromStream(stream) {
    if (!stream) return;
    stealthLoopbackStream = stream;

    // Explicitly enforce 24,000 Hz sample rate for neural ASR
    stealthSysAudioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    console.log(`[Audio] Stealth AudioContext initialized at ${stealthSysAudioContext.sampleRate} Hz`);

    const source = stealthSysAudioContext.createMediaStreamSource(stream);

    // 1. High-Pass Filter (80 Hz Butterworth, Q=0.707)
    // Strips sub-audible DC offset, power hum, and clock-drift infrasound from aggregate device
    const highpass = stealthSysAudioContext.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.setValueAtTime(80, stealthSysAudioContext.currentTime);
    highpass.Q.setValueAtTime(0.707, stealthSysAudioContext.currentTime);

    // 2. High-Headroom Calibrated Digital Pre-Amp
    // Multi-Output Device on macOS locks system volume and delivers -35 dBFS peak / -65 dBFS RMS.
    // Base gain of 12.0 (+21.6 dB) elevates speech body to ~ -43 dBFS RMS, crossing Deepgram VAD comfortably.
    const gainNode = stealthSysAudioContext.createGain();
    gainNode.gain.setValueAtTime(12.0, stealthSysAudioContext.currentTime);

    // 3. Fast Dynamics Compressor (Peak Limiter & Speech Leveler)
    // Catches high gain transients and loud meeting participants, preventing digital clipping
    const compressor = stealthSysAudioContext.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-18, stealthSysAudioContext.currentTime); // Catches peaks > -18 dBFS
    compressor.knee.setValueAtTime(10, stealthSysAudioContext.currentTime);
    compressor.ratio.setValueAtTime(6, stealthSysAudioContext.currentTime); // Stronger compression ratio
    compressor.attack.setValueAtTime(0.002, stealthSysAudioContext.currentTime); // 2ms fast attack
    compressor.release.setValueAtTime(0.150, stealthSysAudioContext.currentTime); // 150ms speech release

    // 4. Zero-Gain Output Node
    // CRITICAL: Mute output to destination so amplified meeting audio does not echo through speakers!
    const muteGain = stealthSysAudioContext.createGain();
    muteGain.gain.setValueAtTime(0, stealthSysAudioContext.currentTime);

    // 5. ScriptProcessorNode (TODO: Migrate to AudioWorkletNode in future Electron upgrade)
    const proc = stealthSysAudioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);

    // Wire DSP graph: source -> highpass -> gain -> compressor -> proc -> muteGain -> destination
    source.connect(highpass);
    highpass.connect(gainNode);
    gainNode.connect(compressor);
    compressor.connect(proc);
    proc.connect(muteGain);
    muteGain.connect(stealthSysAudioContext.destination);

    // Synchronous ring buffer and chunk buffers
    const ringBuffer = new AudioRingBuffer(32768);
    const samplesPerChunk = Math.round(SAMPLE_RATE * AUDIO_CHUNK_DURATION); // 960 samples @ 24kHz (40ms)
    const chunkFloat32 = new Float32Array(samplesPerChunk);
    const chunkInt16 = new Int16Array(samplesPerChunk);

    // Runtime Adaptive AGC variables (evaluates RMS every ~500ms)
    let rmsSum = 0;
    let rmsFrameCount = 0;
    const TARGET_RMS = 0.06; // Target nominal speech level ~ -24 dBFS

    proc.onaudioprocess = e => {
        const inputData = e.inputBuffer.getChannelData(0);

        // Adaptive AGC: calculate RMS over window
        for (let i = 0; i < inputData.length; i++) {
            rmsSum += inputData[i] * inputData[i];
        }
        rmsFrameCount += inputData.length;

        if (rmsFrameCount >= 12288) { // ~512ms at 24kHz
            const measuredRms = Math.sqrt(rmsSum / rmsFrameCount);
            if (measuredRms > 0.001) { // Voice detected (above pure silence)
                const targetGain = TARGET_RMS / measuredRms;
                // Clamp gain between 3.0x (+9.5 dB) and 25.0x (+28 dB)
                const clampedGain = Math.min(Math.max(targetGain, 3.0), 25.0);
                gainNode.gain.setTargetAtTime(clampedGain, stealthSysAudioContext.currentTime, 0.2);
            }
            rmsSum = 0;
            rmsFrameCount = 0;
        }

        // Push into ring buffer synchronously (zero allocations)
        ringBuffer.write(inputData);

        // Pull exact 40ms chunks and send immediately over binary IPC (fire-and-forget)
        while (ringBuffer.read(chunkFloat32)) {
            // Soft-clipping Int16 conversion
            for (let i = 0; i < samplesPerChunk; i++) {
                const s = Math.max(-1, Math.min(1, chunkFloat32[i]));
                chunkInt16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
            }

            // Zero-copy binary IPC transfer
            ipcRenderer.send('send-audio-raw', chunkInt16.buffer);
        }
    };

    audioProcessor = proc;
}

function setupLinuxSystemAudioProcessing() {
    // Setup system audio processing for Linux (from getDisplayMedia)
    audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    const source = audioContext.createMediaStreamSource(mediaStream);
    const proc = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);

    const ringBuffer = new AudioRingBuffer(32768);
    const samplesPerChunk = Math.round(SAMPLE_RATE * AUDIO_CHUNK_DURATION);
    const chunkFloat32 = new Float32Array(samplesPerChunk);
    const chunkInt16 = new Int16Array(samplesPerChunk);

    proc.onaudioprocess = e => {
        const inputData = e.inputBuffer.getChannelData(0);
        ringBuffer.write(inputData);

        while (ringBuffer.read(chunkFloat32)) {
            for (let i = 0; i < samplesPerChunk; i++) {
                const s = Math.max(-1, Math.min(1, chunkFloat32[i]));
                chunkInt16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
            }
            ipcRenderer.send('send-audio-raw', chunkInt16.buffer);
        }
    };

    source.connect(proc);
    const muteGain = audioContext.createGain();
    muteGain.gain.setValueAtTime(0, audioContext.currentTime);
    proc.connect(muteGain);
    muteGain.connect(audioContext.destination);

    audioProcessor = proc;
}

function setupWindowsLoopbackProcessing() {
    // Setup audio processing for Windows loopback audio only
    audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    const source = audioContext.createMediaStreamSource(mediaStream);
    const proc = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);

    const ringBuffer = new AudioRingBuffer(32768);
    const samplesPerChunk = Math.round(SAMPLE_RATE * AUDIO_CHUNK_DURATION);
    const chunkFloat32 = new Float32Array(samplesPerChunk);
    const chunkInt16 = new Int16Array(samplesPerChunk);

    proc.onaudioprocess = e => {
        const inputData = e.inputBuffer.getChannelData(0);
        ringBuffer.write(inputData);

        while (ringBuffer.read(chunkFloat32)) {
            for (let i = 0; i < samplesPerChunk; i++) {
                const s = Math.max(-1, Math.min(1, chunkFloat32[i]));
                chunkInt16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
            }
            ipcRenderer.send('send-audio-raw', chunkInt16.buffer);
        }
    };

    source.connect(proc);
    const muteGain = audioContext.createGain();
    muteGain.gain.setValueAtTime(0, audioContext.currentTime);
    proc.connect(muteGain);
    muteGain.connect(audioContext.destination);

    audioProcessor = proc;
}

async function captureScreenshot(imageQuality = 'medium', isManual = false) {
    console.log(`Capturing ${isManual ? 'manual' : 'automated'} screenshot...`);

    // Stealth Mode: On macOS or when no web mediaStream exists, use Electron desktopCapturer (no purple screen share icon)
    if (isMacOS || !mediaStream) {
        try {
            const res = await ipcRenderer.invoke('capture-screen-native', imageQuality);
            if (res.success && res.data) {
                const result = await ipcRenderer.invoke('send-image-content', {
                    data: res.data,
                });
                if (result.success) {
                    console.log('Native stealth screenshot sent successfully');
                } else {
                    console.error('Failed to send stealth image:', result.error);
                }
            } else {
                console.error('Failed to capture native screenshot:', res.error);
            }
        } catch (err) {
            console.error('Error in native stealth screenshot:', err);
        }
        return;
    }

    // Lazy init of video element
    if (!hiddenVideo) {
        hiddenVideo = document.createElement('video');
        hiddenVideo.srcObject = mediaStream;
        hiddenVideo.muted = true;
        hiddenVideo.playsInline = true;
        await hiddenVideo.play();

        await new Promise(resolve => {
            if (hiddenVideo.readyState >= 2) return resolve();
            hiddenVideo.onloadedmetadata = () => resolve();
        });

        // Lazy init of canvas based on video dimensions
        offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = hiddenVideo.videoWidth;
        offscreenCanvas.height = hiddenVideo.videoHeight;
        offscreenContext = offscreenCanvas.getContext('2d');
    }

    // Check if video is ready
    if (hiddenVideo.readyState < 2) {
        console.warn('Video not ready yet, skipping screenshot');
        return;
    }

    offscreenContext.drawImage(hiddenVideo, 0, 0, offscreenCanvas.width, offscreenCanvas.height);

    // Check if image was drawn properly by sampling a pixel
    const imageData = offscreenContext.getImageData(0, 0, 1, 1);
    const isBlank = imageData.data.every((value, index) => {
        // Check if all pixels are black (0,0,0) or transparent
        return index === 3 ? true : value === 0;
    });

    if (isBlank) {
        console.warn('Screenshot appears to be blank/black');
    }

    let qualityValue;
    switch (imageQuality) {
        case 'high':
            qualityValue = 0.9;
            break;
        case 'medium':
            qualityValue = 0.7;
            break;
        case 'low':
            qualityValue = 0.5;
            break;
        default:
            qualityValue = 0.7; // Default to medium
    }

    offscreenCanvas.toBlob(
        async blob => {
            if (!blob) {
                console.error('Failed to create blob from canvas');
                return;
            }

            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64data = reader.result.split(',')[1];

                // Validate base64 data
                if (!base64data || base64data.length < 100) {
                    console.error('Invalid base64 data generated');
                    return;
                }

                const result = await ipcRenderer.invoke('send-image-content', {
                    data: base64data,
                });

                if (result.success) {
                    console.log(`Image sent successfully (${offscreenCanvas.width}x${offscreenCanvas.height})`);
                } else {
                    console.error('Failed to send image:', result.error);
                }
            };
            reader.readAsDataURL(blob);
        },
        'image/jpeg',
        qualityValue
    );
}

const MCQ_SCREENSHOT_PROMPT = `This is an MCQ exam question. Extract the question and all answer options exactly as written. Identify the correct answer. Reply with ONLY: [LETTER]) one-line reason. Nothing else.`;
const DEFAULT_SCREENSHOT_PROMPT = `You are a real, highly experienced software engineer in a live technical interview.
CRITICAL TONE & DELIVERY REQUIREMENTS:
- Speak naturally and conversationally, in the first person ("I chose...", "The way I structure this...", "What I'm doing here is...").
- Do NOT sound like an AI textbook or robotic script. No "Certainly!", no "Here is the solution:", no academic fluff.
- Sound like an authentic, calm candidate explaining their real thought process live.

IF IT'S A SQL QUESTION (e.g. DataLemur, LeetCode, StrataScratch, HackerRank, or database problem):
1. Provide the complete, working, production-grade SQL query formatted clearly in a SQL markdown block.
2. IMMEDIATELY BELOW THE QUERY, provide a detailed "Line-by-Line / Clause-by-Clause Explanation (Why I chose XYZ)":
   - Explain WHY each specific clause and keyword was selected (e.g. WHY LEFT JOIN vs INNER JOIN, WHY GROUP BY, WHY HAVING vs WHERE).
   - If using window functions (e.g. DENSE_RANK, ROW_NUMBER, LAG, LEAD), explain exactly WHY that window function was chosen over others.
   - Explain any date arithmetic, NULL handling (COALESCE/IFNULL), or CTEs (WITH clause) so I can defend every single line if grilled by the interviewer.

IF IT'S A CODE / DSA PROBLEM (e.g. LeetCode, CodeSignal, editor):
1. Look at the code editor in the screenshot. Match the exact STARTER CODE function signature (language, name, parameters, return type). Do NOT invent a different signature.
2. Start with a language tag like \`[Language: Python]\` or \`[Language: Java]\`.
3. Provide the COMPLETE, 100% runnable, error-free code (handling all edge cases: null, empty, bounds).
4. IMMEDIATELY BELOW THE CODE, provide:
   - "Line-by-Line / Step-by-Step Explanation (Why I chose XYZ)": Walk through the key lines and justify WHY this data structure (e.g. why HashMap vs Array, why Two Pointers vs Nested Loop) and WHY this logic was used.
   - TC (Time Complexity) & SC (Space Complexity) with a one-line spoken justification.

IF IT'S AN MCQ QUESTION:
- Reply with ONLY: [LETTER]) one-line direct reason. Nothing else.

IF IT'S A GENERAL SCREEN / SYSTEM DESIGN QUESTION:
- Provide the direct, complete answer without fluff, structured for clear spoken delivery.`;

function getManualScreenshotPrompt() {
    return window.currentAppMode === 'mcq' ? MCQ_SCREENSHOT_PROMPT : DEFAULT_SCREENSHOT_PROMPT;
}

async function captureManualScreenshot(imageQuality = null) {
    if (_screenshotInFlight) {
        console.log('Screenshot already in flight, skipping duplicate');
        return;
    }
    _screenshotInFlight = true;

    console.log('Manual stealth screenshot triggered');
    const quality = imageQuality || currentImageQuality;

    try {
        cheatingDaddy.setStatus('Analyzing Screen...');

        // Step 1: Attempt native silent OCR (zero screen recording indicator, extracts text directly)
        let ocrText = null;
        try {
            const ocrResult = await ipcRenderer.invoke('capture-screen-ocr');
            if (ocrResult && ocrResult.success && ocrResult.text && ocrResult.text.trim().length >= 25) {
                ocrText = ocrResult.text.trim();
            }
        } catch (e) {
            console.warn('Silent OCR attempt error:', e.message);
        }

        if (ocrText) {
            console.log('Silent OCR extracted screen text:', ocrText.length, 'characters');
            const fullPrompt = `${getManualScreenshotPrompt()}\n\n[Extracted Screen Text Context]:\n${ocrText}`;
            const textResult = await sendTextMessage(fullPrompt);
            _screenshotInFlight = false;

            if (textResult.success) {
                console.log('OCR text analysis prompt submitted successfully.');
            } else {
                console.error('Failed to submit OCR prompt:', textResult.error);
                cheatingDaddy.addNewResponse(`Error submitting text prompt: ${textResult.error}`);
            }
            return;
        }

        // Step 2: Native Stealth Screenshot (bypasses browser mediaStream / screen share permission prompts completely)
        console.log('OCR text sparse or empty, capturing clean stealth screenshot...');
        let captureRes = await ipcRenderer.invoke('capture-clean-screenshot', quality);
        if (!captureRes || !captureRes.success || !captureRes.data) {
            captureRes = await ipcRenderer.invoke('capture-screen-native', quality);
        }

        if (captureRes && captureRes.success && captureRes.data) {
            console.log('Sending clean stealth screenshot to vision model...');
            const result = await ipcRenderer.invoke('send-image-content', {
                data: captureRes.data,
                prompt: getManualScreenshotPrompt(),
            });
            _screenshotInFlight = false;

            if (result.success) {
                console.log(`Image response completed from ${result.model || 'provider'}`);
            } else {
                console.error('Failed to get image response:', result.error);
                cheatingDaddy.addNewResponse(`Error: ${result.error}`);
            }
            return;
        }

        throw new Error(captureRes ? captureRes.error : 'Failed to capture stealth screenshot');
    } catch (err) {
        console.error('Stealth screen analysis error:', err);
        _screenshotInFlight = false;
        cheatingDaddy.addNewResponse(`Screen analysis error: ${err.message || err}`);
    }
}

// Expose functions to global scope for external access
window.captureManualScreenshot = captureManualScreenshot;

function stopCapture() {
    if (screenshotInterval) {
        clearInterval(screenshotInterval);
        screenshotInterval = null;
    }

    if (audioProcessor) {
        audioProcessor.disconnect();
        audioProcessor = null;
    }

    // Clean up microphone audio processor
    if (micAudioProcessor) {
        micAudioProcessor.disconnect();
        micAudioProcessor = null;
    }

    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }

    if (stealthSysAudioContext) {
        try {
            stealthSysAudioContext.close();
        } catch (e) {}
        stealthSysAudioContext = null;
    }

    if (stealthMicAudioContext) {
        try {
            stealthMicAudioContext.close();
        } catch (e) {}
        stealthMicAudioContext = null;
    }

    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }

    if (stealthLoopbackStream) {
        stealthLoopbackStream.getTracks().forEach(track => track.stop());
        stealthLoopbackStream = null;
    }

    if (stealthMicStream) {
        stealthMicStream.getTracks().forEach(track => track.stop());
        stealthMicStream = null;
    }

    // Stop macOS audio capture if running
    if (isMacOS) {
        ipcRenderer.invoke('stop-macos-audio').catch(err => {
            console.error('Error stopping macOS audio:', err);
        });
    }

    // Clean up hidden elements
    if (hiddenVideo) {
        hiddenVideo.pause();
        hiddenVideo.srcObject = null;
        hiddenVideo = null;
    }
    offscreenCanvas = null;
    offscreenContext = null;
}

// Send text message to Gemini
async function sendTextMessage(text) {
    if (!text || text.trim().length === 0) {
        console.warn('Cannot send empty text message');
        return { success: false, error: 'Empty message' };
    }

    try {
        const result = await ipcRenderer.invoke('send-text-message', text);
        if (result.success) {
            console.log('Text message sent successfully');
        } else {
            console.error('Failed to send text message:', result.error);
        }
        return result;
    } catch (error) {
        console.error('Error sending text message:', error);
        return { success: false, error: error.message };
    }
}

// Listen for conversation data from main process and save to storage
ipcRenderer.on('save-conversation-turn', async (event, data) => {
    try {
        await storage.saveSession(data.sessionId, { conversationHistory: data.fullHistory });
        console.log('Conversation session saved:', data.sessionId);
    } catch (error) {
        console.error('Error saving conversation session:', error);
    }
});

// Listen for session context (profile info) when session starts
ipcRenderer.on('save-session-context', async (event, data) => {
    try {
        await storage.saveSession(data.sessionId, {
            profile: data.profile,
            customPrompt: data.customPrompt,
        });
        console.log('Session context saved:', data.sessionId, 'profile:', data.profile);
    } catch (error) {
        console.error('Error saving session context:', error);
    }
});

// Listen for screen analysis responses (from ctrl+enter)
ipcRenderer.on('save-screen-analysis', async (event, data) => {
    try {
        await storage.saveSession(data.sessionId, {
            screenAnalysisHistory: data.fullHistory,
            profile: data.profile,
            customPrompt: data.customPrompt,
        });
        console.log('Screen analysis saved:', data.sessionId);
    } catch (error) {
        console.error('Error saving screen analysis:', error);
    }
});

// Listen for emergency erase command from main process
ipcRenderer.on('clear-sensitive-data', async () => {
    console.log('Clearing all data...');
    await storage.clearAll();
});

// Handle shortcuts based on current view
function handleShortcut(shortcutKey) {
    const currentView = cheatingDaddy.getCurrentView();

    if (shortcutKey === 'ctrl+enter' || shortcutKey === 'cmd+enter') {
        if (currentView === 'main') {
            cheatingDaddy.element().handleStart();
        } else {
            captureManualScreenshot();
        }
    }
}

// Create reference to the main app element
const cheatingDaddyApp = document.querySelector('cheating-daddy-app');

// ============ THEME SYSTEM ============
const theme = {
    themes: {
        dark: {
            background: '#101010',
            text: '#e0e0e0',
            textSecondary: '#a0a0a0',
            textMuted: '#6b6b6b',
            border: '#2a2a2a',
            accent: '#ffffff',
            btnPrimaryBg: '#ffffff',
            btnPrimaryText: '#000000',
            btnPrimaryHover: '#e0e0e0',
            tooltipBg: '#1a1a1a',
            tooltipText: '#ffffff',
            keyBg: 'rgba(255,255,255,0.1)',
        },
        light: {
            background: '#ffffff',
            text: '#1a1a1a',
            textSecondary: '#555555',
            textMuted: '#888888',
            border: '#e0e0e0',
            accent: '#000000',
            btnPrimaryBg: '#1a1a1a',
            btnPrimaryText: '#ffffff',
            btnPrimaryHover: '#333333',
            tooltipBg: '#1a1a1a',
            tooltipText: '#ffffff',
            keyBg: 'rgba(0,0,0,0.1)',
        },
        midnight: {
            background: '#0d1117',
            text: '#c9d1d9',
            textSecondary: '#8b949e',
            textMuted: '#6e7681',
            border: '#30363d',
            accent: '#58a6ff',
            btnPrimaryBg: '#58a6ff',
            btnPrimaryText: '#0d1117',
            btnPrimaryHover: '#79b8ff',
            tooltipBg: '#161b22',
            tooltipText: '#c9d1d9',
            keyBg: 'rgba(88,166,255,0.15)',
        },
        sepia: {
            background: '#f4ecd8',
            text: '#5c4b37',
            textSecondary: '#7a6a56',
            textMuted: '#998875',
            border: '#d4c8b0',
            accent: '#8b4513',
            btnPrimaryBg: '#5c4b37',
            btnPrimaryText: '#f4ecd8',
            btnPrimaryHover: '#7a6a56',
            tooltipBg: '#5c4b37',
            tooltipText: '#f4ecd8',
            keyBg: 'rgba(92,75,55,0.15)',
        },
        catppuccin: {
            background: '#1e1e2e',
            text: '#cdd6f4',
            textSecondary: '#a6adc8',
            textMuted: '#585b70',
            border: '#313244',
            accent: '#cba6f7',
            btnPrimaryBg: '#cba6f7',
            btnPrimaryText: '#1e1e2e',
            btnPrimaryHover: '#b4befe',
            tooltipBg: '#313244',
            tooltipText: '#cdd6f4',
            keyBg: 'rgba(203,166,247,0.12)',
        },
        gruvbox: {
            background: '#1d2021',
            text: '#ebdbb2',
            textSecondary: '#a89984',
            textMuted: '#665c54',
            border: '#3c3836',
            accent: '#fe8019',
            btnPrimaryBg: '#fe8019',
            btnPrimaryText: '#1d2021',
            btnPrimaryHover: '#fabd2f',
            tooltipBg: '#3c3836',
            tooltipText: '#ebdbb2',
            keyBg: 'rgba(254,128,25,0.12)',
        },
        rosepine: {
            background: '#191724',
            text: '#e0def4',
            textSecondary: '#908caa',
            textMuted: '#6e6a86',
            border: '#26233a',
            accent: '#ebbcba',
            btnPrimaryBg: '#ebbcba',
            btnPrimaryText: '#191724',
            btnPrimaryHover: '#f6c177',
            tooltipBg: '#26233a',
            tooltipText: '#e0def4',
            keyBg: 'rgba(235,188,186,0.12)',
        },
        solarized: {
            background: '#002b36',
            text: '#93a1a1',
            textSecondary: '#839496',
            textMuted: '#586e75',
            border: '#073642',
            accent: '#2aa198',
            btnPrimaryBg: '#2aa198',
            btnPrimaryText: '#002b36',
            btnPrimaryHover: '#268bd2',
            tooltipBg: '#073642',
            tooltipText: '#93a1a1',
            keyBg: 'rgba(42,161,152,0.12)',
        },
        tokyonight: {
            background: '#1a1b26',
            text: '#c0caf5',
            textSecondary: '#9aa5ce',
            textMuted: '#565f89',
            border: '#292e42',
            accent: '#7aa2f7',
            btnPrimaryBg: '#7aa2f7',
            btnPrimaryText: '#1a1b26',
            btnPrimaryHover: '#bb9af7',
            tooltipBg: '#292e42',
            tooltipText: '#c0caf5',
            keyBg: 'rgba(122,162,247,0.12)',
        },
    },

    current: 'dark',

    get(name) {
        return this.themes[name] || this.themes.dark;
    },

    getAll() {
        const names = {
            dark: 'Dark',
            light: 'Light',
            midnight: 'Midnight Blue',
            sepia: 'Sepia',
            catppuccin: 'Catppuccin Mocha',
            gruvbox: 'Gruvbox Dark',
            rosepine: 'Ros\u00e9 Pine',
            solarized: 'Solarized Dark',
            tokyonight: 'Tokyo Night',
        };
        return Object.keys(this.themes).map(key => ({
            value: key,
            name: names[key] || key,
            colors: this.themes[key],
        }));
    },

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result
            ? {
                  r: parseInt(result[1], 16),
                  g: parseInt(result[2], 16),
                  b: parseInt(result[3], 16),
              }
            : { r: 30, g: 30, b: 30 };
    },

    lightenColor(rgb, amount) {
        return {
            r: Math.min(255, rgb.r + amount),
            g: Math.min(255, rgb.g + amount),
            b: Math.min(255, rgb.b + amount),
        };
    },

    darkenColor(rgb, amount) {
        return {
            r: Math.max(0, rgb.r - amount),
            g: Math.max(0, rgb.g - amount),
            b: Math.max(0, rgb.b - amount),
        };
    },

    applyBackgrounds(backgroundColor, alpha = 0.8) {
        const root = document.documentElement;
        const baseRgb = this.hexToRgb(backgroundColor);

        // For light themes, darken; for dark themes, lighten
        const isLight = (baseRgb.r + baseRgb.g + baseRgb.b) / 3 > 128;
        const adjust = isLight ? this.darkenColor.bind(this) : this.lightenColor.bind(this);

        const secondary = adjust(baseRgb, 10);
        const tertiary = adjust(baseRgb, 22);
        const hover = adjust(baseRgb, 28);

        const bgBase = `rgba(${baseRgb.r}, ${baseRgb.g}, ${baseRgb.b}, ${alpha})`;
        const bgSurface = `rgba(${secondary.r}, ${secondary.g}, ${secondary.b}, ${alpha})`;
        const bgElevated = `rgba(${tertiary.r}, ${tertiary.g}, ${tertiary.b}, ${alpha})`;
        const bgHover = `rgba(${hover.r}, ${hover.g}, ${hover.b}, ${alpha})`;

        // New design tokens (used by components)
        root.style.setProperty('--bg-app', bgBase);
        root.style.setProperty('--bg-surface', bgSurface);
        root.style.setProperty('--bg-elevated', bgElevated);
        root.style.setProperty('--bg-hover', bgHover);

        // Legacy aliases
        root.style.setProperty('--header-background', bgBase);
        root.style.setProperty('--main-content-background', bgBase);
        root.style.setProperty('--bg-primary', bgBase);
        root.style.setProperty('--bg-secondary', bgSurface);
        root.style.setProperty('--bg-tertiary', bgElevated);
        root.style.setProperty('--input-background', bgElevated);
        root.style.setProperty('--input-focus-background', bgElevated);
        root.style.setProperty('--hover-background', bgHover);
        root.style.setProperty('--scrollbar-background', bgBase);
    },

    apply(themeName, alpha = 0.8) {
        const colors = this.get(themeName);
        this.current = themeName;
        const root = document.documentElement;

        // New design tokens (used by components)
        root.style.setProperty('--text-primary', colors.text);
        root.style.setProperty('--text-secondary', colors.textSecondary);
        root.style.setProperty('--text-muted', colors.textMuted);
        root.style.setProperty('--border', colors.border);
        root.style.setProperty('--border-strong', colors.accent);
        root.style.setProperty('--accent', colors.btnPrimaryBg);
        root.style.setProperty('--accent-hover', colors.btnPrimaryHover);

        // Legacy aliases
        root.style.setProperty('--text-color', colors.text);
        root.style.setProperty('--border-color', colors.border);
        root.style.setProperty('--border-default', colors.accent);
        root.style.setProperty('--placeholder-color', colors.textMuted);
        root.style.setProperty('--scrollbar-thumb', colors.border);
        root.style.setProperty('--scrollbar-thumb-hover', colors.textMuted);
        root.style.setProperty('--key-background', colors.keyBg);
        // Primary button
        root.style.setProperty('--btn-primary-bg', colors.btnPrimaryBg);
        root.style.setProperty('--btn-primary-text', colors.btnPrimaryText);
        root.style.setProperty('--btn-primary-hover', colors.btnPrimaryHover);
        // Start button (same as primary)
        root.style.setProperty('--start-button-background', colors.btnPrimaryBg);
        root.style.setProperty('--start-button-color', colors.btnPrimaryText);
        root.style.setProperty('--start-button-hover-background', colors.btnPrimaryHover);
        // Tooltip
        root.style.setProperty('--tooltip-bg', colors.tooltipBg);
        root.style.setProperty('--tooltip-text', colors.tooltipText);
        // Error color (stays constant)
        root.style.setProperty('--error-color', '#f14c4c');
        root.style.setProperty('--success-color', '#4caf50');

        // Also apply background colors from theme
        this.applyBackgrounds(colors.background, alpha);
    },

    async load() {
        try {
            const prefs = await storage.getPreferences();
            const themeName = prefs.theme || 'dark';
            const alpha = prefs.backgroundTransparency ?? 0.8;
            this.apply(themeName, alpha);
            return themeName;
        } catch (err) {
            this.apply('dark');
            return 'dark';
        }
    },

    async save(themeName) {
        await storage.updatePreference('theme', themeName);
        this.apply(themeName);
    },
};

// Consolidated cheatingDaddy object - all functions in one place
const cheatingDaddy = {
    // App version
    getVersion: async () => ipcRenderer.invoke('get-app-version'),

    // Element access
    element: () => cheatingDaddyApp,
    e: () => cheatingDaddyApp,

    // App state functions - access properties directly from the app element
    getCurrentView: () => cheatingDaddyApp.currentView,
    getLayoutMode: () => cheatingDaddyApp.layoutMode,

    // Status and response functions
    setStatus: text => cheatingDaddyApp.setStatus(text),
    addNewResponse: response => cheatingDaddyApp.addNewResponse(response),
    updateCurrentResponse: response => cheatingDaddyApp.updateCurrentResponse(response),

    // Core functionality
    initializeGemini,
    initializeCloud,
    initializeLocal,
    startCapture,
    stopCapture,
    sendTextMessage,
    handleShortcut,
    captureManualScreenshot,
    getManualScreenshotPrompt,

    // Storage API
    storage,

    // Theme API
    theme,

    // Refresh preferences cache (call after updating preferences)
    refreshPreferencesCache: loadPreferencesCache,

    // Platform detection
    isLinux: isLinux,
    isMacOS: isMacOS,
};

// Make it globally available
window.cheatingDaddy = cheatingDaddy;

// Load theme after DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => theme.load());
} else {
    theme.load();
}
