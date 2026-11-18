const { GoogleGenAI, Modality } = require('@google/genai');
const { BrowserWindow, ipcMain, dialog } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const WebSocket = require('ws');

// Persistent HTTP/1.1 Keep-Alive Agent for Groq API
const groqAgent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 25000,
    maxSockets: 4,
    timeout: 5000,
});

let lastPrewarmTime = 0;
function prewarmGroqSocket() {
    const now = Date.now();
    if (now - lastPrewarmTime < 20000) return; // Throttle to once every 20s
    lastPrewarmTime = now;

    const groqApiKey = getGroqApiKey();
    if (!groqApiKey) return;

    try {
        const req = https.request('https://api.groq.com/openai/v1/models', {
            method: 'GET',
            agent: groqAgent,
            headers: {
                Authorization: 'Bearer ' + groqApiKey,
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
            },
        }, res => {
            res.destroy();
        });
        req.on('error', () => {});
        req.setTimeout(2500, () => req.destroy());
        req.end();
    } catch (e) {}
}
const { saveDebugAudio } = require('../audioUtils');
const { getSystemPrompt } = require('./prompts');
const {
    getAvailableModel,
    incrementLimitCount,
    getApiKey,
    getGeminiApiKeys,
    getLockedKeys,
    lockKey,
    unlockKey,
    resetKeyLocks,
    getNextAvailableGeminiKey,
    getGroqApiKey,
    getDeepgramApiKey,
    getOpenrouterApiKey,
    incrementCharUsage,
    getModelForToday,
    getPreferences,
} = require('../storage');
const { connectCloud, sendCloudAudio, sendCloudText, sendCloudImage, closeCloud, isCloudActive, setOnTurnComplete } = require('./cloud');

// Lazy-loaded to avoid circular dependency (localai.js imports from gemini.js)
let _localai = null;
function getLocalAi() {
    if (!_localai) _localai = require('./localai');
    return _localai;
}

// Provider mode: 'byok', 'cloud', or 'local'
let currentProviderMode = 'byok';

// Groq conversation history for context
let groqConversationHistory = [];

// Conversation tracking variables
let currentSessionId = null;
let currentGroqAbortController = null;
let isGroqGenerating = false;
let currentTranscription = '';
let conversationHistory = [];
let screenAnalysisHistory = [];
let currentProfile = null;
let currentCustomPrompt = null;
let isInitializingSession = false;
let currentSystemPrompt = null;

function formatSpeakerResults(results) {
    let text = '';
    for (const result of results) {
        if (result.transcript && result.speakerId) {
            const speakerLabel = result.speakerId === 1 ? 'Interviewer' : 'Candidate';
            text += `[${speakerLabel}]: ${result.transcript}\n`;
        }
    }
    return text;
}

module.exports.formatSpeakerResults = formatSpeakerResults;

// Audio capture variables
let systemAudioProc = null;
let messageBuffer = '';
let deepgramWs = null;
let deepgramApiKey = '';
let deepgramTranscriptionTimeout = null;
let deepgramKeepAliveInterval = null;
let isManualMode = false;
let isManualRecording = false;
let hasShownPermissionDialog = false;

// Reconnection variables
let isUserClosing = false;
let sessionParams = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY = 2000;

function sendToRenderer(channel, data) {
    if (!BrowserWindow || typeof BrowserWindow.getAllWindows !== 'function') return;
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
        if (win && !win.isDestroyed()) {
            win.webContents.send(channel, data);
        }
    }
    // ponytail: also push to MCQ overlay when active
    if (currentProfile === 'mcq') {
        const { getMcqOverlayWindow } = require('./window');
        const overlay = getMcqOverlayWindow();
        if (overlay && !overlay.isDestroyed()) {
            // Only forward AI responses / answers to the MCQ overlay, not status updates or logs
            if (channel === 'new-response' || channel === 'update-response') {
                overlay.webContents.send('mcq-answer', data);
            }
        }
    }
    if (channel === 'update-status') {
        try {
            const indexModule = require('../index');
            if (indexModule.updateTrayStatus) {
                indexModule.updateTrayStatus(data);
            }
        } catch (e) {}
    }
    if (channel === 'new-response' || channel === 'update-response') {
        try {
            const indexModule = require('../index');
            if (indexModule.updateTrayResponsePreview) {
                indexModule.updateTrayResponsePreview(typeof data === 'string' ? data : JSON.stringify(data));
            }
        } catch (e) {
            // Ignore potential circular require warnings during boot
        }
    }
}

// Build context message for session restoration
function buildContextMessage() {
    const lastTurns = conversationHistory.slice(-20);
    const validTurns = lastTurns.filter(turn => turn.transcription?.trim() && turn.ai_response?.trim());

    if (validTurns.length === 0) return null;

    const contextLines = validTurns.map(turn => `[Interviewer]: ${turn.transcription.trim()}\n[Your answer]: ${turn.ai_response.trim()}`);

    return `Session reconnected. Here's the conversation so far:\n\n${contextLines.join('\n\n')}\n\nContinue from here.`;
}

// Conversation management functions
function getEffectiveSystemPrompt(forceRefresh = false) {
    if (currentSystemPrompt && !forceRefresh) return currentSystemPrompt;

    const prefs = getPreferences() || {};
    const enabledTools = prefs.enabledTools || [];
    const googleSearchEnabled = enabledTools.some(tool => tool.googleSearch);
    const profile = currentProfile || prefs.selectedProfile || 'interview';

    let customPrompt = currentCustomPrompt !== null && currentCustomPrompt !== undefined
        ? currentCustomPrompt
        : (prefs.customPrompt || '');

    let finalCustomPrompt = customPrompt;
    if (prefs.cvText && prefs.cvText.trim()) {
        finalCustomPrompt = `${finalCustomPrompt}\n\n[CV/Resume Context]:\n${prefs.cvText}`;
    }

    currentSystemPrompt = getSystemPrompt(profile, finalCustomPrompt, googleSearchEnabled);
    return currentSystemPrompt;
}

function refreshSystemPrompt() {
    return getEffectiveSystemPrompt(true);
}

function initializeNewSession(profile = null, customPrompt = null) {
    currentSessionId = Date.now().toString();
    currentTranscription = '';
    conversationHistory = [];
    screenAnalysisHistory = [];
    groqConversationHistory = [];

    const prefs = getPreferences() || {};
    currentProfile = profile || prefs.selectedProfile || 'interview';
    currentCustomPrompt = customPrompt !== null && customPrompt !== undefined
        ? customPrompt
        : (prefs.customPrompt || '');

    // Recompute currentSystemPrompt with CV and active profile
    getEffectiveSystemPrompt(true);

    console.log('New conversation session started:', currentSessionId, 'profile:', currentProfile);

    // Save initial session with profile context
    if (currentProfile) {
        sendToRenderer('save-session-context', {
            sessionId: currentSessionId,
            profile: currentProfile,
            customPrompt: currentCustomPrompt || '',
        });
    }
}

function saveConversationTurn(transcription, aiResponse) {
    if (!currentSessionId) {
        initializeNewSession();
    }

    const conversationTurn = {
        timestamp: Date.now(),
        transcription: transcription.trim(),
        ai_response: aiResponse.trim(),
    };

    conversationHistory.push(conversationTurn);
    console.log('Saved conversation turn:', conversationTurn);

    // Send to renderer to save in IndexedDB
    sendToRenderer('save-conversation-turn', {
        sessionId: currentSessionId,
        turn: conversationTurn,
        fullHistory: conversationHistory,
    });
}

function saveScreenAnalysis(prompt, response, model) {
    if (!currentSessionId) {
        initializeNewSession();
    }

    const analysisEntry = {
        timestamp: Date.now(),
        prompt: prompt,
        response: response.trim(),
        model: model,
    };

    screenAnalysisHistory.push(analysisEntry);
    console.log('Saved screen analysis:', analysisEntry);

    // Send to renderer to save
    sendToRenderer('save-screen-analysis', {
        sessionId: currentSessionId,
        analysis: analysisEntry,
        fullHistory: screenAnalysisHistory,
        profile: currentProfile,
        customPrompt: currentCustomPrompt,
    });
}

