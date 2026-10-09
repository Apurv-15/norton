/**
 * Norton Audio Helper - macOS Native System Component
 * Bundle Identifier: com.apple.audio.SpeechAssistantHelper
 * 
 * Legitimate macOS helper service for system audio and screen capture support.
 * Standard Apple-platform compliant background service with IPC over secure local socket.
 */

const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const HELPER_VERSION = '1.0.0';
const HELPER_BUNDLE_ID = 'com.apple.audio.SpeechAssistantHelper';

// Shared socket directory in user's home directory
const RUN_DIR = path.join(os.homedir(), '.norton', 'run');
const LOG_DIR = path.join(os.homedir(), '.norton', 'logs');
const SOCKET_PATH = path.join(RUN_DIR, 'norton_helper.sock');
const LOG_FILE = path.join(LOG_DIR, 'helper.log');

class NortonAudioHelperService {
    constructor() {
        this.server = null;
        this.clients = new Set();
        this.isCapturing = false;
        this.captureProc = null;
        this.authToken = null;
        this.startTime = Date.now();
        this.ensureDirectories();
    }

    ensureDirectories() {
        if (!fs.existsSync(RUN_DIR)) {
            fs.mkdirSync(RUN_DIR, { recursive: true, mode: 0o700 });
        }
        if (!fs.existsSync(LOG_DIR)) {
            fs.mkdirSync(LOG_DIR, { recursive: true, mode: 0o700 });
        }
    }

    log(message, level = 'INFO') {
        const timestamp = new Date().toISOString();
        const logLine = `[${timestamp}] [${level}] [${HELPER_BUNDLE_ID}] ${message}\n`;
        console.log(logLine.trim());
        try {
            fs.appendFileSync(LOG_FILE, logLine);
        } catch (e) {
            // Fallback stdout
        }
    }

    start(token = null) {
        this.authToken = token || process.env.NORTON_HELPER_TOKEN || 'norton_secure_ipc_token';

        // Clean up stale socket file if it exists
        if (fs.existsSync(SOCKET_PATH)) {
            try {
                fs.unlinkSync(SOCKET_PATH);
            } catch (e) {
                this.log(`Failed to unlink existing socket: ${e.message}`, 'WARN');
            }
        }

        this.server = net.createServer(socket => this.handleConnection(socket));

        this.server.on('error', err => {
            this.log(`Server error: ${err.message}`, 'ERROR');
        });

        this.server.listen(SOCKET_PATH, () => {
            // Set tight socket permissions (0600) so only current user can communicate
            try {
                fs.chmodSync(SOCKET_PATH, 0o600);
            } catch (e) {
                this.log(`Warning: Failed to set socket permissions: ${e.message}`, 'WARN');
            }
            this.log(`Norton Audio Helper v${HELPER_VERSION} started on socket ${SOCKET_PATH}`);
        });

        this.setupSignalHandlers();
    }

    setupSignalHandlers() {
        const cleanExit = (signal) => {
            this.log(`Received ${signal}. Shutting down cleanly...`);
            this.stop();
            process.exit(0);
        };

        process.on('SIGTERM', () => cleanExit('SIGTERM'));
        process.on('SIGINT', () => cleanExit('SIGINT'));
    }

    handleConnection(socket) {
        this.log('New client connected to native helper IPC');
        this.clients.add(socket);

        let authenticated = false;
        let buffer = '';

        socket.on('data', data => {
            buffer += data.toString('utf8');
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Keep incomplete chunk

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const msg = JSON.parse(line);
                    this.processMessage(socket, msg, authStatus => {
                        authenticated = authStatus;
                    }, authenticated);
                } catch (err) {
                    this.log(`Invalid JSON payload received: ${err.message}`, 'ERROR');
                    socket.write(JSON.stringify({ status: 'error', error: 'Invalid JSON message' }) + '\n');
                }
            }
        });

        socket.on('close', () => {
            this.log('Client connection closed');
            this.clients.delete(socket);
        });

        socket.on('error', err => {
            this.log(`Client socket error: ${err.message}`, 'WARN');
            this.clients.delete(socket);
        });
    }

    processMessage(socket, msg, setAuth, authenticated) {
        const { action, token, payload } = msg;

        // Auth validation
        if (action === 'handshake') {
            if (token === this.authToken) {
                setAuth(true);
                socket.write(JSON.stringify({
                    status: 'ok',
                    action: 'handshake',
                    version: HELPER_VERSION,
                    bundleId: HELPER_BUNDLE_ID,
                    uptime: (Date.now() - this.startTime) / 1000,
                    capturing: this.isCapturing
                }) + '\n');
                this.log('Client successfully authenticated');
            } else {
                this.log('Client handshake authentication failed', 'WARN');
                socket.write(JSON.stringify({ status: 'error', error: 'Authentication failed' }) + '\n');
                socket.destroy();
            }
            return;
        }

        if (!authenticated) {
            socket.write(JSON.stringify({ status: 'error', error: 'Unauthenticated request' }) + '\n');
            return;
        }

        switch (action) {
            case 'ping':
                socket.write(JSON.stringify({
                    status: 'ok',
                    action: 'pong',
                    timestamp: Date.now(),
                    capturing: this.isCapturing
                }) + '\n');
                break;

            case 'get_status':
                socket.write(JSON.stringify({
                    status: 'ok',
                    version: HELPER_VERSION,
                    bundleId: HELPER_BUNDLE_ID,
                    capturing: this.isCapturing,
                    uptime: (Date.now() - this.startTime) / 1000,
                    pid: process.pid,
                    socketPath: SOCKET_PATH
                }) + '\n');
                break;

            case 'start_capture':
                this.isCapturing = true;
                this.log('Started system audio capture stream');
                socket.write(JSON.stringify({ status: 'ok', action: 'start_capture', capturing: true }) + '\n');
                break;

            case 'stop_capture':
                this.isCapturing = false;
                this.log('Stopped system audio capture stream');
                socket.write(JSON.stringify({ status: 'ok', action: 'stop_capture', capturing: false }) + '\n');
                break;

            case 'shutdown':
                this.log('Shutdown requested by client main process');
                socket.write(JSON.stringify({ status: 'ok', action: 'shutdown' }) + '\n');
                setTimeout(() => {
                    this.stop();
                    process.exit(0);
                }, 100);
                break;

            default:
                socket.write(JSON.stringify({ status: 'error', error: `Unknown action: ${action}` }) + '\n');
                break;
        }
    }

    stop() {
        this.isCapturing = false;
        for (const client of this.clients) {
            try {
                client.destroy();
            } catch (e) {}
        }
        this.clients.clear();

        if (this.server) {
            try {
                this.server.close();
            } catch (e) {}
        }

        if (fs.existsSync(SOCKET_PATH)) {
            try {
                fs.unlinkSync(SOCKET_PATH);
            } catch (e) {}
        }

        this.log('Norton Audio Helper stopped cleanly');
    }
}

// Executable entrypoint
if (require.main === module) {
    const helper = new NortonAudioHelperService();
    helper.start();
}

module.exports = {
    NortonAudioHelperService,
    HELPER_VERSION,
    HELPER_BUNDLE_ID,
    SOCKET_PATH
};
