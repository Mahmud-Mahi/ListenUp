// background.js
// Handles context menu and keyboard shortcut for reading selected text

// Global state tracking
let speechState = {
    isPlaying: false,
    isPaused: false
};

// 1. Setup the context menu on installation
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "readText",
        title: "Read Selected Text",
        contexts: ["selection"]
    });
});

// 2. Listen for the keyboard shortcut
chrome.commands.onCommand.addListener((command) => {
    switch (command) {
        case "read-text":
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                // Inject a function to get the selected text from the page
                chrome.scripting.executeScript({
                    target: { tabId: tabs[0].id },
                    function: getSelectedText,
                });
            });
            break;
        case "stop-reading":
            // Send a message to stop speech
            stopReading();
            break;
        case "toggle-playback":
            // Send a message to pause speech
            togglePlayback();
            break;
    }
});

// 3. This function is injected into the web page by the command listener
function getSelectedText() {
    const selection = window.getSelection().toString();
    if (selection) {
        // Send the selected text back to the background script
        chrome.runtime.sendMessage({ action: 'speak', text: selection.trim() }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Error sending message:', chrome.runtime.lastError.message);
            } else {
                console.log('Message sent successfully:', response);
            }
        });
    } else {
        alert("No text selected!");
    }
}

// 4. Listen for messages from the injected script (from the keyboard shortcut) and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Background received message:', request.action);
    
    switch (request.action) {

        case "speak":
            speakTextFromBackground(request.text).then(() => {
                sendResponse({ success: true });
            }).catch((error) => {
                console.error('Speak error:', error);
                sendResponse({ success: false, error: error.message });
            });
            return true; // Keep message channel open for async response
        case "stop":
            stopReading().then(() => {
                sendResponse({ success: true });
            }).catch((error) => {
                console.error('Stop error:', error);
                sendResponse({ success: false, error: error.message });
            });
            return true; // Keep message channel open for async response
        case "toggle":
            togglePlayback().then((result) => {
                speechState.isPaused = result.isPaused;
                sendResponse({ success: true, isPaused: result.isPaused });
            }).catch((error) => {
                console.error('Toggle error:', error);
                sendResponse({ success: false, error: error.message });
            });
            return true; // Keep message channel open for async response
        case "getState":
            sendResponse({ success: true, isPaused: speechState.isPaused, isPlaying: speechState.isPlaying });
            return true;
        } 
        
        // Send response for other messages
        sendResponse({ success: true });
});

// 5. CENTRAL FUNCTION: Handles sending text to the offscreen document for speech
async function speakTextFromBackground(text) {
    if (!text) return; // Nothing to read
    
    // Update state
    speechState.isPlaying = true;
    speechState.isPaused = false;
    
    //console.log("Preparing to speak text:", text);

    // Get the speech rate from storage
    const result = await chrome.storage.sync.get('speechRate');
    const rate = result.speechRate || 1.0;

    // Check if an offscreen document already exists
    const hasOffscreenDoc = await chrome.offscreen.hasDocument();
    
    // Check if an offscreen document already exists
    if (!hasOffscreenDoc) {
        // If it doesn't, create one. We need a reason and a justification.
        try {
            await chrome.offscreen.createDocument({
                url: 'offscreen.htm',
                reasons: ['AUDIO_PLAYBACK'], // The required reason for using TTS
                justification: 'Playback for text-to-speech functionality' // Required field
        });
            console.log("Offscreen document created");
            // CRITICAL FIX: Wait for the offscreen document to fully load
            // before trying to send it a message
            await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay
        } catch (error) {
            console.error("Failed to create offscreen document:", error);
            return;
        }
    }

    // Now that we know the offscreen document exists, send it the text to speak
    // Use a retry mechanism in case the document is still loading
    let retries = 3;
    
    async function trySendMessage() {
        try {
            await chrome.runtime.sendMessage({
                type: 'SPEAK_TEXT',
                target: 'offscreen',
                text: text,
                rate: rate
            });
            console.log("Message sent successfully to offscreen document");
        } catch (error) {
            if (retries > 0) {
                console.log(`Retrying message send... (${retries} attempts left)`);
                retries--;
                await new Promise(resolve => setTimeout(resolve, 50)); // 50ms delay before retry
                return trySendMessage();
            } else {
                if (error.message.includes("Receiving end does not exist")) {
                    console.log("Offscreen document not available for SPEAK_TEXT");
                } else {
                    console.error("Failed to send message to offscreen document after multiple attempts:", error);
                }
            }
        }
    }
    await trySendMessage();
}

// 6. Function to stop reading
async function stopReading() {
    // Reset state
    speechState.isPlaying = false;
    speechState.isPaused = false;
    
    // Check if offscreen document exists
    const hasOffscreenDoc = await chrome.offscreen.hasDocument();
    if (!hasOffscreenDoc) {
        console.log("No offscreen document exists, nothing to stop");
        return;
    }

    // Wait for the offscreen document to be ready
    await new Promise(resolve => setTimeout(resolve, 100));

    // Send message with retry mechanism
    let retries = 3;
    async function trySendStopMessage() {
        try {
            await chrome.runtime.sendMessage({
                type: 'STOP_READING',
                target: 'offscreen'
            });
            console.log("Sent STOP_READING message to offscreen document");
        } catch (error) {
            if (retries > 0) {
                console.log(`Retrying stop message send... (${retries} attempts left)`);
                retries--;
                await new Promise(resolve => setTimeout(resolve, 50));
                return trySendStopMessage();
            } else {
                if (error.message.includes("Receiving end does not exist")) {
                    console.log("Offscreen document not available for STOP_READING");
                } else {
                    console.error("Failed to send STOP_READING message after multiple attempts:", error);
                }
            }
        }
    }
    await trySendStopMessage();
}

// 7. Function to toggle playback (pause/resume)
async function togglePlayback() {
    // Check if offscreen document exists
    const hasOffscreenDoc = await chrome.offscreen.hasDocument();
    if (!hasOffscreenDoc) {
        console.log("No offscreen document exists, nothing to toggle");
        return { isPaused: false };
    }

    // Wait for the offscreen document to be ready
    await new Promise(resolve => setTimeout(resolve, 100));

    // Send message with retry mechanism
    let retries = 3;
    async function trySendToggleMessage() {
        try {
            return new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    type: 'TOGGLE_PLAYBACK',
                    target: 'offscreen'
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        console.log("Sent TOGGLE_PLAYBACK message to offscreen document");
                        resolve(response);
                    }
                });
            });
        } catch (error) {
            if (retries > 0) {
                console.log(`Retrying toggle message send... (${retries} attempts left)`);
                retries--;
                await new Promise(resolve => setTimeout(resolve, 50));
                return trySendToggleMessage();
            } else {
                console.error("Failed to send TOGGLE_PLAYBACK message after multiple attempts:", error);
                throw error;
            }
        }
    }
    
    try {
        const result = await trySendToggleMessage();
        return result || { isPaused: !speechState.isPaused };
    } catch (error) {
        // Fallback: toggle our local state
        speechState.isPaused = !speechState.isPaused;
        return { isPaused: speechState.isPaused };
    }
}