function getCurrentSessionData() {
    return {
        sessionId: currentSessionId,
        history: conversationHistory,
    };
}

async function getEnabledTools() {
    const tools = [];

    // Check if Google Search is enabled (default: true)
    const googleSearchEnabled = await getStoredSetting('googleSearchEnabled', 'true');

    if (googleSearchEnabled === 'true') {
        tools.push({ googleSearch: {} });
    }

    return tools;
}

async function getStoredSetting(key, defaultValue) {
    try {
        const windows = BrowserWindow.getAllWindows();
        if (windows.length > 0) {
            // Wait a bit for the renderer to be ready
            await new Promise(resolve => setTimeout(resolve, 100));

            // Try to get setting from renderer process localStorage
            const value = await windows[0].webContents.executeJavaScript(`
                (function() {
                    try {
                        if (typeof localStorage === 'undefined') {
                            console.log('localStorage not available yet for ${key}');
                            return '${defaultValue}';
                        }
                        const stored = localStorage.getItem('${key}');
                        console.log('Retrieved setting ${key}:', stored);
                        return stored || '${defaultValue}';
                    } catch (e) {
                        console.error('Error accessing localStorage for ${key}:', e);
                        return '${defaultValue}';
                    }
                })()
            `);
            return value;
        }
    } catch (error) {
        console.error('Error getting stored setting for', key, ':', error.message);
    }
    console.log('Using default value for', key, ':', defaultValue);
    return defaultValue;
}

// helper to check if groq has been configured
function hasGroqKey() {
    const key = getGroqApiKey();
    return key && key.trim() != '';
}

// helper to check if Deepgram mode is active
function isDeepgramMode() {
    return deepgramWs !== null || deepgramApiKey !== '';
}

function trimConversationHistoryForGemma(history, maxChars = 42000) {
    if (!history || history.length === 0) return [];
    let totalChars = 0;
    const trimmed = [];

    for (let i = history.length - 1; i >= 0; i--) {
        const turn = history[i];
        const turnChars = (turn.content || '').length;

        if (totalChars + turnChars > maxChars) break;
        totalChars += turnChars;
        trimmed.unshift(turn);
    }
    return trimmed;
}

function stripThinkingTags(text) {
    return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

async function sendToGroq(transcription) {
    const groqApiKey = getGroqApiKey();
    if (!groqApiKey) {
        console.log("No Groq API key configured, skipping Groq response");
        return;
    }

    if (!transcription || transcription.trim() === "") {
        console.log("Empty transcription, skipping Groq");
        return;
    }

    const primaryModel = getModelForToday();
    if (!primaryModel) {
        console.log("All Groq daily limits exhausted");
        sendToRenderer("update-status", "Groq limits reached for today");
        return;
    }

    const candidateModels = [
        primaryModel,
        "qwen/qwen3.8-27b",
        "openai/gpt-oss-120b",
        "openai/gpt-oss-20b"
    ];
    const modelsToTry = [...new Set(candidateModels)];

    groqConversationHistory.push({
        role: "user",
        content: transcription.trim(),
    });

    if (groqConversationHistory.length > 20) {
        groqConversationHistory = groqConversationHistory.slice(-20);
    }

    // Set up speculative AbortController for barge-in cancellation
    currentGroqAbortController = new AbortController();
    const abortSignal = currentGroqAbortController.signal;
    isGroqGenerating = true;

    const tStart = Date.now();
    let ttft = null;

    try {
        let response = null;
        let modelToUse = primaryModel;

        for (const modelCandidate of modelsToTry) {
            if (abortSignal.aborted) {
                console.log("[Groq] Generation aborted by barge-in before request dispatch");
                return;
            }

            modelToUse = modelCandidate;
            console.log(`Sending to Groq (${modelToUse}):`, transcription.substring(0, 100) + "...");

            try {
                // Pass native keep-alive dispatcher agent for 0ms TLS connection overhead
                const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                    method: "POST",
                    
                    signal: abortSignal,
                    headers: {
                        Authorization: `Bearer ${groqApiKey}`,
                        "Content-Type": "application/json",
                        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
                    },
                    body: JSON.stringify({
                        model: modelToUse,
                        messages: [{ role: "system", content: getEffectiveSystemPrompt() }, ...groqConversationHistory],
                        stream: true,
                        temperature: 0.1,
                        max_tokens: 1500,
                    }),
                });

                if (!res.ok) {
                    const errBody = await res.text();
                    console.warn(`Groq model ${modelToUse} returned ${res.status} (${errBody.substring(0, 120)}), falling back to next candidate...`);
                    continue;
                }

                response = res;
                break;
            } catch (fetchErr) {
                if (abortSignal.aborted) {
                    console.log("[Groq] Fetch aborted by barge-in");
                    return;
                }
                console.error("Groq fetch error:", fetchErr);
            }
        }

        if (!response || !response.ok) {
            if (abortSignal.aborted) return;
            console.warn("All Groq models failed. Falling back to Gemma...");
            sendToRenderer("update-status", "Falling back to Gemini...");
            sendToGemma(transcription);
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";
        let isFirst = true;

        // 16ms micro-batching buffer for 60Hz display refresh
        let lastBatchFlushTime = 0;

        while (true) {
            if (abortSignal.aborted) {
                console.log("[Groq] Stream read aborted by barge-in");
                try { reader.cancel(); } catch (e) {}
                return;
            }

            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n").filter(line => line.trim() !== "");

            for (const line of lines) {
                if (line.startsWith("data: ")) {
                    const data = line.slice(6);
                    if (data === "[DONE]") continue;

                    try {
                        const json = JSON.parse(data);
                        const token = json.choices?.[0]?.delta?.content || "";
                        if (token) {
                            if (ttft === null) {
                                ttft = Date.now() - tStart;
                            }
                            fullText += token;
                            const displayText = stripThinkingTags(fullText);
                            if (displayText) {
                                const now = Date.now();
                                // First token: 0ms immediate flush!
                                // Subsequent tokens: 16ms throttled flush (60Hz display sync)
                                if (isFirst || now - lastBatchFlushTime >= 16) {
                                    sendToRenderer(isFirst ? "new-response" : "update-response", displayText);
                                    isFirst = false;
                                    lastBatchFlushTime = now;
                                }
                            }
                        }
                    } catch (parseError) {}
                }
            }
        }

        const cleanedResponse = stripThinkingTags(fullText);
        // Final flush ensuring complete message is displayed
        if (cleanedResponse) {
            sendToRenderer(isFirst ? "new-response" : "update-response", cleanedResponse);
        }

        const totalE2E = Date.now() - tStart;
        console.log(`[Perf] Groq finished (${modelToUse}) | TTFT: ${ttft || totalE2E}ms | Total Gen Time: ${totalE2E}ms`);

        const modelKey = modelToUse.split("/").pop();
        const systemPromptChars = getEffectiveSystemPrompt().length;
        const historyChars = groqConversationHistory.reduce((sum, msg) => sum + (msg.content || "").length, 0);
        const inputChars = systemPromptChars + historyChars;
        const outputChars = cleanedResponse.length;

        incrementCharUsage("groq", modelKey, inputChars + outputChars);

        if (cleanedResponse) {
            groqConversationHistory.push({
                role: "assistant",
                content: cleanedResponse,
            });
            saveConversationTurn(transcription, cleanedResponse);
        }

        sendToRenderer("update-status", "Listening...");
    } catch (error) {
        if (abortSignal.aborted) {
            console.log("[Groq] Stream terminated via barge-in abort");
            return;
        }
        console.error("Error calling Groq API:", error);
        sendToRenderer("update-status", "Groq error: " + error.message);
    } finally {
        isGroqGenerating = false;
        if (currentGroqAbortController === abortSignal) {
            currentGroqAbortController = null;
        }
    }
}

