const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_VERSION = 1;

// Default values
const DEFAULT_CONFIG = {
    configVersion: CONFIG_VERSION,
    onboarded: false,
    layout: 'normal',
};

const DEFAULT_CREDENTIALS = {
    apiKey: '',
    geminiApiKeys: ['', '', '', '', ''],
    lockedKeys: {},
    groqApiKey: '',
    deepgramApiKey: '',
    openrouterApiKey: '',
};

const DEFAULT_PREFERENCES = {
    customPrompt: '',
    providerMode: 'byok',
    activeProvider: 'auto', // 'auto' | 'gemini' | 'openrouter' | 'groq'
    openrouterModel: 'meta-llama/llama-3.3-70b-instruct',
    ocrFirstEnabled: true, // Saves 85%+ tokens on screenshots
    selectedProfile: 'interview',
    selectedLanguage: 'en-US',
    selectedScreenshotInterval: '5',
    selectedImageQuality: 'medium',
    advancedMode: false,
    audioMode: 'speaker_only',
    fontSize: 'medium',
    backgroundTransparency: 0.8,
    googleSearchEnabled: false,
    ollamaHost: 'http://127.0.0.1:11434',
    ollamaModel: 'llama3.1',
    whisperModel: 'Xenova/whisper-small',
    cvText: '',
    cvFilename: '',
    appMode: 'interview',
    appLayoutMode: 'full',
    stealthTrayIcon: false,
};

const DEFAULT_KEYBINDS = null; // null means use system defaults

const DEFAULT_LIMITS = {
    data: [], // Array of { date: 'YYYY-MM-DD', flash: { count }, flashLite: { count }, groq: { 'llama-3.3-70b-versatile': { chars, limit }, 'llama-3.1-8b-instant': { chars, limit }, 'mixtral-8x7b-32768': { chars, limit }, 'gemma2-9b-it': { chars, limit } }, gemini: { 'gemini-2.5-flash-lite': { chars } } }
};

// Get the config directory path based on OS
function getConfigDir() {
    const { app } = require('electron');

    if (app) {
        try {
            const exeDir = path.dirname(app.getPath('exe'));
            const portableDir = path.join(exeDir, 'portable-config');
            if (fs.existsSync(portableDir)) {
                return portableDir;
            }
        } catch (e) {
            console.warn('Failed to check executable portable dir:', e.message);
        }

        if (!app.isPackaged) {
            try {
                const devPortableDir = path.join(app.getAppPath(), 'portable-config');
                if (fs.existsSync(devPortableDir)) {
                    return devPortableDir;
                }
            } catch (e) {
                console.warn('Failed to check dev portable dir:', e.message);
            }
        }
    }

    const platform = os.platform();
    let configDir;

    if (platform === 'win32') {
        const legacy = path.join(os.homedir(), 'AppData', 'Roaming', 'cheating-daddy-config');
        configDir = path.join(os.homedir(), 'AppData', 'Roaming', 'norton-260-config');
        if (fs.existsSync(legacy) && !fs.existsSync(configDir)) return legacy;
    } else if (platform === 'darwin') {
        const legacy = path.join(os.homedir(), 'Library', 'Application Support', 'cheating-daddy-config');
        configDir = path.join(os.homedir(), 'Library', 'Application Support', 'norton-260-config');
        if (fs.existsSync(legacy) && !fs.existsSync(configDir)) return legacy;
    } else {
        const legacy = path.join(os.homedir(), '.config', 'cheating-daddy-config');
        configDir = path.join(os.homedir(), '.config', 'norton-260-config');
        if (fs.existsSync(legacy) && !fs.existsSync(configDir)) return legacy;
    }

    return configDir;
}

// File paths
function getConfigPath() {
    return path.join(getConfigDir(), 'config.json');
}

function getCredentialsPath() {
    return path.join(getConfigDir(), 'credentials.json');
}

function getPreferencesPath() {
    return path.join(getConfigDir(), 'preferences.json');
}

function getKeybindsPath() {
    return path.join(getConfigDir(), 'keybinds.json');
}

function getLimitsPath() {
    return path.join(getConfigDir(), 'limits.json');
}

function getHistoryDir() {
    return path.join(getConfigDir(), 'history');
}

// Helper to read JSON file safely
function readJsonFile(filePath, defaultValue) {
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.warn(`Error reading ${filePath}:`, error.message);
    }
    return defaultValue;
}

// Helper to write JSON file safely
function writeJsonFile(filePath, data) {
    try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error(`Error writing ${filePath}:`, error.message);
        return false;
    }
}

