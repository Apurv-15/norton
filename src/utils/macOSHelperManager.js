/**
 * macOS Native Helper Manager
 * 
 * Manages the lifecycle of the legitimate macOS helper service (com.apple.audio.SpeechAssistantHelper),
 * handles secure IPC communication, exponential backoff reconnection, version validation,
 * macOS LaunchAgent registration (SMAppService compatible), permission diagnostics, and clean uninstallation.
 */

const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, exec } = require('child_process');
const { HELPER_VERSION, HELPER_BUNDLE_ID, SOCKET_PATH } = require('../native/nortonAudioHelper');

const LAUNCH_AGENT_LABEL = 'com.apple.audio.SpeechAssistantHelper';
const LAUNCH_AGENT_PLIST_DIR = path.join(os.homedir(), 'Library', 'LaunchAgents');
const LAUNCH_AGENT_PLIST_PATH = path.join(LAUNCH_AGENT_PLIST_DIR, `${LAUNCH_AGENT_LABEL}.plist`);
const AUTH_TOKEN = 'norton_secure_ipc_token';

const USE_NATIVE_SWIFT_HELPER = process.env.USE_NATIVE_SWIFT_HELPER !== 'false';

class MacOSHelperManager {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.isCapturing = false;
        this.helperPid = null;
        this.helperVersion = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectTimer = null;
        this.heartbeatTimer = null;
        this.logs = [];
        this.enabled = true;
        this.statusListeners = new Set();
        this.helperProcess = null;
        this.useSwiftHelper = USE_NATIVE_SWIFT_HELPER;
    }

    log(message, level = 'INFO') {
        const timestamp = new Date().toISOString();
        const entry = { timestamp, level, message };
        this.logs.push(entry);
        if (this.logs.length > 500) this.logs.shift(); // Keep last 500 logs
        console.log(`[MacOSHelperManager] [${level}] ${message}`);
        this.notifyStatusChange();
    }

    getLogs() {
        return [...this.logs];
    }

    addStatusListener(listener) {
        this.statusListeners.add(listener);
    }

    removeStatusListener(listener) {
        this.statusListeners.delete(listener);
    }

    notifyStatusChange() {
        const status = this.getStatus();
        for (const listener of this.statusListeners) {
            try {
                listener(status);
            } catch (e) {}
        }
    }

    getStatus() {
        return {
            enabled: this.enabled,
            connected: this.isConnected,
            capturing: this.isCapturing,
            helperVersion: this.helperVersion,
            targetVersion: HELPER_VERSION,
            bundleId: HELPER_BUNDLE_ID,
            reconnectAttempts: this.reconnectAttempts,
            pid: this.helperPid,
            socketPath: SOCKET_PATH,
            useSwiftHelper: this.useSwiftHelper
        };
    }

    async initialize() {
        if (process.platform !== 'darwin') {
            this.log('Not on macOS. Native helper service disabled.', 'INFO');
            this.enabled = false;
            return false;
        }

        this.log(`Initializing MacOSHelperManager (Target Helper v${HELPER_VERSION}, Swift native mode: ${this.useSwiftHelper})...`);
        
        // Step 1: Ensure LaunchAgent configuration exists
        await this.ensureLaunchAgentRegistered();

        // Step 2: Attempt connection to helper
        await this.connect();

        // Step 3: Start heartbeat loop
        this.startHeartbeat();

        return true;
    }

    getHelperBinaryPath() {
        // Unpacked resource in production bundle vs local dev build
        const packagedPath = path.join(process.resourcesPath || '', 'NortonHelper');
        const localPath = path.join(__dirname, '../../bin/NortonHelper');

        if (fs.existsSync(packagedPath)) return packagedPath;
        if (fs.existsSync(localPath)) return localPath;
        return null;
    }

    async ensureLaunchAgentRegistered() {
        if (!fs.existsSync(LAUNCH_AGENT_PLIST_DIR)) {
            try {
                fs.mkdirSync(LAUNCH_AGENT_PLIST_DIR, { recursive: true });
            } catch (e) {
                this.log(`Failed to create LaunchAgents directory: ${e.message}`, 'WARN');
            }
        }

        const swiftBinPath = this.getHelperBinaryPath();
        const helperScriptPath = path.join(__dirname, '../native/nortonAudioHelper.js');
        const nodeBinaryPath = process.execPath;

        let programArgsXml = '';
        if (this.useSwiftHelper && swiftBinPath) {
            programArgsXml = `        <string>${swiftBinPath}</string>`;
        } else {
            programArgsXml = `        <string>${nodeBinaryPath}</string>\n        <string>${helperScriptPath}</string>`;
        }

        const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LAUNCH_AGENT_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
${programArgsXml}
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>NORTON_HELPER_TOKEN</key>
        <string>${AUTH_TOKEN}</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ProcessType</key>
    <string>Adaptive</string>
    <key>LegacyTimers</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${path.join(os.homedir(), '.norton', 'logs', 'launchd_stdout.log')}</string>
    <key>StandardErrorPath</key>
    <string>${path.join(os.homedir(), '.norton', 'logs', 'launchd_stderr.log')}</string>
</dict>
</plist>
`;

        try {
            fs.writeFileSync(LAUNCH_AGENT_PLIST_PATH, plistContent, 'utf8');
            this.log(`LaunchAgent plist updated at ${LAUNCH_AGENT_PLIST_PATH}`);
        } catch (e) {
            this.log(`Could not write LaunchAgent plist: ${e.message}`, 'WARN');
        }
    }

    async startHelperProcess() {
        if (!this.enabled) return false;

        this.log('Starting native helper service process...');
        const swiftBinPath = this.getHelperBinaryPath();
        const helperScriptPath = path.join(__dirname, '../native/nortonAudioHelper.js');

        try {
            if (this.useSwiftHelper && swiftBinPath) {
                this.log(`Spawning Swift native helper binary at ${swiftBinPath}...`);
                this.helperProcess = spawn(swiftBinPath, [], {
                    detached: true,
                    stdio: 'ignore',
                    env: {
                        ...process.env,
                        NORTON_HELPER_TOKEN: AUTH_TOKEN
                    }
                });
            } else {
                this.log('Spawning Node fallback helper script...');
                this.helperProcess = spawn(process.execPath, [helperScriptPath], {
                    detached: true,
                    stdio: 'ignore',
                    env: {
                        ...process.env,
                        NORTON_HELPER_TOKEN: AUTH_TOKEN
                    }
                });
            }

            this.helperProcess.unref();
            this.log(`Helper process spawned with PID ${this.helperProcess.pid}`);
            return true;
        } catch (err) {
            this.log(`Failed to spawn helper process: ${err.message}`, 'ERROR');
            return false;
        }
    }

    connect() {
        return new Promise(resolve => {
            if (!this.enabled) {
                resolve(false);
                return;
            }

            if (this.socket) {
                try {
                    this.socket.destroy();
                } catch (e) {}
                this.socket = null;
            }

            this.log(`Connecting to helper socket at ${SOCKET_PATH}...`);
            const client = net.createConnection(SOCKET_PATH);

            let handshakeResolved = false;
            let buffer = '';

            client.on('connect', () => {
                this.log('Socket connected. Sending auth handshake...');
                const handshake = JSON.stringify({
                    action: 'handshake',
                    token: AUTH_TOKEN,
                    clientVersion: HELPER_VERSION
                }) + '\n';
                client.write(handshake);
            });

            client.on('data', data => {
                buffer += data.toString('utf8');
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const msg = JSON.parse(line);
                        if (msg.action === 'handshake') {
                            if (msg.status === 'ok') {
                                this.isConnected = true;
                                this.socket = client;
                                this.helperVersion = msg.version;
                                this.isCapturing = msg.capturing || false;
                                this.reconnectAttempts = 0;
                                this.log(`Helper handshake successful (Helper Version: ${msg.version})`);

                                // Version Mismatch Check
                                if (msg.version !== HELPER_VERSION) {
                                    this.log(`Version mismatch! Helper version ${msg.version} != target ${HELPER_VERSION}. Restarting helper...`, 'WARN');
                                    this.reinstallHelper();
                                }

                                if (!handshakeResolved) {
                                    handshakeResolved = true;
                                    resolve(true);
                                }
                            } else {
                                this.log(`Handshake rejected: ${msg.error}`, 'ERROR');
                                client.destroy();
                                if (!handshakeResolved) {
                                    handshakeResolved = true;
                                    resolve(false);
                                }
                            }
                        } else {
                            this.handleIncomingMessage(msg);
                        }
                    } catch (e) {
                        this.log(`Error parsing IPC response: ${e.message}`, 'ERROR');
                    }
                }
            });

            client.on('error', async err => {
                this.log(`IPC Connection error: ${err.message}`, 'WARN');
                this.isConnected = false;
                if (!handshakeResolved) {
                    handshakeResolved = true;
                    // Try launching helper if socket connection failed
                    await this.startHelperProcess();
                    // Wait briefly and attempt connection
                    setTimeout(async () => {
                        const retryOk = await this.connectDirect();
                        resolve(retryOk);
                    }, 500);
                }
            });

            client.on('close', () => {
                if (this.isConnected) {
                    this.log('IPC Connection closed by helper', 'WARN');
                }
                this.isConnected = false;
                this.socket = null;
                this.scheduleReconnect();
            });

            // Connection timeout after 2 seconds
            setTimeout(() => {
                if (!handshakeResolved) {
                    handshakeResolved = true;
                    this.log('IPC Handshake timeout', 'WARN');
                    client.destroy();
                    resolve(false);
                }
            }, 2000);
        });
    }

    connectDirect() {
        return new Promise(resolve => {
            const client = net.createConnection(SOCKET_PATH);
            let buffer = '';

            client.on('connect', () => {
                client.write(JSON.stringify({
                    action: 'handshake',
                    token: AUTH_TOKEN,
                    clientVersion: HELPER_VERSION
                }) + '\n');
            });

            client.on('data', data => {
                buffer += data.toString('utf8');
                if (buffer.includes('\n')) {
                    try {
                        const msg = JSON.parse(buffer.trim());
                        if (msg.status === 'ok') {
                            this.isConnected = true;
                            this.socket = client;
                            this.helperVersion = msg.version;
                            this.reconnectAttempts = 0;
                            resolve(true);
                            return;
                        }
                    } catch (e) {}
                }
            });

            client.on('error', () => {
                resolve(false);
            });

            setTimeout(() => resolve(false), 1500);
        });
    }

    handleIncomingMessage(msg) {
        if (msg.action === 'pong') {
            this.isCapturing = msg.capturing;
        }
    }

    scheduleReconnect() {
        if (!this.enabled || this.reconnectTimer) return;

        this.reconnectAttempts++;
        if (this.reconnectAttempts > this.maxReconnectAttempts) {
            this.log(`Max reconnect attempts (${this.maxReconnectAttempts}) reached. Helper remains unavailable.`, 'ERROR');
            return;
        }

        // Exponential backoff: 1s, 2s, 4s, 8s... capped at 30s
        const backoffMs = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000);
        this.log(`Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${backoffMs}ms...`);

        this.reconnectTimer = setTimeout(async () => {
            this.reconnectTimer = null;
            await this.startHelperProcess();
            await this.connect();
        }, backoffMs);
    }

    startHeartbeat() {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

        this.heartbeatTimer = setInterval(() => {
            if (this.isConnected && this.socket) {
                try {
                    this.socket.write(JSON.stringify({ action: 'ping' }) + '\n');
                } catch (e) {
                    this.log(`Heartbeat failed: ${e.message}`, 'WARN');
                    this.isConnected = false;
                }
            } else if (this.enabled && !this.reconnectTimer) {
                this.scheduleReconnect();
            }
        }, 5000);
    }

    sendIPCMessage(action, payload = {}) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected || !this.socket) {
                reject(new Error('Helper service not connected'));
                return;
            }

            const msgStr = JSON.stringify({ action, payload }) + '\n';
            try {
                this.socket.write(msgStr);
                resolve(true);
            } catch (err) {
                this.log(`Failed to send IPC message (${action}): ${err.message}`, 'ERROR');
                reject(err);
            }
        });
    }

    async startAudioCapture() {
        this.log('Requesting helper to start system audio capture...');
        return this.sendIPCMessage('start_capture');
    }

    async stopAudioCapture() {
        this.log('Requesting helper to stop system audio capture...');
        return this.sendIPCMessage('stop_capture');
    }

    async disableHelper() {
        this.log('Disabling native helper service...');
        this.enabled = false;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.isConnected) {
            try {
                await this.sendIPCMessage('shutdown');
            } catch (e) {}
        }

        if (this.helperProcess) {
            try {
                this.helperProcess.kill('SIGTERM');
            } catch (e) {}
            this.helperProcess = null;
        }

        if (this.socket) {
            this.socket.destroy();
            this.socket = null;
        }

        this.isConnected = false;
        this.notifyStatusChange();
    }

    async enableHelper() {
        this.log('Enabling native helper service...');
        this.enabled = true;
        this.reconnectAttempts = 0;
        await this.startHelperProcess();
        await this.connect();
    }

    async reinstallHelper() {
        this.log('Reinstalling helper service...');
        await this.disableHelper();
        await this.ensureLaunchAgentRegistered();
        await this.enableHelper();
    }

    async uninstallHelper() {
        this.log('Cleanly uninstalling native helper service...');
        await this.disableHelper();

        // Remove LaunchAgent plist
        if (fs.existsSync(LAUNCH_AGENT_PLIST_PATH)) {
            try {
                fs.unlinkSync(LAUNCH_AGENT_PLIST_PATH);
                this.log(`Removed LaunchAgent plist at ${LAUNCH_AGENT_PLIST_PATH}`);
            } catch (e) {
                this.log(`Failed to remove LaunchAgent plist: ${e.message}`, 'WARN');
            }
        }

        // Unlink socket if exists
        if (fs.existsSync(SOCKET_PATH)) {
            try {
                fs.unlinkSync(SOCKET_PATH);
            } catch (e) {}
        }

        this.log('Uninstall complete.');
        this.notifyStatusChange();
    }

    destroy() {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.disableHelper();
    }
}

// Singleton instance
const helperManager = new MacOSHelperManager();

module.exports = {
    helperManager,
    MacOSHelperManager,
    LAUNCH_AGENT_LABEL,
    LAUNCH_AGENT_PLIST_PATH
};