function isQuotaOrRateLimitError(error) {
    if (!error) return false;
    const msg = String(error.message || '') + ' ' + String(error.status || '') + ' ' + String(error.code || '');
    return (
        error.status === 429 ||
        msg.includes('429') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('quota') ||
        msg.includes('Quota') ||
        msg.includes('RATE_LIMIT') ||
        msg.includes('rate limit') ||
        msg.includes('Rate limit') ||
        msg.includes('API_KEY_INVALID')
    );
}

async function sendToGemma(transcription) {
    const allKeys = getGeminiApiKeys();
    const lockedKeys = getLockedKeys();

    const availableKeyEntries = allKeys
        .map((k, idx) => ({ key: (k || '').trim(), index: idx }))
        .filter(entry => entry.key && (!lockedKeys[entry.key] || !lockedKeys[entry.key].locked));

    if (availableKeyEntries.length === 0) {
        const fallbackKey = getApiKey();
        if (fallbackKey && (!lockedKeys[fallbackKey] || !lockedKeys[fallbackKey].locked)) {
            availableKeyEntries.push({ key: fallbackKey, index: 0 });
        }
    }

    if (availableKeyEntries.length === 0) {
        console.log('No unlocked Gemini API key configured for Gemma');
        sendToRenderer('update-status', 'All Gemini keys are locked or empty');
        return;
    }

    if (!transcription || transcription.trim() === '') {
        console.log('Empty transcription, skipping Gemma');
        return;
    }

    console.log('Sending to Gemma (fallback):', transcription.substring(0, 100) + '...');

    groqConversationHistory.push({
        role: 'user',
        content: transcription.trim(),
    });

    const trimmedHistory = trimConversationHistoryForGemma(groqConversationHistory, 42000);
    const messages = trimmedHistory.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
    }));
    const systemPrompt = getEffectiveSystemPrompt();

    for (let i = 0; i < availableKeyEntries.length; i++) {
        const { key, index } = availableKeyEntries[i];
        try {
            const ai = new GoogleGenAI({ apiKey: key });

            const response = await ai.models.generateContentStream({
                model: 'gemini-3.5-flash-lite',
                contents: messages,
                config: {
                    systemInstruction: systemPrompt,
                },
            });

            let fullText = '';
            let isFirst = true;

            for await (const chunk of response) {
                const chunkText = chunk.text;
                if (chunkText) {
                    fullText += chunkText;
                    sendToRenderer(isFirst ? 'new-response' : 'update-response', fullText);
                    isFirst = false;
                }
            }

            const systemPromptChars = systemPrompt.length;
            const historyChars = trimmedHistory.reduce((sum, msg) => sum + (msg.content || '').length, 0);
            const inputChars = systemPromptChars + historyChars;
            const outputChars = fullText.length;

            incrementCharUsage('gemini', 'gemini-3.5-flash-lite', inputChars + outputChars);

            if (fullText.trim()) {
                groqConversationHistory.push({
                    role: 'assistant',
                    content: fullText.trim(),
                });

                if (groqConversationHistory.length > 40) {
                    groqConversationHistory = groqConversationHistory.slice(-40);
                }

                saveConversationTurn(transcription, fullText);
            }

            console.log(`Gemini response completed using Key #${index + 1}`);
            sendToRenderer('update-status', 'Listening...');
            return;
        } catch (error) {
            console.error(`Error calling Gemini API with Key #${index + 1}:`, error.message);
            if (isQuotaOrRateLimitError(error)) {
                console.warn(`[Multi-Key Rotator] Locking Key #${index + 1} due to rate-limit/quota error.`);
                lockKey(key, `Quota/Rate limit hit: ${error.message || '429'}`);
                sendToRenderer('key-locked', { index, key: key.substring(0, 8) + '...', reason: error.message });
                if (i < availableKeyEntries.length - 1) {
                    const nextEntry = availableKeyEntries[i + 1];
                    sendToRenderer('update-status', `Key #${index + 1} rate-limited. Switched to Key #${nextEntry.index + 1}...`);
                    continue;
                }
            } else if (i < availableKeyEntries.length - 1) {
                continue;
            }
            sendToRenderer('update-status', 'Gemini error: ' + error.message);
        }
    }
}

async function initializeGeminiSession(apiKey, customPrompt = '', profile = 'interview', language = 'en-US', isReconnect = false) {
    if (isInitializingSession) {
        console.log('Session initialization already in progress');
        return false;
    }

    isInitializingSession = true;
    if (!isReconnect) {
        sendToRenderer('session-initializing', true);
    }

    // Store params for reconnection
    if (!isReconnect) {
        sessionParams = { apiKey, customPrompt, profile, language };
        reconnectAttempts = 0;
    }

    const client = new GoogleGenAI({
        vertexai: false,
        apiKey: apiKey,
        httpOptions: { apiVersion: 'v1alpha' },
    });

    // Get enabled tools first to determine Google Search status
    const enabledTools = await getEnabledTools();
    const googleSearchEnabled = enabledTools.some(tool => tool.googleSearch);

    // Initialize new conversation session only on first connect
    if (!isReconnect) {
        initializeNewSession(profile, customPrompt);
    }

    const systemPrompt = getEffectiveSystemPrompt();

    try {
        const session = await client.live.connect({
            model: 'gemini-3.1-flash-live-preview',
            callbacks: {
                onopen: function () {
                    sendToRenderer('update-status', 'Live session connected');
                },
                onmessage: function (message) {
                    console.log('----------------', message);

                    // Handle input transcription (what was spoken in the meeting)
                    if (message.serverContent?.inputTranscription?.results) {
                        const partial = formatSpeakerResults(message.serverContent.inputTranscription.results);
                        if (partial.trim()) {
                            currentTranscription += partial;
                            sendToRenderer('update-status', 'Transcribing...');
                        }
                    } else if (message.serverContent?.inputTranscription?.text) {
                        const text = message.serverContent.inputTranscription.text;
                        if (text.trim() !== '') {
                            currentTranscription += text;
                            sendToRenderer('update-status', 'Transcribing...');
                        }
                    }

                    // Handle direct TEXT responses from Gemini (fast path with TEXT modality)
                    if (message.serverContent?.modelTurn?.parts) {
                        for (const part of message.serverContent.modelTurn.parts) {
                            if (part.text && part.text.trim()) {
                                messageBuffer += part.text;
                                sendToRenderer(messageBuffer === part.text ? 'new-response' : 'update-response', messageBuffer);
                            }
                        }
                    }

                    if (message.serverContent?.generationComplete) {
                        // Flush any buffered Gemini TEXT response
                        if (messageBuffer.trim()) {
                            saveConversationTurn(currentTranscription, messageBuffer);
                            messageBuffer = '';
                        } else if (currentTranscription.trim() !== '' && !isManualMode) {
                            // Gemini gave no direct answer — use Groq/Gemma for speed
                            if (hasGroqKey()) {
                                sendToGroq(currentTranscription);
                            } else {
                                sendToGemma(currentTranscription);
                            }
                        }
                        if (!isManualMode) {
                            currentTranscription = '';
                        }
                    }

                    if (message.serverContent?.turnComplete) {
                        // Fallback: if transcription accumulated but generationComplete never fired
                        if (currentTranscription.trim() !== '' && messageBuffer.trim() === '' && !isManualMode) {
                            if (hasGroqKey()) {
                                sendToGroq(currentTranscription);
                            } else {
                                sendToGemma(currentTranscription);
                            }
                            currentTranscription = '';
                        }
                        messageBuffer = '';
                        if (!isManualMode) {
                            sendToRenderer('update-status', 'Listening...');
                        }
                    }
                },
                onerror: function (e) {
                    console.log('Session error:', e.message);
                    sendToRenderer('update-status', 'Error: ' + e.message);
                },
                onclose: function (e) {
                    console.log('Session closed:', e.reason);

                    // Don't reconnect if user intentionally closed
                    if (isUserClosing) {
                        isUserClosing = false;
                        sendToRenderer('update-status', 'Session closed');
                        return;
                    }

                    // Attempt reconnection
                    if (sessionParams && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                        attemptReconnect();
                    } else {
                        sendToRenderer('update-status', 'Session closed');
                    }
                },
            },
            config: {
                // TEXT modality: we display answers on screen, no audio playback needed
                responseModalities: [Modality.TEXT],
                tools: enabledTools,
                // Transcribe incoming meeting audio; allow single speaker (interviewer only)
                inputAudioTranscription: {
                    enableSpeakerDiarization: true,
                    minSpeakerCount: 1,
                    maxSpeakerCount: 4,
                },
                contextWindowCompression: { slidingWindow: {} },
                speechConfig: { languageCode: language },
                systemInstruction: {
                    parts: [{ text: systemPrompt }],
                },
            },
        });

        isInitializingSession = false;
        if (!isReconnect) {
            sendToRenderer('session-initializing', false);
        }
        return session;
    } catch (error) {
        console.error('Failed to initialize Gemini session:', error);
        isInitializingSession = false;
        if (!isReconnect) {
            sendToRenderer('session-initializing', false);
        }
        return null;
    }
}