// Check if we need to initialize storage (only if config.json does not exist or is corrupt)
function needsReset() {
    const configPath = getConfigPath();
    if (!fs.existsSync(configPath)) {
        return true;
    }

    try {
        JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return false;
    } catch {
        return true;
    }
}

// Initialize/migrate config directory — ALWAYS preserves credentials, preferences, and history
function resetConfigDir() {
    const configDir = getConfigDir();

    console.log('Initializing config directory...');

    // Preserve existing data before initialization
    const savedConfig = readJsonFile(getConfigPath(), {});
    const savedPreferences = readJsonFile(getPreferencesPath(), {});
    const savedCredentials = readJsonFile(getCredentialsPath(), {});

    // Ensure directory structure exists
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(getHistoryDir(), { recursive: true });

    // Merge saved data with defaults (never overwrite user settings/keys)
    const finalConfig = { ...DEFAULT_CONFIG, ...savedConfig, configVersion: CONFIG_VERSION };
    const finalPreferences = { ...DEFAULT_PREFERENCES, ...savedPreferences };
    const finalCredentials = { ...DEFAULT_CREDENTIALS, ...savedCredentials };

    writeJsonFile(getConfigPath(), finalConfig);
    writeJsonFile(getPreferencesPath(), finalPreferences);
    writeJsonFile(getCredentialsPath(), finalCredentials);

    console.log('Config directory initialized (all credentials and preferences preserved)');
}

function syncPortableConfigToSystem() {
    try {
        const { app } = require('electron');
        if (!app) return;

        let portableDir = null;
        const potential = [path.join(process.cwd(), 'portable-config'), path.join(__dirname, '..', 'portable-config')];

        for (const p of potential) {
            if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
                portableDir = p;
                break;
            }
        }

        if (!portableDir) return;
        const targetDir = getConfigDir();
        if (path.resolve(portableDir) === path.resolve(targetDir)) return;

        const filesToSync = [
            'credentials.json',
            'preferences.json',
            'config.json',
            'keybinds.json',
            'limits.json',
            'system-design-cookies.json',
            'chatgpt-cookies.json',
        ];

        fs.mkdirSync(targetDir, { recursive: true });

        for (const file of filesToSync) {
            const srcPath = path.join(portableDir, file);
            const dstPath = path.join(targetDir, file);

            if (fs.existsSync(srcPath)) {
                if (!fs.existsSync(dstPath)) {
                    fs.copyFileSync(srcPath, dstPath);
                    console.log(`Synced ${file} from portable-config to ${targetDir}`);
                } else if (file === 'credentials.json') {
                    try {
                        const dstCreds = JSON.parse(fs.readFileSync(dstPath, 'utf8'));
                        const srcCreds = JSON.parse(fs.readFileSync(srcPath, 'utf8'));

                        const dstHasKey =
                            dstCreds.apiKey ||
                            (dstCreds.geminiApiKeys && dstCreds.geminiApiKeys.some(k => k && k.trim())) ||
                            dstCreds.openrouterApiKey ||
                            dstCreds.groqApiKey;
                        const srcHasKey =
                            srcCreds.apiKey ||
                            (srcCreds.geminiApiKeys && srcCreds.geminiApiKeys.some(k => k && k.trim())) ||
                            srcCreds.openrouterApiKey ||
                            srcCreds.groqApiKey;

                        if (!dstHasKey && srcHasKey) {
                            fs.copyFileSync(srcPath, dstPath);
                            console.log(`Synced updated credentials.json from portable-config to ${targetDir}`);
                        }
                    } catch (e) {}
                }
            }
        }
    } catch (err) {
        console.warn('Failed to sync portable config:', err.message);
    }
}

// Initialize storage - call this on app startup
function initializeStorage() {
    syncPortableConfigToSystem();
    if (needsReset()) {
        resetConfigDir();
    } else {
        // Ensure history directory exists
        const historyDir = getHistoryDir();
        if (!fs.existsSync(historyDir)) {
            fs.mkdirSync(historyDir, { recursive: true });
        }
    }
}

// ============ CONFIG ============

function getConfig() {
    return readJsonFile(getConfigPath(), DEFAULT_CONFIG);
}

function setConfig(config) {
    const current = getConfig();
    const updated = { ...current, ...config, configVersion: CONFIG_VERSION };
    return writeJsonFile(getConfigPath(), updated);
}

function updateConfig(key, value) {
    const config = getConfig();
    config[key] = value;
    return writeJsonFile(getConfigPath(), config);
}

// ============ CREDENTIALS ============

