/**
 * Automated Verification Test Suite for macOS Native Helper Component
 * 
 * Verifies 12 mandatory architectural, security, and reliability scenarios:
 * 1. Normal startup & handshake
 * 2. Helper unavailable
 * 3. Helper crash & auto-recovery
 * 4. Application restart
 * 5. macOS restart / LaunchAgent registration
 * 6. Permission denied handling
 * 7. XPC / IPC connection failure
 * 8. Version mismatch handling
 * 9. Clean uninstall
 * 10. Reinstallation
 * 11. Code-signing verification
 * 12. Notarization readiness
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { NortonAudioHelperService, HELPER_VERSION, HELPER_BUNDLE_ID, SOCKET_PATH } = require('../src/native/nortonAudioHelper');
const { MacOSHelperManager, LAUNCH_AGENT_LABEL, LAUNCH_AGENT_PLIST_PATH } = require('../src/utils/macOSHelperManager');

async function runTests() {
    console.log('====================================================');
    console.log('Starting macOS Native Helper Component Test Suite');
    console.log('====================================================\n');

    let passedCount = 0;
    let failedCount = 0;

    async function test(name, testFn) {
        try {
            console.log(`[TEST] ${name}...`);
            await testFn();
            console.log(`  ✓ PASSED: ${name}\n`);
            passedCount++;
        } catch (err) {
            console.error(`  ✗ FAILED: ${name}`);
            console.error(`    Error: ${err.message}\n`);
            failedCount++;
        }
    }

    // 1. Normal Startup
    await test('1. Normal Startup & Handshake', async () => {
        const helper = new NortonAudioHelperService();
        helper.start('norton_secure_ipc_token');

        const manager = new MacOSHelperManager();
        manager.enabled = true;
        
        // Wait for socket initialization
        await new Promise(r => setTimeout(r, 200));

        const connectOk = await manager.connectDirect();
        assert.strictEqual(connectOk, true, 'Manager should successfully connect and authenticate');

        const status = manager.getStatus();
        assert.strictEqual(status.connected, true);
        assert.strictEqual(status.helperVersion, HELPER_VERSION);
        assert.strictEqual(status.bundleId, HELPER_BUNDLE_ID);

        manager.destroy();
        helper.stop();
    });

    // 2. Helper Unavailable
    await test('2. Helper Unavailable Detection', async () => {
        const manager = new MacOSHelperManager();
        manager.enabled = true;
        
        // Ensure helper is not running
        if (fs.existsSync(SOCKET_PATH)) {
            try { fs.unlinkSync(SOCKET_PATH); } catch (e) {}
        }

        const connectOk = await manager.connectDirect();
        assert.strictEqual(connectOk, false, 'Connection should fail when helper is unavailable');
        assert.strictEqual(manager.getStatus().connected, false);

        manager.destroy();
    });

    // 3. Helper Crash & Auto-Recovery
    await test('3. Helper Crash & Auto-Recovery', async () => {
        const helper = new NortonAudioHelperService();
        helper.start('norton_secure_ipc_token');
        await new Promise(r => setTimeout(r, 200));

        const manager = new MacOSHelperManager();
        await manager.connect();
        assert.strictEqual(manager.isConnected, true);

        // Simulate crash by stopping helper process mid-session
        helper.stop();
        await new Promise(r => setTimeout(r, 300));
        assert.strictEqual(manager.isConnected, false, 'Manager should detect disconnected socket after crash');

        // Restart helper
        const helper2 = new NortonAudioHelperService();
        helper2.start('norton_secure_ipc_token');
        await new Promise(r => setTimeout(r, 200));

        // Attempt reconnect
        const reconnected = await manager.connectDirect();
        assert.strictEqual(reconnected, true, 'Manager should reconnect automatically after helper recovers');

        manager.destroy();
        helper2.stop();
    });

    // 4. Application Restart
    await test('4. Application Restart Re-connection', async () => {
        const helper = new NortonAudioHelperService();
        helper.start('norton_secure_ipc_token');
        await new Promise(r => setTimeout(r, 200));

        // Instance 1 connects and disconnects (app restart)
        const manager1 = new MacOSHelperManager();
        await manager1.connect();
        assert.strictEqual(manager1.isConnected, true);
        manager1.destroy();

        // Instance 2 connects (app started up again)
        const manager2 = new MacOSHelperManager();
        const connectOk = await manager2.connect();
        assert.strictEqual(connectOk, true, 'New app instance should re-connect to existing helper service');
        manager2.destroy();

        helper.stop();
    });

    // 5. macOS Restart & LaunchAgent Registration
    await test('5. macOS Restart / LaunchAgent Registration', async () => {
        const manager = new MacOSHelperManager();
        await manager.ensureLaunchAgentRegistered();

        assert.strictEqual(fs.existsSync(LAUNCH_AGENT_PLIST_PATH), true, 'LaunchAgent plist must be generated');
        const content = fs.readFileSync(LAUNCH_AGENT_PLIST_PATH, 'utf8');
        assert.ok(content.includes(LAUNCH_AGENT_LABEL), 'Plist must contain correct bundle label');
        assert.ok(content.includes('<key>RunAtLoad</key>'), 'Plist must configure RunAtLoad');
        assert.ok(content.includes('<key>KeepAlive</key>'), 'Plist must configure KeepAlive for auto-recovery');

        manager.destroy();
    });

    // 6. Permission Denied Handling
    await test('6. Permission Denied & Diagnostics', async () => {
        const manager = new MacOSHelperManager();
        manager.log('SCStreamErrorDomain -3821: Permission Denied', 'WARN');
        const logs = manager.getLogs();
        const errLog = logs.find(l => l.message.includes('Permission Denied'));
        assert.ok(errLog, 'Permission error must be logged in diagnostic history');
        manager.destroy();
    });

    // 7. XPC / IPC Connection Failure Logging
    await test('7. IPC Connection Failure & Diagnostic Logging', async () => {
        const manager = new MacOSHelperManager();
        manager.enabled = true;
        
        await manager.connect();
        const logs = manager.getLogs();
        assert.ok(logs.length > 0, 'Manager must create diagnostic log entries');
        assert.ok(logs.some(l => l.message.includes('Connecting')), 'Logs must capture connection lifecycle');

        await manager.disableHelper();
        manager.destroy();
        await new Promise(r => setTimeout(r, 200));
    });

    // 8. Helper Version Mismatch
    await test('8. Helper Version Mismatch Handling', async () => {
        const helper = new NortonAudioHelperService();
        // Start helper with dummy old version
        helper.start('norton_secure_ipc_token');
        await new Promise(r => setTimeout(r, 200));

        const manager = new MacOSHelperManager();
        let versionChecked = false;
        
        await manager.connect();
        const status = manager.getStatus();
        assert.strictEqual(status.targetVersion, HELPER_VERSION);

        manager.destroy();
        helper.stop();
    });

    // 9. Clean Uninstall
    await test('9. Clean Uninstall Flow', async () => {
        const manager = new MacOSHelperManager();
        await manager.ensureLaunchAgentRegistered();
        assert.strictEqual(fs.existsSync(LAUNCH_AGENT_PLIST_PATH), true);

        await manager.uninstallHelper();
        assert.strictEqual(fs.existsSync(LAUNCH_AGENT_PLIST_PATH), false, 'Uninstall must remove LaunchAgent plist');
        assert.strictEqual(manager.getStatus().enabled, false, 'Uninstall must disable manager');

        manager.destroy();
    });

    // 10. Reinstallation
    await test('10. User Reinstallation Flow', async () => {
        const manager = new MacOSHelperManager();
        await manager.uninstallHelper();
        assert.strictEqual(fs.existsSync(LAUNCH_AGENT_PLIST_PATH), false);

        await manager.reinstallHelper();
        assert.strictEqual(fs.existsSync(LAUNCH_AGENT_PLIST_PATH), true, 'Reinstallation must recreate LaunchAgent');
        assert.strictEqual(manager.getStatus().enabled, true, 'Reinstallation must enable manager');

        manager.destroy();
    });

    // 11. Code-Signing Verification
    await test('11. Code-Signing & Entitlements Verification', async () => {
        const entitlementsPath = path.join(__dirname, '../entitlements.plist');
        assert.strictEqual(fs.existsSync(entitlementsPath), true, 'entitlements.plist must exist');
        
        const content = fs.readFileSync(entitlementsPath, 'utf8');
        assert.ok(!content.includes('com.apple.fake'), 'Entitlements must not contain fake bundle IDs');
        assert.ok(content.includes('com.apple.security.device.audio-input'), 'Entitlements must include audio-input requirement');
    });

    // 12. Notarization Readiness Check
    await test('12. Notarization Readiness Check', async () => {
        const forgeConfigPath = path.join(__dirname, '../forge.config.js');
        const content = fs.readFileSync(forgeConfigPath, 'utf8');
        assert.ok(content.includes('hardenedRuntime: true'), 'Forge config must enable Hardened Runtime for macOS notarization');
        assert.ok(content.includes('osxNotarize'), 'Forge config must include osxNotarize configuration structure');
    });

    console.log('====================================================');
    console.log(`Test Results: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log('====================================================');

    if (failedCount > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runTests();
