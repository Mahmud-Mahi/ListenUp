// background.js
// Handles context menu and keyboard shortcut for reading selected text

// Global state tracking
let speechState = {
    isPlaying: false,
    isPaused: false,
    activeTabId: null
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
                chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                function: getSelectedText,
            }, () => {
                if (chrome.runtime.lastError) {
                    console.error('Script injection error:', chrome.runtime.lastError.message);
                    alert('Error accessing page content. Make sure you have selected text on a regular webpage.');
                }
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
    if (selection && selection.trim()) {
        console.log('📝 Original selected text:', JSON.stringify(selection));
        console.log('📏 Original length:', selection.length);

        // Normalize the text to handle newlines and whitespace consistently
        // Replace newlines/tabs with spaces and collapse multiple spaces
        const normalizedText = selection.trim().replace(/[\n\r\t]/g, ' ').replace(/\s+/g, ' ');

        console.log('🔄 Normalized text:', JSON.stringify(normalizedText));
        console.log('📏 Normalized length:', normalizedText.length);
        console.log('📊 Length difference:', selection.length - normalizedText.length);

        // Send the normalized text back to the background script
        chrome.runtime.sendMessage({ action: 'speak', text: normalizedText }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Error sending message:', chrome.runtime.lastError.message);
            } else {
                console.log('Message sent successfully:', response);
            }
        });
    } else {
        alert('No text selected! Please select some text on the webpage first.');
    }
}

// 4. Listen for messages from the injected script (from the keyboard shortcut) and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Background received message:', request.action || request.type);

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

        case "get_state":
            sendResponse({ success: true, isPaused: speechState.isPaused, isPlaying: speechState.isPlaying });
            return true;
        // Send response for other messages
        default:
            sendResponse({ success: true });
            break;
    }

    switch (request.type) {
        case "WORD_HIGHLIGHT":
        case "CLEAR_HIGHLIGHT":
        case "START_TRACKING":
        case "STOP_TRACKING":
            // Forward messages to content scripts
            forwardToContentScripts(request).then(() => {
                sendResponse({ success: true });
                console.log('Forwarded message to content script:', request.type);
            }).catch((error) => {
                console.error('Content forward error:', error);
                sendResponse({ success: false, error: error.message });
            });
            return true;  // Keep message channel open for async response
        
        default:
            sendResponse({ success: true });
            break;
    }
        
});

// 5. CENTRAL FUNCTION: Handles sending text to the offscreen document for speech
async function speakTextFromBackground(text) {
    if (!text) return; // Nothing to read

    // Get the active tab and inject content script
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];
    if (!activeTab) {
        console.error("No active tab found");
        return;
    }

    speechState.activeTabId = activeTab.id;

    try {
        await chrome.tabs.sendMessage(tabId, { type: "PING" });
    // if success, it's already injected
    } catch (e) {
        // not injected yet → inject it
        await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        files: ["content.js"]
        });
    }

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

// 8. Forward messages to the active content script
async function forwardToContentScripts(message) {
    if (!speechState.activeTabId) {
        console.log('No active tab ID for forwarding message:', message.type);
        return;
    }

    console.log('Forwarding message to active tab', speechState.activeTabId, ':', message.type);

    return new Promise((resolve) => {
        chrome.tabs.sendMessage(speechState.activeTabId, message, (response) => {
            if (chrome.runtime.lastError) {
                console.log('Error forwarding to active tab:', chrome.runtime.lastError.message);
                resolve();
            } else {
                console.log('Successfully forwarded to active tab');
                resolve(response);
            }
        });
    });
}