function getCredentials() {
    return readJsonFile(getCredentialsPath(), DEFAULT_CREDENTIALS);
}

function setCredentials(credentials) {
    const current = getCredentials();
    const updated = { ...current, ...credentials };
    return writeJsonFile(getCredentialsPath(), updated);
}

function getApiKey() {
    const creds = getCredentials();
    if (creds.geminiApiKeys && Array.isArray(creds.geminiApiKeys)) {
        const locked = creds.lockedKeys || {};
        const available = creds.geminiApiKeys.find(k => k && k.trim() && (!locked[k] || !locked[k].locked));
        if (available) return available;
    }
    return creds.apiKey || '';
}

function setApiKey(apiKey) {
    const creds = getCredentials();
    const keys = Array.isArray(creds.geminiApiKeys) ? [...creds.geminiApiKeys] : ['', '', '', '', ''];
    keys[0] = apiKey || '';
    return setCredentials({ apiKey: apiKey || '', geminiApiKeys: keys });
}

function getGeminiApiKeys() {
    const creds = getCredentials();
    let keys = creds.geminiApiKeys;
    if (!Array.isArray(keys) || keys.length === 0) {
        keys = creds.apiKey ? [creds.apiKey] : [];
    }
    const result = [];
    for (let i = 0; i < 5; i++) {
        result.push(keys[i] || '');
    }
    return result;
}

function setGeminiApiKeys(keys) {
    const list = Array.isArray(keys) ? keys.slice(0, 5) : [];
    while (list.length < 5) {
        list.push('');
    }
    const primary = list.find(k => k && k.trim()) || '';
    return setCredentials({
        geminiApiKeys: list,
        apiKey: primary,
    });
}

function getLockedKeys() {
    return getCredentials().lockedKeys || {};
}

function lockKey(key, reason = 'Rate limit or quota exceeded') {
    if (!key) return;
    const creds = getCredentials();
    const locked = { ...(creds.lockedKeys || {}) };
    locked[key] = {
        locked: true,
        reason: reason,
        lockedAt: Date.now(),
    };
    return setCredentials({ lockedKeys: locked });
}

function unlockKey(key) {
    if (!key) return;
    const creds = getCredentials();
    const locked = { ...(creds.lockedKeys || {}) };
    delete locked[key];
    return setCredentials({ lockedKeys: locked });
}

function resetKeyLocks() {
    return setCredentials({ lockedKeys: {} });
}

function getNextAvailableGeminiKey() {
    const keys = getGeminiApiKeys();
    const locked = getLockedKeys();
    for (let i = 0; i < keys.length; i++) {
        const k = (keys[i] || '').trim();
        if (k && (!locked[k] || !locked[k].locked)) {
            return { key: k, index: i };
        }
    }
    return null;
}

function getGroqApiKey() {
    return getCredentials().groqApiKey || '';
}

function setGroqApiKey(groqApiKey) {
    return setCredentials({ groqApiKey });
}

function getDeepgramApiKey() {
    return getCredentials().deepgramApiKey || '';
}

function setDeepgramApiKey(deepgramApiKey) {
    return setCredentials({ deepgramApiKey });
}

function getOpenrouterApiKey() {
    return getCredentials().openrouterApiKey || '';
}

function setOpenrouterApiKey(openrouterApiKey) {
    return setCredentials({ openrouterApiKey });
}

// ============ PREFERENCES ============

function getPreferences() {
    const saved = readJsonFile(getPreferencesPath(), {});
    return { ...DEFAULT_PREFERENCES, ...saved };
}

function setPreferences(preferences) {
    const current = getPreferences();
    const updated = { ...current, ...preferences };
    return writeJsonFile(getPreferencesPath(), updated);
}

function updatePreference(key, value) {
    const preferences = getPreferences();
    preferences[key] = value;
    return writeJsonFile(getPreferencesPath(), preferences);
}

// ============ KEYBINDS ============

function getKeybinds() {
    return readJsonFile(getKeybindsPath(), DEFAULT_KEYBINDS);
}

function setKeybinds(keybinds) {
    return writeJsonFile(getKeybindsPath(), keybinds);
}

// ============ LIMITS (Rate Limiting) ============

function getLimits() {
    return readJsonFile(getLimitsPath(), DEFAULT_LIMITS);
}

function setLimits(limits) {
    return writeJsonFile(getLimitsPath(), limits);
}

function getTodayDateString() {
    const now = new Date();
    return now.toISOString().split('T')[0]; // YYYY-MM-DD
}

