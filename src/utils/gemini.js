const { GoogleGenAI, Modality } = require('@google/genai');
const { BrowserWindow, ipcMain, dialog } = require('electron');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const { saveDebugAudio } = require('../audioUtils');
const { getSystemPrompt } = require('./prompts');
const {
    getAvailableModel,
    incrementLimitCount,
    getApiKey,
    getGroqApiKey,
    getDeepgramApiKey,
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
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
        windows[0].webContents.send(channel, data);
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
function initializeNewSession(profile = null, customPrompt = null) {
    currentSessionId = Date.now().toString();
    currentTranscription = '';
    conversationHistory = [];
    screenAnalysisHistory = [];
    groqConversationHistory = [];
    currentProfile = profile;
    currentCustomPrompt = customPrompt;
    console.log('New conversation session started:', currentSessionId, 'profile:', profile);

    // Save initial session with profile context
    if (profile) {
        sendToRenderer('save-session-context', {
            sessionId: currentSessionId,
            profile: profile,
            customPrompt: customPrompt || '',
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
        console.log('No Groq API key configured, skipping Groq response');
        return;
    }

    if (!transcription || transcription.trim() === '') {
        console.log('Empty transcription, skipping Groq');
        return;
    }

    const modelToUse = getModelForToday();
    if (!modelToUse) {
        console.log('All Groq daily limits exhausted');
        sendToRenderer('update-status', 'Groq limits reached for today');
        return;
    }

    console.log(`Sending to Groq (${modelToUse}):`, transcription.substring(0, 100) + '...');

    groqConversationHistory.push({
        role: 'user',
        content: transcription.trim(),
    });

    if (groqConversationHistory.length > 20) {
        groqConversationHistory = groqConversationHistory.slice(-20);
    }

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${groqApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: modelToUse,
                messages: [{ role: 'system', content: currentSystemPrompt || 'You are a helpful assistant.' }, ...groqConversationHistory],
                stream: true,
                temperature: 0.1,
                max_tokens: 600,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Groq API error:', response.status, errorText);
            sendToRenderer('update-status', `Groq error: ${response.status}`);
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let isFirst = true;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(line => line.trim() !== '');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;

                    try {
                        const json = JSON.parse(data);
                        const token = json.choices?.[0]?.delta?.content || '';
                        if (token) {
                            fullText += token;
                            const displayText = stripThinkingTags(fullText);
                            if (displayText) {
                                sendToRenderer(isFirst ? 'new-response' : 'update-response', displayText);
                                isFirst = false;
                            }
                        }
                    } catch (parseError) {
                        // Skip invalid JSON chunks
                    }
                }
            }
        }

        const cleanedResponse = stripThinkingTags(fullText);
        const modelKey = modelToUse.split('/').pop();

        const systemPromptChars = (currentSystemPrompt || 'You are a helpful assistant.').length;
        const historyChars = groqConversationHistory.reduce((sum, msg) => sum + (msg.content || '').length, 0);
        const inputChars = systemPromptChars + historyChars;
        const outputChars = cleanedResponse.length;

        incrementCharUsage('groq', modelKey, inputChars + outputChars);

        if (cleanedResponse) {
            groqConversationHistory.push({
                role: 'assistant',
                content: cleanedResponse,
            });

            saveConversationTurn(transcription, cleanedResponse);
        }

        console.log(`Groq response completed (${modelToUse})`);
        sendToRenderer('update-status', 'Listening...');
    } catch (error) {
        console.error('Error calling Groq API:', error);
        sendToRenderer('update-status', 'Groq error: ' + error.message);
    }
}

