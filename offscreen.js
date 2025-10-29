// offscreen.js (with better error handling & word tracking)
let currentUtterance = null;
let isPaused = false;

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

            // Event listeners
            currentUtterance.onstart = () => {
                console.log('Speech started');
            };
            
            currentUtterance.onend = () => {
                console.log('Speech ended');
                resetSpeech();
                resolve();
            };
            
            currentUtterance.onerror = (event) => {
                if (event.error === 'interrupted') {
                    console.log("Speech was intentionally interrupted");
                    resolve(); // Don't treat interruption as error
                } else {
                    console.error("Speech error:", event.error);
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
    // Additional cleanup to ensure speech is really stopped
    try {
        speechSynthesis.cancel();
    } catch (error) {
        console.error("Error in final cleanup:", error);
    }
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