function getTodayLimits() {
    const limits = getLimits();
    const today = getTodayDateString();

    // Find today's entry
    let todayEntry = limits.data.find(entry => entry.date === today);
    let modified = false;

    if (!todayEntry) {
        // Clean old entries and create new one
        limits.data = [];
        todayEntry = {
            date: today,
            flash: { count: 0 },
            flashLite: { count: 0 },
            groq: {
                'llama-3.3-70b-versatile': { chars: 0, limit: 1000000 },
                'llama-3.1-8b-instant': { chars: 0, limit: 1000000 },
                'mixtral-8x7b-32768': { chars: 0, limit: 1000000 },
                'gemma2-9b-it': { chars: 0, limit: 1000000 },
            },
            gemini: {
                'gemini-2.5-flash-lite': { chars: 0 },
            },
        };
        limits.data.push(todayEntry);
        modified = true;
    } else {
        // Clean old entries, keep only today's date
        limits.data = limits.data.filter(entry => entry.date === today);

        // Ensure flash / flashLite fields exist
        if (!todayEntry.flash) {
            todayEntry.flash = { count: 0 };
            modified = true;
        }
        if (!todayEntry.flashLite) {
            todayEntry.flashLite = { count: 0 };
            modified = true;
        }

        // Ensure groq field exists and has all models
        if (!todayEntry.groq) {
            todayEntry.groq = {
                'llama-3.3-70b-versatile': { chars: 0, limit: 1000000 },
                'llama-3.1-8b-instant': { chars: 0, limit: 1000000 },
                'mixtral-8x7b-32768': { chars: 0, limit: 1000000 },
                'gemma2-9b-it': { chars: 0, limit: 1000000 },
            };
            modified = true;
        } else {
            const expectedGroqModels = {
                'llama-3.3-70b-versatile': 1000000,
                'llama-3.1-8b-instant': 1000000,
                'mixtral-8x7b-32768': 1000000,
                'gemma2-9b-it': 1000000,
            };
            // Clean up deprecated groq keys
            for (const key of Object.keys(todayEntry.groq)) {
                if (!expectedGroqModels[key]) {
                    delete todayEntry.groq[key];
                    modified = true;
                }
            }
            for (const [model, limitVal] of Object.entries(expectedGroqModels)) {
                if (!todayEntry.groq[model]) {
                    todayEntry.groq[model] = { chars: 0, limit: limitVal };
                    modified = true;
                }
            }
        }

        // Ensure gemini field exists and has gemini-2.5-flash-lite, and clean up any gemma keys
        if (!todayEntry.gemini) {
            todayEntry.gemini = {
                'gemini-2.5-flash-lite': { chars: 0 },
            };
            modified = true;
        } else {
            if (!todayEntry.gemini['gemini-2.5-flash-lite']) {
                todayEntry.gemini['gemini-2.5-flash-lite'] = { chars: 0 };
                modified = true;
            }
            // Clean up deprecated gemma keys
            for (const key of Object.keys(todayEntry.gemini)) {
                if (key.includes('gemma')) {
                    delete todayEntry.gemini[key];
                    modified = true;
                }
            }
        }
    }

    if (modified) {
        setLimits(limits);
    }
    return todayEntry;
}

function incrementLimitCount(model) {
    getTodayLimits(); // Ensure initialized and migrated
    const limits = getLimits();
    const today = getTodayDateString();
    const todayEntry = limits.data.find(entry => entry.date === today);

    // Increment the appropriate model count
    if (model === 'gemini-2.5-flash') {
        todayEntry.flash.count++;
    } else if (model === 'gemini-2.5-flash-lite') {
        todayEntry.flashLite.count++;
    }

    setLimits(limits);
    return todayEntry;
}

function incrementCharUsage(provider, model, charCount) {
    getTodayLimits();

    const limits = getLimits();
    const today = getTodayDateString();
    const todayEntry = limits.data.find(entry => entry.date === today);

    if (todayEntry[provider] && todayEntry[provider][model]) {
        todayEntry[provider][model].chars += charCount;
        setLimits(limits);
    }

    return todayEntry;
}

function getAvailableModel() {
    const todayLimits = getTodayLimits();

    // RPD limits: flash = 20, flash-lite = 20
    // After both exhausted, fall back to flash (for paid API users)
    if (todayLimits.flash.count < 20) {
        return 'gemini-2.5-flash';
    } else if (todayLimits.flashLite.count < 20) {
        return 'gemini-2.5-flash-lite';
    }

    return 'gemini-2.5-flash'; // Default to flash for paid API users
}