async function sendToGemma(transcription) {
    const apiKey = getApiKey();
    if (!apiKey) {
        console.log('No Gemini API key configured');
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

    try {
        const ai = new GoogleGenAI({ apiKey: apiKey });

        const messages = trimmedHistory.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }],
        }));

        const systemPrompt = currentSystemPrompt || 'You are a helpful assistant.';

        const response = await ai.models.generateContentStream({
            model: 'gemini-2.5-flash-lite',
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

        const systemPromptChars = (currentSystemPrompt || 'You are a helpful assistant.').length;
        const historyChars = trimmedHistory.reduce((sum, msg) => sum + (msg.content || '').length, 0);
        const inputChars = systemPromptChars + historyChars;
        const outputChars = fullText.length;

        incrementCharUsage('gemini', 'gemini-2.5-flash-lite', inputChars + outputChars);

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

        console.log('Gemini response completed');
        sendToRenderer('update-status', 'Listening...');
    } catch (error) {
        console.error('Error calling Gemini API:', error);
        sendToRenderer('update-status', 'Gemini error: ' + error.message);
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

    const prefs = getPreferences();
    let finalCustomPrompt = customPrompt;
    if (prefs.cvText && prefs.cvText.trim()) {
        finalCustomPrompt = `${customPrompt}\n\n[CV/Resume Context]:\n${prefs.cvText}`;
        console.log('Integrated CV Context, length:', prefs.cvText.length);
    }

    const systemPrompt = getSystemPrompt(profile, finalCustomPrompt, googleSearchEnabled);
    currentSystemPrompt = systemPrompt; // Store for Groq

    // Initialize new conversation session only on first connect
    if (!isReconnect) {
        initializeNewSession(profile, customPrompt);
    }

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

function killExistingSystemAudioDump() {
    return new Promise(resolve => {
        console.log('Checking for existing SystemAudioDump processes...');

        // Kill any existing SystemAudioDump processes
        const killProc = spawn('pkill', ['-f', 'SystemAudioDump'], {
            stdio: 'ignore',
        });

        killProc.on('close', code => {
            if (code === 0) {
                console.log('Killed existing SystemAudioDump processes');
            } else {
                console.log('No existing SystemAudioDump processes found');
            }
            resolve();
        });

        killProc.on('error', err => {
            console.log('Error checking for existing processes (this is normal):', err.message);
            resolve();
        });

        // Timeout after 2 seconds
        setTimeout(() => {
            killProc.kill();
            resolve();
        }, 2000);
    });
}

function triggerDeepgramGroqAnswer() {
    const textToSend = currentTranscription.trim();
    currentTranscription = '';
    if (textToSend) {
        console.log('[Deepgram] Triggering answers for:', textToSend);
        sendToRenderer('update-status', 'Thinking...');
        if (hasGroqKey()) {
            sendToGroq(textToSend);
        } else {
            sendToGemma(textToSend);
        }
    }
}

async function connectDeepgramWebSocket(language = 'en-US') {
    return new Promise(resolve => {
        try {
            console.log('Connecting to Deepgram WebSocket...');
            sendToRenderer('update-status', 'Connecting to Deepgram...');

            const model = 'nova-2-general';
            const langCode = language || 'en-US';
            const url = `wss://api.deepgram.com/v1/listen?encoding=linear16&sample_rate=24000&channels=1&model=${model}&language=${langCode}&interim_results=true&endpointing=100`;

            deepgramWs = new WebSocket(url, {
                headers: {
                    Authorization: `Token ${deepgramApiKey}`,
                },
            });

            deepgramWs.on('open', () => {
                console.log('Deepgram WebSocket connected!');
                sendToRenderer('update-status', 'Deepgram connected. Listening...');
                // ponytail: keepalive every 8s so Deepgram doesn't idle-close (~10s timeout)
                deepgramKeepAliveInterval = setInterval(() => {
                    if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
                        deepgramWs.send(JSON.stringify({ type: 'KeepAlive' }));
                    }
                }, 8000);
                resolve(true);
            });

            deepgramWs.on('message', data => {
                try {
                    const response = JSON.parse(data.toString());
                    if (response.channel && response.channel.alternatives && response.channel.alternatives[0]) {
                        const transcript = response.channel.alternatives[0].transcript;
                        const isFinal = response.is_final;
                        const speechFinal = response.speech_final;

                        if (transcript.trim() !== '') {
                            sendToRenderer('update-status', 'Transcribing: ' + transcript);

                            if (isFinal) {
                                currentTranscription += ' ' + transcript;

                                if (isManualMode) {
                                    sendToRenderer('update-status', 'Recording question...');
                                } else if (speechFinal) {
                                    if (deepgramTranscriptionTimeout) clearTimeout(deepgramTranscriptionTimeout);
                                    triggerDeepgramGroqAnswer();
                                } else {
                                    if (deepgramTranscriptionTimeout) clearTimeout(deepgramTranscriptionTimeout);
                                    deepgramTranscriptionTimeout = setTimeout(() => {
                                        triggerDeepgramGroqAnswer();
                                    }, 350);
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.error('Error parsing Deepgram message:', e);
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

    // Use prompts module to get current instruction
    const googleSearchEnabled = false;
    const prefs = getPreferences();
    let finalCustomPrompt = customPrompt;
    if (prefs.cvText && prefs.cvText.trim()) {
        finalCustomPrompt = `${customPrompt}\n\n[CV/Resume Context]:\n${prefs.cvText}`;
        console.log('Integrated CV Context, length:', prefs.cvText.length);
    }
    const systemPrompt = getSystemPrompt(profile, finalCustomPrompt, googleSearchEnabled);
    currentSystemPrompt = systemPrompt;

    initializeNewSession(profile, finalCustomPrompt);
    return connectDeepgramWebSocket(language);
}

async function startMacOSAudioCapture(geminiSessionRef) {
    if (process.platform !== 'darwin') return false;

    // Kill any existing SystemAudioDump processes first
    await killExistingSystemAudioDump();

    hasShownPermissionDialog = false;

    console.log('Starting macOS audio capture with SystemAudioDump...');

    const { app } = require('electron');
    const path = require('path');

    let systemAudioPath;
    if (app.isPackaged) {
        systemAudioPath = path.join(process.resourcesPath, 'SystemAudioDump');
    } else {
        systemAudioPath = path.join(__dirname, '../assets', 'SystemAudioDump');
    }

    console.log('SystemAudioDump path:', systemAudioPath);

    const spawnOptions = {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
            ...process.env,
        },
    };

    systemAudioProc = spawn(systemAudioPath, [], spawnOptions);

    if (!systemAudioProc.pid) {
        console.error('Failed to start SystemAudioDump');
        return false;
    }

    console.log('SystemAudioDump started with PID:', systemAudioProc.pid);

    const CHUNK_DURATION = 0.1;
    const SAMPLE_RATE = 24000;
    const BYTES_PER_SAMPLE = 2;
    const CHANNELS = 2;
    const CHUNK_SIZE = SAMPLE_RATE * BYTES_PER_SAMPLE * CHANNELS * CHUNK_DURATION;

    let audioBuffer = Buffer.alloc(0);

    systemAudioProc.stdout.on('data', data => {
        if (isManualMode && !isManualRecording) {
            return;
        }
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
                deepgramWs.send(monoChunk);
            } else {
                const base64Data = monoChunk.toString('base64');
                sendAudioToGemini(base64Data, geminiSessionRef);
            }

            if (process.env.DEBUG_AUDIO) {
                console.log(`Processed audio chunk: ${chunk.length} bytes`);
                saveDebugAudio(monoChunk, 'system_audio');
            }
        }

        const maxBufferSize = SAMPLE_RATE * BYTES_PER_SAMPLE * 1;
        if (audioBuffer.length > maxBufferSize) {
            audioBuffer = audioBuffer.slice(-maxBufferSize);
        }
    });

    systemAudioProc.stderr.on('data', data => {
        const errorMsg = data.toString();
        console.error('SystemAudioDump stderr:', errorMsg);

        if (!hasShownPermissionDialog && (errorMsg.includes('SCStreamErrorDomain') || errorMsg.includes('-3821'))) {
            hasShownPermissionDialog = true;
            console.error('[Permissions] Missing macOS Screen Recording permission detected.');
            dialog.showMessageBox({
                type: 'warning',
                title: 'Permission Required',
                message: 'macOS Screen & Audio Recording Permission Required',
                detail: 'Norton 340 requires "Screen & System Audio Recording" or "Screen Recording" permission to capture your system audio.\n\nPlease enable it under:\nSystem Settings > Privacy & Security > Screen & System Audio Recording (or Screen Recording)\n\nAfter enabling, please restart the application.',
                buttons: ['OK'],
            });
            sendToRenderer('update-status', 'Error: Permissions missing');
        }
    });

    systemAudioProc.on('close', code => {
        console.log('SystemAudioDump process closed with code:', code);
        systemAudioProc = null;
    });

    systemAudioProc.on('error', err => {
        console.error('SystemAudioDump process error:', err);
        systemAudioProc = null;
    });

    return true;
}

function convertStereoToMono(stereoBuffer) {
    const samples = stereoBuffer.length / 4;
    const monoBuffer = Buffer.alloc(samples * 2);

    for (let i = 0; i < samples; i++) {
        // Average L + R channels so neither side is lost
        const leftSample = stereoBuffer.readInt16LE(i * 4);
        const rightSample = stereoBuffer.readInt16LE(i * 4 + 2);
        const mono = Math.round((leftSample + rightSample) / 2);
        monoBuffer.writeInt16LE(mono, i * 2);
    }

    return monoBuffer;
}

function stopMacOSAudioCapture() {
    if (systemAudioProc) {
        console.log('Stopping SystemAudioDump...');
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
                    { role: 'system', content: currentSystemPrompt || 'You are a helpful assistant.' },
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

async function sendImageToGeminiHttp(base64Data, prompt) {
    const apiKey = getApiKey();

    // No Gemini key → go straight to Groq vision
    if (!apiKey) {
        return sendImageToGroq(base64Data, prompt);
    }

    const model = getAvailableModel();

    try {
        const ai = new GoogleGenAI({ apiKey: apiKey });

        const contents = [
            { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
            { text: prompt },
        ];

        console.log(`Sending image to ${model} (streaming)...`);
        const response = await ai.models.generateContentStream({
            model: model,
            contents: contents,
            config: {
                systemInstruction: currentSystemPrompt || 'You are a helpful assistant.',
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

        console.log(`Image response completed from ${model}`);
        saveScreenAnalysis(prompt, fullText, model);
        return { success: true, text: fullText, model: model };
    } catch (error) {
        console.error('Error sending image to Gemini HTTP:', error);
        // Fallback to Groq vision on Gemini failure
        console.log('Falling back to Groq vision...');
        return sendImageToGroq(base64Data, prompt);
    }
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
            initializeNewSession(profile);
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

            // Deepgram mode: run Gemini vision API (with the real screenshot) to analyze the image
            if (isDeepgramMode()) {
                const textPrompt = prompt || 'Describe what you see in this screenshot and answer any question shown.';
                console.log('[Deepgram mode] Image received – running Gemini vision.');

                // Exclusively run Gemini HTTP vision for image-based requests to avoid concurrent streaming conflicts
                const result = await sendImageToGeminiHttp(data, textPrompt);
                return result;
            }

            // Use Gemini HTTP API instead of realtime session
            const result = await sendImageToGeminiHttp(data, prompt);
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
    killExistingSystemAudioDump,
    startMacOSAudioCapture,
    convertStereoToMono,
    stopMacOSAudioCapture,
    sendAudioToGemini,
    sendImageToGroq,
    sendImageToGeminiHttp,
    setupGeminiIpcHandlers,
    formatSpeakerResults,
};
