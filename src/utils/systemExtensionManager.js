const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const SECURITY_SOCKET_PATH = '/tmp/norton_security.sock';

class SystemExtensionManager {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.protectionStatus = 'PROTECTION_STARTING';
        this.statusListeners = new Set();
        this.reconnectTimer = null;
    }

    getStatus() {
        return {
            connected: this.isConnected,
            protectionStatus: this.protectionStatus,
            socketPath: SECURITY_SOCKET_PATH
        };
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
            try { listener(status); } catch (e) {}
        }
    }

    async initialize() {
        if (process.platform !== 'darwin') {
            this.protectionStatus = 'PROTECTION_DISABLED';
            return false;
        }

        console.log('[SystemExtensionManager] Initializing Security Extension Manager...');

        // If the socket isn't present the binary hasn't started yet.
        // Spawn it now (detached so it survives Electron restarts) and give
        // it 800 ms to create the socket before we attempt to connect.
        if (!fs.existsSync(SECURITY_SOCKET_PATH)) {
            await this.startExtensionProcess();
            await new Promise(r => setTimeout(r, 800));
        }

        await this.connect();
        return true;
    }

    getExtensionBinaryPath() {
        const packagedPath = path.join(process.resourcesPath || '', 'NortonSecurityExtension');
        const localPath = path.join(__dirname, '../../bin/NortonSecurityExtension');
        if (fs.existsSync(packagedPath)) return packagedPath;
        if (fs.existsSync(localPath)) return localPath;
        return null;
    }

    async startExtensionProcess() {
        const binPath = this.getExtensionBinaryPath();
        if (!binPath) {
            console.warn('[SystemExtensionManager] Security extension binary not found — skipping spawn');
            return;
        }
        try {
            const proc = spawn(binPath, [], { detached: true, stdio: 'ignore' });
            proc.unref();
            console.log(`[SystemExtensionManager] Spawned security extension PID ${proc.pid}`);
        } catch (e) {
            console.warn('[SystemExtensionManager] Failed to spawn security extension:', e.message);
        }
    }


    connect() {
        return new Promise(resolve => {
            if (this.socket) {
                try { this.socket.destroy(); } catch (e) {}
                this.socket = null;
            }

            if (!fs.existsSync(SECURITY_SOCKET_PATH)) {
                this.isConnected = false;
                this.protectionStatus = 'PROTECTION_REQUIRES_APPROVAL';
                this.notifyStatusChange();
                this.scheduleReconnect();
                resolve(false);
                return;
            }

            const client = net.createConnection(SECURITY_SOCKET_PATH);
            let buffer = '';

            client.on('connect', () => {
                this.isConnected = true;
                this.socket = client;
                console.log('[SystemExtensionManager] Connected to Security Extension IPC socket');
                client.write(JSON.stringify({ action: 'getSecurityStatus' }) + '\n');
            });

            client.on('data', data => {
                buffer += data.toString('utf8');
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const msg = JSON.parse(line);
                        if (msg.success && msg.data) {
                            this.protectionStatus = msg.data.status || 'PROTECTION_ACTIVE';
                            this.notifyStatusChange();
                        }
                    } catch (e) {}
                }
            });

            client.on('error', () => {
                this.isConnected = false;
                this.protectionStatus = 'PROTECTION_REQUIRES_APPROVAL';
                this.notifyStatusChange();
                this.scheduleReconnect();
                resolve(false);
            });

            client.on('close', () => {
                this.isConnected = false;
                this.notifyStatusChange();
                this.scheduleReconnect();
            });

            setTimeout(() => resolve(this.isConnected), 1500);
        });
    }

    scheduleReconnect() {
        if (this.reconnectTimer) return;
        this.reconnectTimer = setTimeout(async () => {
            this.reconnectTimer = null;
            await this.connect();
        }, 5000);
    }
}

const systemExtensionManager = new SystemExtensionManager();

module.exports = {
    systemExtensionManager,
    SystemExtensionManager,
    SECURITY_SOCKET_PATH
};
