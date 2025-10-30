// offscreen.js (with better error handling)
let currentUtterance = null;
let isPaused = false;
let currentText = '';

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.target !== 'offscreen') {
        return false; // Not for us
    }
    
    console.log("Offscreen document received message:", message.type);
    
    switch (message.type) {
        case 'SPEAK_TEXT':
            speakText(message.text, message.rate).then(() => {
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

            currentText = text;

            // Create and speak the new utterance
            currentUtterance = new SpeechSynthesisUtterance(text);
            currentUtterance.rate = rate;
            currentUtterance.pitch = 1.0;
            currentUtterance.volume = 1.0;

            // Event listeners
            currentUtterance.onstart = () => {
                console.log('Speech started');
                // Send start tracking message to content script
                sendMessageToContent('START_TRACKING', { text: text });
            };

            currentUtterance.onboundary = (event) => {
                if (event.name === 'word') {
                    console.log(`🎤 Word boundary: charIndex=${event.charIndex}, charLength=${event.charLength}`);
                    const wordText = currentText.substring(event.charIndex, event.charIndex + event.charLength);
                    console.log(`🎤 Word text: "${wordText}"`);

                    // Send word highlight message to content script
                    sendMessageToContent('WORD_HIGHLIGHT', {
                        charIndex: event.charIndex,
                        charLength: event.charLength,
                        text: currentText
                    });
                }
            };

            currentUtterance.onend = () => {
                console.log('Speech ended');
                sendMessageToContent('CLEAR_HIGHLIGHT');
                sendMessageToContent('STOP_TRACKING');
                resetSpeech();
                resolve(); 
            };

            currentUtterance.onerror = (event) => {
                if (event.error === 'interrupted') {
                    console.log("Speech was intentionally interrupted");
                    sendMessageToContent('CLEAR_HIGHLIGHT');
                    sendMessageToContent('STOP_TRACKING');
                    resolve(); // Don't treat interruption as error
                } else {
                    console.error("Speech error:", event.error);
                    sendMessageToContent('CLEAR_HIGHLIGHT');
                    sendMessageToContent('STOP_TRACKING');
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
            console.log('Speech resumed');
            // Note: timeouts will continue from where they left off
        } else {
            // Pause
            speechSynthesis.pause();
            isPaused = true;
            console.log('Speech paused');
            // Clear current highlight when paused
            sendMessageToContent('CLEAR_HIGHLIGHT');
        }
    }
    return { isPaused: isPaused };
}

function sendMessageToContent(type, data = {}) {
    console.log('📤 Sending message to content:', type, data);
    // Send message to content script via background script
    chrome.runtime.sendMessage({
        type: type,
        target: 'content',
        ...data
    }).then(() => {
        console.log('✅ Message sent successfully:', type);
    }).catch(error => {
        console.error('❌ Error sending message to content:', type, error);
    });
}

// Notify background script when offscreen document is ready
chrome.runtime.sendMessage({ type: "OFFSCREEN_READY" });