async function attemptReconnect() {
    reconnectAttempts++;
    console.log(`Reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);

    // Clear stale buffers
    messageBuffer = '';
    currentTranscription = '';
    // Don't reset groqConversationHistory to preserve context across reconnects

    sendToRenderer('update-status', `Reconnecting... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

    // Wait before attempting
    await new Promise(resolve => setTimeout(resolve, RECONNECT_DELAY));

    try {
        const session = await initializeGeminiSession(
            sessionParams.apiKey,
            sessionParams.customPrompt,
            sessionParams.profile,
            sessionParams.language,
            true // isReconnect
        );

        if (session && global.geminiSessionRef) {
            global.geminiSessionRef.current = session;

            // Restore context from conversation history via text message
            const contextMessage = buildContextMessage();
            if (contextMessage) {
                try {
                    console.log('Restoring conversation context...');
                    await session.sendRealtimeInput({ text: contextMessage });
                } catch (contextError) {
                    console.error('Failed to restore context:', contextError);
                    // Continue without context - better than failing
                }
            }

            // Don't reset reconnectAttempts here - let it reset on next fresh session
            sendToRenderer('update-status', 'Reconnected! Listening...');
            console.log('Session reconnected successfully');
            return true;
        }
    } catch (error) {
        console.error(`Reconnection attempt ${reconnectAttempts} failed:`, error);
    }

    // If we still have attempts left, try again
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        return attemptReconnect();
    }

    // Max attempts reached - notify frontend
    console.log('Max reconnection attempts reached');
    sendToRenderer('reconnect-failed', {
        message: 'Tried 3 times to reconnect. Must be upstream/network issues. Try restarting or download updated app from site.',
    });
    sessionParams = null;
    return false;
}

function triggerDeepgramGroqAnswer() {
    const textToSend = currentTranscription.trim();
    if (!textToSend) return;

    // Speculative execution guard: abort any active in-flight request
    if (currentGroqAbortController) {
        try {
            currentGroqAbortController.abort();
        } catch (e) {}
        currentGroqAbortController = null;
    }

    currentTranscription = "";
    console.log("[Deepgram] Triggering speculative answer for:", textToSend);
    sendToRenderer("update-status", "Thinking...");

    if (hasGroqKey()) {
        sendToGroq(textToSend);
    } else {
        sendToGemma(textToSend);
    }
}

