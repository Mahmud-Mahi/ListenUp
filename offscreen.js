// offscreen.js (with better error handling & word tracking)
let currentUtterance = null;
let isPaused = false;
let currentBoundaryCheck = null;

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.target !== 'offscreen') {
        return false; // Not for us
    }
    
    console.log("Offscreen document received message:", message.type);
    
    switch (message.type) {
        case 'SPEAK_TEXT':
            speakText(message.text, message.rate, message.voiceIndex).then(() => {
                sendResponse({ success: true });
            }).catch((error) => {
                sendResponse({ success: false, error: error.message });
            });
            return true; // Keep message channel open for async response
            
        case 'STOP_READING':
            resetSpeech();
            sendResponse({ success: true });
            return true;
            
        case 'TOGGLE_PLAYBACK':
            const toggleResult = togglePlayback();
            sendResponse({ success: true, isPaused: toggleResult.isPaused });
            return true;
    }
    
    return false;
});

async function speakText(text, rate = 1.0) {
    return new Promise((resolve, reject) => {
        try {
            // Stop any ongoing speech first
            resetSpeech();

            // Create and speak the new utterance
            currentUtterance = new SpeechSynthesisUtterance(text);
            currentUtterance.rate = rate;
            currentUtterance.pitch = 1.0;
            currentUtterance.volume = 1.0;
            currentBoundaryCheck = {
                fired: false,
                wordBoundaryFired: false
            };

            logTtsEngineInfo(currentUtterance);

            // Event listeners
            currentUtterance.onstart = () => {
                console.log('Speech started');
            };

            currentUtterance.onboundary = (event) => {
                if (!currentBoundaryCheck) {
                    return;
                }

                currentBoundaryCheck.fired = true;

                if (event.name !== 'word' || typeof event.charIndex !== 'number') {
                    console.log('[ListenUp TTS] Boundary event fired, but not a word boundary:', {
                        name: event.name,
                        charIndex: event.charIndex,
                        elapsedTime: event.elapsedTime
                    });
                    return;
                }

                if (!currentBoundaryCheck.wordBoundaryFired) {
                    currentBoundaryCheck.wordBoundaryFired = true;
                    console.log('[ListenUp TTS] This voice supports word onboundary events.');
                }

                chrome.runtime.sendMessage({
                    action: 'speechBoundary',
                    charIndex: event.charIndex
                }, () => {
                    if (chrome.runtime.lastError) {
                        console.log('Speech boundary was not handled:', chrome.runtime.lastError.message);
                    }
                });
            };
            
            currentUtterance.onend = () => {
                console.log('Speech ended');
                logBoundarySupportResult();
                notifySpeechFinished();
                resetSpeech();
                resolve();
            };
            
            currentUtterance.onerror = (event) => {
                if (event.error === 'interrupted') {
                    console.log("Speech was intentionally interrupted");
                    logBoundarySupportResult();
                    notifySpeechFinished();
                    resolve(); // Don't treat interruption as error
                } else {
                    console.error("Speech error:", event.error);
                    logBoundarySupportResult();
                    notifySpeechFinished();
                    resetSpeech();
                    reject(new Error(`Speech error: ${event.error}`));
                }
            };
            
            // Start speaking
            speechSynthesis.speak(currentUtterance);
            
            // Resolve immediately since we're starting the speech
            // The onend/onerror handlers will handle completion
            setTimeout(() => resolve(), 100);
            
        } catch (error) {
            console.error("Error in speakText:", error);
            reject(error);
        }
    });
}

function resetSpeech() {
    isPaused = false;
    currentUtterance = null;
    currentBoundaryCheck = null;
    // Additional cleanup to ensure speech is really stopped
    try {
        speechSynthesis.cancel();
    } catch (error) {
        console.error("Error in final cleanup:", error);
    }
}

function logTtsEngineInfo(utterance) {
    const voices = speechSynthesis.getVoices();
    const selectedVoice = utterance.voice || getDefaultVoice(voices);

    console.group('[ListenUp TTS] Engine diagnostics');
    console.log('Speech synthesis available:', 'speechSynthesis' in window);
    console.log('SpeechSynthesisUtterance available:', 'SpeechSynthesisUtterance' in window);
    console.log('onboundary API property available:', 'onboundary' in SpeechSynthesisUtterance.prototype);
    console.log('Selected voice:', formatVoiceInfo(selectedVoice));
    console.log('Available voices:', voices.map(formatVoiceInfo));
    console.log('Runtime word-boundary support: waiting for speech boundary events...');
    console.groupEnd();
}

function logBoundarySupportResult() {
    if (!currentBoundaryCheck) {
        return;
    }

    if (currentBoundaryCheck.wordBoundaryFired) {
        console.log('[ListenUp TTS] Result: word onboundary supported by the active voice.');
    } else if (currentBoundaryCheck.fired) {
        console.log('[ListenUp TTS] Result: boundary events fired, but no word boundaries were reported.');
    } else {
        console.log('[ListenUp TTS] Result: no boundary events fired. This voice/engine likely does not support word highlighting.');
    }
}

function getDefaultVoice(voices) {
    return voices.find((voice) => voice.default) || voices[0] || null;
}

function formatVoiceInfo(voice) {
    if (!voice) {
        return 'No voice selected yet';
    }

    return {
        name: voice.name,
        lang: voice.lang,
        voiceURI: voice.voiceURI,
        localService: voice.localService,
        default: voice.default
    };
}

function notifySpeechFinished() {
    chrome.runtime.sendMessage({ action: 'speechFinished' }, () => {
        if (chrome.runtime.lastError) {
            console.log('Speech finish was not handled:', chrome.runtime.lastError.message);
        }
    });
}

function togglePlayback() {
    if (speechSynthesis.speaking) {
        if (isPaused) {
            // Resume
            speechSynthesis.resume();
            isPaused = false;
        } else {
            // Pause
            speechSynthesis.pause();
            isPaused = true;
        }
    }
    return { isPaused: isPaused };
}

// Let the background know we're ready when the offscreen document loads
console.log("Offscreen document loaded and ready");
speechSynthesis.onvoiceschanged = () => {
    console.log('[ListenUp TTS] Voices loaded:', speechSynthesis.getVoices().map(formatVoiceInfo));
};