function getModelForToday() {
    const todayEntry = getTodayLimits();
    const groq = todayEntry.groq;

    const availableActiveModels = [
        'qwen/qwen3.8-27b',
        'openai/gpt-oss-120b',
        'openai/gpt-oss-20b',
        'llama-3.3-70b-versatile',
        'llama-3.1-8b-instant'
    ];

    for (const m of availableActiveModels) {
        if (!groq[m] || groq[m].chars < (groq[m].limit || 1000000)) {
            return m;
        }
    }

    return 'qwen/qwen3.8-27b';
}

// ============ HISTORY ============

function getSessionPath(sessionId) {
    return path.join(getHistoryDir(), `${sessionId}.json`);
}

function saveSession(sessionId, data) {
    const sessionPath = getSessionPath(sessionId);

    // Load existing session to preserve metadata
    const existingSession = readJsonFile(sessionPath, null);

    const sessionData = {
        sessionId,
        createdAt: existingSession?.createdAt || parseInt(sessionId),
        lastUpdated: Date.now(),
        // Profile context - set once when session starts
        profile: data.profile || existingSession?.profile || null,
        customPrompt: data.customPrompt || existingSession?.customPrompt || null,
        // Conversation data
        conversationHistory: data.conversationHistory || existingSession?.conversationHistory || [],
        screenAnalysisHistory: data.screenAnalysisHistory || existingSession?.screenAnalysisHistory || [],
    };
    return writeJsonFile(sessionPath, sessionData);
}

function getSession(sessionId) {
    return readJsonFile(getSessionPath(sessionId), null);
}

function getAllSessions() {
    const historyDir = getHistoryDir();

    try {
        if (!fs.existsSync(historyDir)) {
            return [];
        }

        const files = fs
            .readdirSync(historyDir)
            .filter(f => f.endsWith('.json'))
            .sort((a, b) => {
                // Sort by timestamp descending (newest first)
                const tsA = parseInt(a.replace('.json', ''));
                const tsB = parseInt(b.replace('.json', ''));
                return tsB - tsA;
            });

        return files
            .map(file => {
                const sessionId = file.replace('.json', '');
                const data = readJsonFile(path.join(historyDir, file), null);
                if (data) {
                    return {
                        sessionId,
                        createdAt: data.createdAt,
                        lastUpdated: data.lastUpdated,
                        messageCount: data.conversationHistory?.length || 0,
                        screenAnalysisCount: data.screenAnalysisHistory?.length || 0,
                        profile: data.profile || null,
                        customPrompt: data.customPrompt || null,
                    };
                }
                return null;
            })
            .filter(Boolean);
    } catch (error) {
        console.error('Error reading sessions:', error.message);
        return [];
    }
}

function deleteSession(sessionId) {
    const sessionPath = getSessionPath(sessionId);
    try {
        if (fs.existsSync(sessionPath)) {
            fs.unlinkSync(sessionPath);
            return true;
        }
    } catch (error) {
        console.error('Error deleting session:', error.message);
    }
    return false;
}

function deleteAllSessions() {
    const historyDir = getHistoryDir();
    try {
        if (fs.existsSync(historyDir)) {
            const files = fs.readdirSync(historyDir).filter(f => f.endsWith('.json'));
            files.forEach(file => {
                fs.unlinkSync(path.join(historyDir, file));
            });
        }
        return true;
    } catch (error) {
        console.error('Error deleting all sessions:', error.message);
        return false;
    }
}

// ============ CLEAR ALL DATA ============

function clearAllData() {
    resetConfigDir();
    return true;
}

module.exports = {
    // Initialization
    initializeStorage,
    getConfigDir,

    // Config
    getConfig,
    setConfig,
    updateConfig,

    // Credentials
    getCredentials,
    setCredentials,
    getApiKey,
    setApiKey,
    getGeminiApiKeys,
    setGeminiApiKeys,
    getLockedKeys,
    lockKey,
    unlockKey,
    resetKeyLocks,
    getNextAvailableGeminiKey,
    getGroqApiKey,
    setGroqApiKey,
    getDeepgramApiKey,
    setDeepgramApiKey,
    getOpenrouterApiKey,
    setOpenrouterApiKey,

    // Preferences
    getPreferences,
    setPreferences,
    updatePreference,

    // Keybinds
    getKeybinds,
    setKeybinds,

    // Limits (Rate Limiting)
    getLimits,
    setLimits,
    getTodayLimits,
    incrementLimitCount,
    getAvailableModel,
    incrementCharUsage,
    getModelForToday,

    // History
    saveSession,
    getSession,
    getAllSessions,
    deleteSession,
    deleteAllSessions,

    // Clear all
    clearAllData,
};