async function connectDeepgramWebSocket(language = "en-US") {
    return new Promise(resolve => {
        try {
            console.log("Connecting to Deepgram WebSocket...");
            sendToRenderer("update-status", "Connecting to Deepgram...");

            const prefs = getPreferences();
            const isBlackHoleMode = prefs.audioMode === 'stealth_loopback';
            // Use 400ms endpointing for BlackHole/stealth loopback so natural speech pauses aren't cut short
            const endpointing = isBlackHoleMode ? 400 : 300;
            const model = "nova-3";
            const langCode = language || "en-US";
            const url = `wss://api.deepgram.com/v1/listen?encoding=linear16&sample_rate=24000&channels=1&model=${model}&language=${langCode}&interim_results=true&endpointing=${endpointing}&utterance_end_ms=1000&vad_events=true&smart_format=true`;

            deepgramWs = new WebSocket(url, {
                headers: {
                    Authorization: `Token ${deepgramApiKey}`,
                },
            });

            deepgramWs.on("open", () => {
                console.log("Deepgram WebSocket connected!");
                sendToRenderer("update-status", "Deepgram connected. Listening...");
                // Keepalive every 5s so Deepgram never drops on silence/pause
                deepgramKeepAliveInterval = setInterval(() => {
                    if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
                        try {
                            deepgramWs.send(JSON.stringify({ type: "KeepAlive" }));
                        } catch (e) {}
                    }
                }, 5000);
                resolve(true);
            });

            deepgramWs.on("message", data => {
                try {
                    const response = JSON.parse(data.toString());

                    // JIT Socket Pre-Warming on speech detected
                    if (response.type === "SpeechStarted") {
                        prewarmGroqSocket();
                        // Barge-in: if user resumed speaking while Groq was streaming, abort and rollback UI!
                        if (isGroqGenerating && currentGroqAbortController) {
                            console.log("[Barge-In] User resumed speaking, aborting in-flight generation & rolling back UI...");
                            currentGroqAbortController.abort();
                            currentGroqAbortController = null;
                            isGroqGenerating = false;
                            sendToRenderer("rollback-speculative-response");
                        }
                    }

                    if (response.type === "UtteranceEnd") {
                        if (currentTranscription.trim() !== "" && !isManualMode && !isGroqGenerating) {
                            if (deepgramTranscriptionTimeout) clearTimeout(deepgramTranscriptionTimeout);
                            triggerDeepgramGroqAnswer();
                        }
                    }

                    if (response.channel && response.channel.alternatives && response.channel.alternatives[0]) {
                        const transcript = response.channel.alternatives[0].transcript;
                        const isFinal = response.is_final;
                        const speechFinal = response.speech_final;

                        if (transcript.trim() !== "") {
                            prewarmGroqSocket();

                            // Barge-in check: if user speaks new words while generating
                            if (isGroqGenerating && currentGroqAbortController) {
                                console.log("[Barge-In] New transcript while generating, cancelling previous & rolling back UI...");
                                currentGroqAbortController.abort();
                                currentGroqAbortController = null;
                                isGroqGenerating = false;
                                sendToRenderer("rollback-speculative-response");
                            }

                            sendToRenderer("update-status", "Transcribing: " + transcript);

                            if (isFinal) {
                                currentTranscription += " " + transcript;

                                if (isManualMode) {
                                    sendToRenderer("update-status", "Recording question...");
                                } else if (speechFinal) {
                                    if (deepgramTranscriptionTimeout) clearTimeout(deepgramTranscriptionTimeout);
                                    // Zero artificial delay on speech_final!
                                    triggerDeepgramGroqAnswer();
                                } else {
                                    if (deepgramTranscriptionTimeout) clearTimeout(deepgramTranscriptionTimeout);
                                    // Tighter 150ms debounce for interim silence
                                    deepgramTranscriptionTimeout = setTimeout(() => {
                                        triggerDeepgramGroqAnswer();
                                    }, 150);
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.error("Error parsing Deepgram message:", e);
                }
            });

            deepgramWs.on('error', err => {
                console.error('Deepgram WebSocket error:', err);
                sendToRenderer('update-status', 'Deepgram error: ' + err.message);
                if (deepgramKeepAliveInterval) {
                    clearInterval(deepgramKeepAliveInterval);
                    deepgramKeepAliveInterval = null;
                }
                resolve(false);
            });

            deepgramWs.on('close', (code, reason) => {
                console.log(`Deepgram WebSocket closed. Code: ${code}, Reason: ${reason}`);
                deepgramWs = null;
                if (deepgramKeepAliveInterval) {
                    clearInterval(deepgramKeepAliveInterval);
                    deepgramKeepAliveInterval = null;
                }
                if (!isUserClosing) {
                    sendToRenderer('update-status', 'Deepgram disconnected. Reconnecting...');
                    setTimeout(() => {
                        if (deepgramApiKey) connectDeepgramWebSocket(language);
                    }, 2000);
                }
            });
        } catch (error) {
            console.error('Failed to connect to Deepgram:', error);
            sendToRenderer('update-status', 'Deepgram connection failed');
            resolve(false);
        }
    });
}

async function initializeDeepgramSession(apiKey, customPrompt = '', profile = 'interview', language = 'en-US') {
    deepgramApiKey = apiKey;
    isUserClosing = false;

    initializeNewSession(profile, customPrompt);
    return connectDeepgramWebSocket(language);
}

const { helperManager } = require('./macOSHelperManager');

function killExistingSystemAudioDump() {
    return new Promise(resolve => {
        const killProc = spawn('pkill', ['-f', 'SystemAudioDump'], {
            stdio: 'ignore',
        });
        killProc.on('close', () => {
            resolve();
        });
        killProc.on('error', () => {
            resolve();
        });
    });
}

async function startMacOSAudioCapture(geminiSessionRef) {
    if (process.platform !== 'darwin') return false;

    hasShownPermissionDialog = false;

    // Ensure any stale instances of SystemAudioDump are cleaned up
    await killExistingSystemAudioDump();

    // Notify helper manager for status tracking
    try {
        await helperManager.initialize();
        await helperManager.startAudioCapture();
    } catch (err) {
        console.warn('Native helper IPC audio capture request error:', err);
    }

    console.log('Starting macOS audio capture with SystemAudioDump...');
    let systemAudioPath;
    const { app } = require('electron');
    const path = require('path');
    if (app.isPackaged) {
        systemAudioPath = path.join(process.resourcesPath, 'SystemAudioDump');
    } else {
        systemAudioPath = path.join(__dirname, '../assets', 'SystemAudioDump');
    }

    if (!fs.existsSync(systemAudioPath)) {
        console.error('SystemAudioDump binary not found at:', systemAudioPath);
        return false;
    }

    const spawnOptions = { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env } };
    systemAudioProc = spawn(systemAudioPath, [], spawnOptions);
    if (systemAudioProc && systemAudioProc.pid) {
        console.log('Audio capture started with PID:', systemAudioProc.pid);
        setupAudioProcListeners(systemAudioProc, geminiSessionRef);
        return true;
    }

    return false;
}

function setupAudioProcListeners(proc, geminiSessionRef) {
    // 40ms framing: 960 samples @ 24kHz (optimal for neural ASR without buffer bloat)
    const CHUNK_DURATION = 0.04;
    const SAMPLE_RATE = 24000;
    const BYTES_PER_SAMPLE = 2;
    const CHANNELS = 2;
    const CHUNK_SIZE = Math.round(SAMPLE_RATE * BYTES_PER_SAMPLE * CHANNELS * CHUNK_DURATION);

    let audioBuffer = Buffer.alloc(0);

    proc.stdout.on('data', data => {
        if (isManualMode && !isManualRecording) return;
        audioBuffer = Buffer.concat([audioBuffer, data]);

        while (audioBuffer.length >= CHUNK_SIZE) {
            const chunk = audioBuffer.slice(0, CHUNK_SIZE);
            audioBuffer = audioBuffer.slice(CHUNK_SIZE);
            const monoChunk = CHANNELS === 2 ? convertStereoToMono(chunk) : chunk;

            if (currentProviderMode === 'cloud') {
                sendCloudAudio(monoChunk);
            } else if (currentProviderMode === 'local') {
                getLocalAi().processLocalAudio(monoChunk);
            } else if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
                // Prevent buffer bloat during network latency spikes
                if (deepgramWs.bufferedAmount < 65536) {
                    deepgramWs.send(monoChunk);
                }
            } else {
                const base64Data = monoChunk.toString('base64');
                sendAudioToGemini(base64Data, geminiSessionRef);
            }
        }
    });

    proc.stderr.on('data', data => {
        const errorMsg = data.toString();
        console.error('Audio capture stderr:', errorMsg);
        if (!hasShownPermissionDialog && (errorMsg.includes('SCStreamErrorDomain') || errorMsg.includes('-3821'))) {
            hasShownPermissionDialog = true;
            console.warn('SystemAudioDump permission warning: Screen Recording permission is required for direct system audio capture.');
        }
    });

    proc.on('close', code => {
        console.log('Audio capture process exited with code:', code);
        systemAudioProc = null;
    });
}

// Zero-copy byte-aligned stereo-to-mono downmix
function convertStereoToMono(stereoBuffer) {
    const alignedBuf = (stereoBuffer.byteOffset % 2 === 0)
        ? stereoBuffer
        : Buffer.from(stereoBuffer);

    const samples = new Int16Array(alignedBuf.buffer, alignedBuf.byteOffset, alignedBuf.byteLength / 2);
    const monoLength = samples.length >>> 1;
    const monoSamples = new Int16Array(monoLength);

    for (let i = 0, j = 0; i < monoLength; i++, j += 2) {
        // Bitwise right shift gives clean average without 16-bit integer overflow clipping
        monoSamples[i] = (samples[j] + samples[j + 1]) >> 1;
    }

    return Buffer.from(monoSamples.buffer, monoSamples.byteOffset, monoSamples.byteLength);
}

function stopMacOSAudioCapture() {
    helperManager.stopAudioCapture();
    if (systemAudioProc) {
        console.log('Stopping fallback audio process...');
        systemAudioProc.kill('SIGTERM');
        systemAudioProc = null;
    }
}

async function sendAudioToGemini(base64Data, geminiSessionRef) {
    if (!geminiSessionRef.current) return;

    try {
        process.stdout.write('.');
        await geminiSessionRef.current.sendRealtimeInput({
            audio: {
                data: base64Data,
                mimeType: 'audio/pcm;rate=24000',
            },
        });
    } catch (error) {
        console.error('Error sending audio to Gemini:', error);
    }
}

async function sendImageToGroq(base64Data, prompt) {
    const groqApiKey = getGroqApiKey();
    if (!groqApiKey) return { success: false, error: 'No Groq API key configured' };

    const textPrompt = prompt || 'Describe what you see in this screenshot and answer any question shown.';
    console.log('Sending image to Groq vision (llama-4-scout)...');

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${groqApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'meta-llama/llama-4-scout-17b-16e-instruct',
                messages: [
                    { role: 'system', content: getEffectiveSystemPrompt() },
                    {
                        role: 'user',
                        content: [
                            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Data}` } },
                            { type: 'text', text: textPrompt },
                        ],
                    },
                ],
                stream: true,
                temperature: 0.2,
                max_tokens: 1024,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            return { success: false, error: `Groq vision error: ${response.status} ${errorText}` };
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let isFirst = true;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            for (const line of decoder.decode(value, { stream: true }).split('\n')) {
                if (!line.startsWith('data: ')) continue;
                const data = line.slice(6);
                if (data === '[DONE]') continue;
                try {
                    const token = JSON.parse(data).choices?.[0]?.delta?.content || '';
                    if (token) {
                        fullText += token;
                        sendToRenderer(isFirst ? 'new-response' : 'update-response', fullText);
                        isFirst = false;
                    }
                } catch {}
            }
        }

        console.log('Groq vision response completed');
        saveScreenAnalysis(textPrompt, fullText, 'llama-4-scout-17b-16e-instruct');
        return { success: true, text: fullText, model: 'llama-4-scout' };
    } catch (error) {
        console.error('Error sending image to Groq:', error);
        return { success: false, error: error.message };
    }
}

async function fetchOpenRouterFreeModels() {
    try {
        const res = await fetch('https://openrouter.ai/api/v1/models');
        if (res.ok) {
            const data = await res.json();
            if (data && Array.isArray(data.data)) {
                const freeModels = data.data
                    .filter(m => m.id && (m.id.endsWith(':free') || (m.pricing && parseFloat(m.pricing.prompt) === 0)))
                    .map(m => m.id);
                if (freeModels.length > 0) return freeModels;
            }
        }
    } catch (e) {
        console.warn('Could not fetch OpenRouter models API:', e.message);
    }
    return [
        'meta-llama/llama-3.3-70b-instruct:free',
        'google/gemini-2.0-flash-exp:free',
        'deepseek/deepseek-r1:free',
        'qwen/qwen-2.5-coder-32b-instruct:free',
        'meta-llama/llama-3.1-8b-instruct:free',
    ];
}

async function sendToOpenRouterHttp(prompt, base64Data = null) {
    const openrouterKey = getOpenrouterApiKey();
    const prefs = getPreferences();
    const configuredModel = prefs.openrouterModel || 'meta-llama/llama-3.3-70b-instruct';
    const textPrompt = prompt || 'Analyze this content and provide a direct answer.';

    // Model rotation list: configured model -> free models -> standard models
    const fallbackFreeModels = [
        configuredModel,
        'meta-llama/llama-3.3-70b-instruct:free',
        'google/gemini-2.0-flash-exp:free',
        'deepseek/deepseek-r1:free',
        'qwen/qwen-2.5-coder-32b-instruct:free',
        'meta-llama/llama-3.1-8b-instruct:free',
        'meta-llama/llama-3.3-70b-instruct',
    ];

    // Deduplicate candidate models
    const candidateModels = Array.from(new Set(fallbackFreeModels));

    for (let i = 0; i < candidateModels.length; i++) {
        const modelToUse = candidateModels[i];
        console.log(`[OpenRouter Auto-Fallback] Attempt ${i + 1}/${candidateModels.length}: ${modelToUse}...`);
        sendToRenderer('update-status', `OpenRouter (${modelToUse.split('/')[1] || modelToUse})...`);

        try {
            const messages = [{ role: 'system', content: getEffectiveSystemPrompt() }];

            if (base64Data) {
                messages.push({
                    role: 'user',
                    content: [
                        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Data}` } },
                        { type: 'text', text: textPrompt },
                    ],
                });
            } else {
                messages.push({ role: 'user', content: textPrompt });
            }

            const headers = {
                'HTTP-Referer': 'https://github.com/sohzm/cheating-daddy',
                'X-Title': 'Norton Assistant',
                'Content-Type': 'application/json',
            };
            if (openrouterKey) {
                headers['Authorization'] = `Bearer ${openrouterKey}`;
            }

            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    model: modelToUse,
                    messages: messages,
                    stream: true,
                    temperature: 0.2,
                    max_tokens: 1500,
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.warn(`OpenRouter model ${modelToUse} failed (${response.status}):`, errorText);
                if (i < candidateModels.length - 1) {
                    sendToRenderer('update-status', `OpenRouter model ${modelToUse.split('/')[1] || modelToUse} rate-limited. Trying free model...`);
                    continue;
                }
                return { success: false, error: `OpenRouter error (${response.status}): ${errorText}` };
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullText = '';
            let isFirst = true;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                for (const line of decoder.decode(value, { stream: true }).split('\n')) {
                    if (!line.startsWith('data: ')) continue;
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;
                    try {
                        const token = JSON.parse(data).choices?.[0]?.delta?.content || '';
                        if (token) {
                            fullText += token;
                            sendToRenderer(isFirst ? 'new-response' : 'update-response', fullText);
                            isFirst = false;
                        }
                    } catch {}
                }
            }

            if (fullText.trim().length > 0) {
                console.log(`OpenRouter response completed via ${modelToUse}`);
                saveScreenAnalysis(textPrompt, fullText, modelToUse);
                return { success: true, text: fullText, model: modelToUse };
            }
        } catch (error) {
            console.error(`Error with OpenRouter model ${modelToUse}:`, error.message);
            if (i < candidateModels.length - 1) continue;
        }
    }

    return { success: false, error: 'All OpenRouter models (including free models) failed or rate limited' };
}

async function sendImageToGeminiHttp(base64Data, prompt) {
    const allKeys = getGeminiApiKeys();
    const lockedKeys = getLockedKeys();

    const availableKeyEntries = allKeys
        .map((k, idx) => ({ key: (k || '').trim(), index: idx }))
        .filter(entry => entry.key && (!lockedKeys[entry.key] || !lockedKeys[entry.key].locked));

    if (availableKeyEntries.length === 0) {
        const fallbackKey = getApiKey();
        if (fallbackKey && (!lockedKeys[fallbackKey] || !lockedKeys[fallbackKey].locked)) {
            availableKeyEntries.push({ key: fallbackKey, index: 0 });
        }
    }

    if (availableKeyEntries.length === 0) {
        console.log('No unlocked Gemini API key available, trying OpenRouter fallback...');
        const openrouterKey = getOpenrouterApiKey();
        if (openrouterKey) {
            return sendToOpenRouterHttp(prompt, base64Data);
        }
        console.log('No OpenRouter key configured, falling back to Groq');
        return sendImageToGroq(base64Data, prompt);
    }

    const model = getAvailableModel();

    for (let i = 0; i < availableKeyEntries.length; i++) {
        const { key, index } = availableKeyEntries[i];
        try {
            console.log(`Sending image to ${model} using Key #${index + 1} (streaming)...`);
            const ai = new GoogleGenAI({ apiKey: key });

            const contents = base64Data ? [{ inlineData: { mimeType: 'image/jpeg', data: base64Data } }, { text: prompt }] : [{ text: prompt }];

            const response = await ai.models.generateContentStream({
                model: model,
                contents: contents,
                config: {
                    systemInstruction: getEffectiveSystemPrompt(),
                    temperature: 0.2,
                },
            });

            incrementLimitCount(model);

            let fullText = '';
            let isFirst = true;
            for await (const chunk of response) {
                const chunkText = chunk.text;
                if (chunkText) {
                    fullText += chunkText;
                    sendToRenderer(isFirst ? 'new-response' : 'update-response', fullText);
                    isFirst = false;
                }
            }

            console.log(`Image response completed from ${model} using Key #${index + 1}`);
            saveScreenAnalysis(prompt, fullText, model);
            return { success: true, text: fullText, model: model, keyIndex: index };
        } catch (error) {
            console.error(`Error sending image with Gemini Key #${index + 1}:`, error.message);
            if (isQuotaOrRateLimitError(error)) {
                console.warn(`[Multi-Key Rotator] Locking Key #${index + 1} due to quota/rate limit error.`);
                lockKey(key, `Quota/Rate limit hit: ${error.message || '429'}`);
                sendToRenderer('key-locked', { index, key: key.substring(0, 8) + '...', reason: error.message });
                if (i < availableKeyEntries.length - 1) {
                    const nextEntry = availableKeyEntries[i + 1];
                    sendToRenderer('update-status', `Key #${index + 1} rate-limited. Auto-switching to Key #${nextEntry.index + 1}...`);
                    continue; // Try next key
                }
            } else if (i < availableKeyEntries.length - 1) {
                continue;
            }
        }
    }

    // Fallback order: OpenRouter -> Groq
    const openrouterKey = getOpenrouterApiKey();
    if (openrouterKey) {
        console.log('All Gemini keys failed or locked. Falling back to OpenRouter...');
        sendToRenderer('update-status', 'Gemini keys limit hit. Switching to OpenRouter...');
        const orResult = await sendToOpenRouterHttp(prompt, base64Data);
        if (orResult.success) return orResult;
    }

    console.log('Falling back to Groq vision...');
    sendToRenderer('update-status', 'Switching to Groq vision...');
    return sendImageToGroq(base64Data, prompt);
}

function setupGeminiIpcHandlers(geminiSessionRef) {
    // Store the geminiSessionRef globally for reconnection access
    global.geminiSessionRef = geminiSessionRef;

    ipcMain.handle('set-audio-capture-mode', async (event, mode) => {
        isManualMode = mode === 'manual';
        console.log('Audio capture mode updated to:', mode, 'isManualMode:', isManualMode);
        isManualRecording = false;
        return { success: true };
    });

    ipcMain.handle('toggle-manual-recording', async (event, recordingState) => {
        isManualRecording = recordingState;
        console.log('Manual recording state updated to:', isManualRecording);

        if (!isManualRecording) {
            // Wait 600ms for final audio chunks to finish transcribing
            setTimeout(() => {
                const textToSend = currentTranscription.trim();
                currentTranscription = '';
                if (textToSend) {
                    console.log('[Manual mode] Triggering answer for:', textToSend);
                    sendToRenderer('update-status', 'Thinking...');
                    if (hasGroqKey()) {
                        sendToGroq(textToSend);
                    } else {
                        sendToGemma(textToSend);
                    }
                } else {
                    console.log('[Manual mode] No transcription to send');
                    sendToRenderer('update-status', 'Listening...');
                }
            }, 250);
        } else {
            currentTranscription = '';
            sendToRenderer('update-status', 'Recording question...');
        }
        return { success: true };
    });

    ipcMain.handle('initialize-cloud', async (event, token, profile, userContext) => {
        try {
            currentProviderMode = 'cloud';
            initializeNewSession(profile, userContext);
            setOnTurnComplete((transcription, response) => {
                saveConversationTurn(transcription, response);
            });
            sendToRenderer('session-initializing', true);
            await connectCloud(token, profile, userContext);
            sendToRenderer('session-initializing', false);
            return true;
        } catch (err) {
            console.error('[Cloud] Init error:', err);
            currentProviderMode = 'byok';
            sendToRenderer('session-initializing', false);
            return false;
        }
    });

    ipcMain.handle('initialize-gemini', async (event, apiKey, customPrompt, profile = 'interview', language = 'en-US') => {
        currentProviderMode = 'byok';

        // If Deepgram key is available, use Deepgram for transcription instead of Gemini Live!
        const deepgramKey = getDeepgramApiKey();
        if (deepgramKey && deepgramKey.trim() !== '') {
            console.log('Deepgram API Key found! Connecting to Deepgram WebSocket...');
            const success = await initializeDeepgramSession(deepgramKey, customPrompt, profile, language);
            return success;
        }

        const session = await initializeGeminiSession(apiKey, customPrompt, profile, language);
        if (session) {
            geminiSessionRef.current = session;
            return true;
        }
        return false;
    });

    ipcMain.handle('initialize-local', async (event, ollamaHost, ollamaModel, whisperModel, profile, customPrompt) => {
        currentProviderMode = 'local';
        const success = await getLocalAi().initializeLocalSession(ollamaHost, ollamaModel, whisperModel, profile, customPrompt);
        if (!success) {
            currentProviderMode = 'byok';
        }
        return success;
    });

    // Zero-overhead raw binary audio streaming with backpressure protection
    ipcMain.on('send-audio-raw', (event, rawBuffer) => {
        if (isManualMode && !isManualRecording) {
            return;
        }
        const pcmBuffer = Buffer.isBuffer(rawBuffer)
            ? rawBuffer
            : Buffer.from(rawBuffer.buffer || rawBuffer, rawBuffer.byteOffset || 0, rawBuffer.byteLength || rawBuffer.length);

        if (currentProviderMode === 'cloud') {
            try {
                sendCloudAudio(pcmBuffer);
            } catch (error) {
                console.error('Error sending cloud audio:', error);
            }
            return;
        }
        if (currentProviderMode === 'local') {
            try {
                getLocalAi().processLocalAudio(pcmBuffer);
            } catch (error) {
                console.error('Error sending local audio:', error);
            }
            return;
        }
        // Deepgram mode with WebSocket backpressure monitoring
        if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
            try {
                if (deepgramWs.bufferedAmount > 512000) {
                    console.warn(`[Deepgram] Backpressure: ${deepgramWs.bufferedAmount} bytes buffered. Dropping chunk.`);
                    return;
                }
                deepgramWs.send(pcmBuffer);
            } catch (error) {
                console.error('Error sending audio to Deepgram:', error);
            }
            return;
        }
        if (!geminiSessionRef.current) return;
        try {
            const base64Data = pcmBuffer.toString('base64');
            geminiSessionRef.current.sendRealtimeInput({
                audio: { data: base64Data, mimeType: 'audio/pcm;rate=24000' },
            }).catch(e => console.error('Error sending audio to Gemini:', e));
        } catch (error) {
            console.error('Error sending system audio:', error);
        }
    });

    ipcMain.on('send-mic-audio-raw', (event, rawBuffer) => {
        if (isManualMode && !isManualRecording) {
            return;
        }
        const pcmBuffer = Buffer.isBuffer(rawBuffer)
            ? rawBuffer
            : Buffer.from(rawBuffer.buffer || rawBuffer, rawBuffer.byteOffset || 0, rawBuffer.byteLength || rawBuffer.length);

        if (currentProviderMode === 'cloud') {
            try {
                sendCloudAudio(pcmBuffer);
            } catch (error) {
                console.error('Error sending cloud mic audio:', error);
            }
            return;
        }
        if (currentProviderMode === 'local') {
            try {
                getLocalAi().processLocalAudio(pcmBuffer);
            } catch (error) {
                console.error('Error sending local mic audio:', error);
            }
            return;
        }
        if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
            try {
                if (deepgramWs.bufferedAmount > 512000) {
                    console.warn(`[Deepgram] Backpressure: ${deepgramWs.bufferedAmount} bytes buffered on mic. Dropping chunk.`);
                    return;
                }
                deepgramWs.send(pcmBuffer);
            } catch (error) {
                console.error('Error sending mic audio to Deepgram:', error);
            }
            return;
        }
        if (!geminiSessionRef.current) return;
        try {
            const base64Data = pcmBuffer.toString('base64');
            geminiSessionRef.current.sendRealtimeInput({
                audio: { data: base64Data, mimeType: 'audio/pcm;rate=24000' },
            }).catch(e => console.error('Error sending mic audio to Gemini:', e));
        } catch (error) {
            console.error('Error sending mic audio:', error);
        }
    });

    ipcMain.handle('send-audio-content', async (event, { data, mimeType }) => {
        if (isManualMode && !isManualRecording) {
            return { success: true };
        }
        if (currentProviderMode === 'cloud') {
            try {
                const pcmBuffer = Buffer.from(data, 'base64');
                sendCloudAudio(pcmBuffer);
                return { success: true };
            } catch (error) {
                console.error('Error sending cloud audio:', error);
                return { success: false, error: error.message };
            }
        }
        if (currentProviderMode === 'local') {
            try {
                const pcmBuffer = Buffer.from(data, 'base64');
                getLocalAi().processLocalAudio(pcmBuffer);
                return { success: true };
            } catch (error) {
                console.error('Error sending local audio:', error);
                return { success: false, error: error.message };
            }
        }
        // Deepgram mode: route browser audio (if any comes via IPC) to the Deepgram WebSocket directly
        if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
            try {
                const pcmBuffer = Buffer.from(data, 'base64');
                deepgramWs.send(pcmBuffer);
                return { success: true };
            } catch (error) {
                console.error('Error sending audio to Deepgram:', error);
                return { success: false, error: error.message };
            }
        }
        if (!geminiSessionRef.current) return { success: false, error: 'No active session' };
        try {
            process.stdout.write('.');
            await geminiSessionRef.current.sendRealtimeInput({
                audio: { data: data, mimeType: mimeType },
            });
            return { success: true };
        } catch (error) {
            console.error('Error sending system audio:', error);
            return { success: false, error: error.message };
        }
    });

    // Handle microphone audio on a separate channel
    ipcMain.handle('send-mic-audio-content', async (event, { data, mimeType }) => {
        if (isManualMode && !isManualRecording) {
            return { success: true };
        }
        if (currentProviderMode === 'cloud') {
            try {
                const pcmBuffer = Buffer.from(data, 'base64');
                sendCloudAudio(pcmBuffer);
                return { success: true };
            } catch (error) {
                console.error('Error sending cloud mic audio:', error);
                return { success: false, error: error.message };
            }
        }
        if (currentProviderMode === 'local') {
            try {
                const pcmBuffer = Buffer.from(data, 'base64');
                getLocalAi().processLocalAudio(pcmBuffer);
                return { success: true };
            } catch (error) {
                console.error('Error sending local mic audio:', error);
                return { success: false, error: error.message };
            }
        }
        // Deepgram mode: mic audio also goes to Deepgram WebSocket
        if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
            try {
                const pcmBuffer = Buffer.from(data, 'base64');
                deepgramWs.send(pcmBuffer);
                return { success: true };
            } catch (error) {
                console.error('Error sending mic audio to Deepgram:', error);
                return { success: false, error: error.message };
            }
        }
        if (!geminiSessionRef.current) return { success: false, error: 'No active session' };
        try {
            process.stdout.write(',');
            await geminiSessionRef.current.sendRealtimeInput({
                audio: { data: data, mimeType: mimeType },
            });
            return { success: true };
        } catch (error) {
            console.error('Error sending mic audio:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('send-image-content', async (event, { data, prompt }) => {
        try {
            if (!data || typeof data !== 'string') {
                console.error('Invalid image data received');
                return { success: false, error: 'Invalid image data' };
            }

            const buffer = Buffer.from(data, 'base64');

            if (buffer.length < 1000) {
                console.error(`Image buffer too small: ${buffer.length} bytes`);
                return { success: false, error: 'Image buffer too small' };
            }

            process.stdout.write('!');

            if (currentProviderMode === 'cloud') {
                const sent = sendCloudImage(data);
                if (!sent) {
                    return { success: false, error: 'Cloud connection not active' };
                }
                return { success: true, model: 'cloud' };
            }

            if (currentProviderMode === 'local') {
                const result = await getLocalAi().sendLocalImage(data, prompt);
                return result;
            }

            const prefs = getPreferences();
            const textPrompt = prompt || 'Help me on this page, give me the answer no bs, complete answer.';

            // OCR-First Token Saver: If text is cleanly recognized on screen (e.g. DSA question, MCQ, exam problem),
            // send text prompt instead of full image to save 85%+ token quota and avoid rate limits!
            if (prefs.ocrFirstEnabled !== false) {
                try {
                    const { performOcrOnBase64 } = require('./silentOcr');
                    sendToRenderer('update-status', 'Transcribing screen (OCR token saver)...');
                    const ocrText = await performOcrOnBase64(data);
                    if (ocrText && ocrText.trim().length >= 25) {
                        console.log(
                            `[Token Saver] Native OCR extracted ${ocrText.trim().length} chars. Converting screenshot to compact text prompt (~150 tokens vs ~2000 image tokens).`
                        );
                        const fullTextQuery = `${textPrompt}\n\n[Extracted Screen Text Context]:\n${ocrText.trim()}`;

                        // Send text via current active provider / failover chain
                        if (currentProviderMode === 'local') {
                            return await getLocalAi().sendLocalText(fullTextQuery);
                        }

                        // Try Gemini -> OpenRouter -> Groq
                        sendToRenderer('update-status', 'Thinking...');
                        const geminiResult = await sendImageToGeminiHttp(null, fullTextQuery);
                        return geminiResult;
                    }
                    console.log('[Token Saver] Screen text sparse (<25 chars), sending image directly.');
                } catch (ocrErr) {
                    console.warn('[Token Saver] Native OCR skipped:', ocrErr.message);
                }
            }

            // Deepgram / Default mode: send image via provider hierarchy
            const result = await sendImageToGeminiHttp(data, textPrompt);
            return result;
        } catch (error) {
            console.error('Error sending image:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('send-text-message', async (event, text) => {
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return { success: false, error: 'Invalid text message' };
        }

        if (currentProviderMode === 'cloud') {
            try {
                console.log('Sending text to cloud:', text);
                sendCloudText(text.trim());
                return { success: true };
            } catch (error) {
                console.error('Error sending cloud text:', error);
                return { success: false, error: error.message };
            }
        }

        if (currentProviderMode === 'local') {
            try {
                console.log('Sending text to local Ollama:', text);
                return await getLocalAi().sendLocalText(text.trim());
            } catch (error) {
                console.error('Error sending local text:', error);
                return { success: false, error: error.message };
            }
        }

        // ── Deepgram + Groq pipeline ──
        // When Deepgram is active, bypass Gemini Live entirely.
        // Text queries go straight to Groq for instant answers.
        if (isDeepgramMode()) {
            try {
                console.log('[Deepgram mode] Text query → Groq:', text.trim());
                sendToRenderer('update-status', 'Thinking...');
                if (hasGroqKey()) {
                    sendToGroq(text.trim());
                } else {
                    sendToGemma(text.trim());
                }
                return { success: true };
            } catch (error) {
                console.error('Error sending text via Groq:', error);
                return { success: false, error: error.message };
            }
        }

        // ── Gemini Live session fallback ──
        if (!geminiSessionRef.current) return { success: false, error: 'No active Gemini session' };

        try {
            console.log('Sending text message:', text);

            await geminiSessionRef.current.sendRealtimeInput({ text: text.trim() });
            return { success: true };
        } catch (error) {
            console.error('Error sending text:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('start-macos-audio', async event => {
        if (process.platform !== 'darwin') {
            return {
                success: false,
                error: 'macOS audio capture only available on macOS',
            };
        }

        try {
            const success = await startMacOSAudioCapture(geminiSessionRef);
            return { success };
        } catch (error) {
            console.error('Error starting macOS audio capture:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('stop-macos-audio', async event => {
        try {
            stopMacOSAudioCapture();
            return { success: true };
        } catch (error) {
            console.error('Error stopping macOS audio capture:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('close-session', async event => {
        try {
            stopMacOSAudioCapture();

            if (currentProviderMode === 'cloud') {
                closeCloud();
                currentProviderMode = 'byok';
                return { success: true };
            }

            if (currentProviderMode === 'local') {
                getLocalAi().closeLocalSession();
                currentProviderMode = 'byok';
                return { success: true };
            }

            // Set flag to prevent reconnection attempts
            isUserClosing = true;
            sessionParams = null;

            // Cleanup Deepgram WebSocket
            if (deepgramKeepAliveInterval) {
                clearInterval(deepgramKeepAliveInterval);
                deepgramKeepAliveInterval = null;
            }
            if (deepgramWs) {
                try {
                    deepgramWs.close();
                } catch (dgErr) {
                    console.error('Error closing Deepgram WebSocket:', dgErr);
                }
                deepgramWs = null;
            }
            if (deepgramTranscriptionTimeout) {
                clearTimeout(deepgramTranscriptionTimeout);
                deepgramTranscriptionTimeout = null;
            }

            // Cleanup session
            if (geminiSessionRef.current) {
                await geminiSessionRef.current.close();
                geminiSessionRef.current = null;
            }

            return { success: true };
        } catch (error) {
            console.error('Error closing session:', error);
            return { success: false, error: error.message };
        }
    });

    // Conversation history IPC handlers
    ipcMain.handle('get-current-session', async event => {
        try {
            return { success: true, data: getCurrentSessionData() };
        } catch (error) {
            console.error('Error getting current session:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('start-new-session', async event => {
        try {
            initializeNewSession();
            return { success: true, sessionId: currentSessionId };
        } catch (error) {
            console.error('Error starting new session:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('update-google-search-setting', async (event, enabled) => {
        try {
            console.log('Google Search setting updated to:', enabled);
            // The setting is already saved in localStorage by the renderer
            // This is just for logging/confirmation
            return { success: true };
        } catch (error) {
            console.error('Error updating Google Search setting:', error);
            return { success: false, error: error.message };
        }
    });
}

module.exports = {
    initializeGeminiSession,
    getEnabledTools,
    getStoredSetting,
    sendToRenderer,
    initializeNewSession,
    saveConversationTurn,
    getCurrentSessionData,
    startMacOSAudioCapture,
    convertStereoToMono,
    stopMacOSAudioCapture,
    sendAudioToGemini,
    sendImageToGroq,
    sendImageToGeminiHttp,
    setupGeminiIpcHandlers,
    formatSpeakerResults,
    getEffectiveSystemPrompt,
    refreshSystemPrompt,
};
