// background.js
// Handles context menu and keyboard shortcut for reading selected text

// Global state tracking
let speechState = {
    isPlaying: false,
    isPaused: false
};
let activeSpeechTabId = null;

// 1. Setup the context menu on installation
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "readText",
        title: "Read Selected Text",
        contexts: ["selection"]
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== "readText" || !tab || !tab.id) {
        return;
    }

    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: getSelectedText,
    }, () => {
        if (chrome.runtime.lastError && info.selectionText) {
            speakTextFromBackground(info.selectionText.trim(), tab.id);
        }
    });
});

// 2. Listen for the keyboard shortcut
chrome.commands.onCommand.addListener((command) => {
    switch (command) {
        case "read-text":
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const tab = tabs[0];
                if (!tab || !tab.id || isRestrictedUrl(tab.url)) {
                    return;
                }

                // Inject a function to get the selected text from the page
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
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
    const selection = window.getSelection();
    const selectedText = selection.toString();
    const text = selectedText.trim();

    if (text) {
        setupListenUpHighlighting(selection, text);

        // Send the selected text back to the background script
        chrome.runtime.sendMessage({ action: 'speak', text: text }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Error sending message:', chrome.runtime.lastError.message);
            } else {
                console.log('Message sent successfully:', response);
            }
        });
    } else {
        alert("No text selected!");
    }

    function setupListenUpHighlighting(selection, spokenText) {
        cleanupListenUpHighlighting();

        const wordTokens = getListenUpWordTokens(spokenText);
        let wordIndex = 0;

        if (!wordTokens.length || !selection.rangeCount) {
            return;
        }

        injectListenUpHighlightStyles();

        const ranges = [];
        for (let i = 0; i < selection.rangeCount; i++) {
            ranges.push(selection.getRangeAt(i).cloneRange());
        }

        const segments = collectListenUpTextSegments(ranges);
        segments.forEach(({ node, start, end }) => {
            wordIndex = wrapListenUpWords(node, start, end, wordIndex);
        });

        window.__listenUpHighlight = {
            activeWord: null,
            wordTokens: wordTokens
        };

        if (!window.__listenUpHighlightListenerAdded) {
            chrome.runtime.onMessage.addListener((request) => {
                if (request.action === 'highlightWord') {
                    highlightListenUpWord(request.charIndex);
                } else if (request.action === 'clearHighlight') {
                    cleanupListenUpHighlighting();
                }
            });
            window.__listenUpHighlightListenerAdded = true;
        }
    }

    function collectListenUpTextSegments(ranges) {
        const segments = [];
        const seenNodes = new Set();

        ranges.forEach((range) => {
            if (range.commonAncestorContainer.nodeType === Node.TEXT_NODE) {
                const node = range.commonAncestorContainer;
                const start = node === range.startContainer ? range.startOffset : 0;
                const end = node === range.endContainer ? range.endOffset : node.nodeValue.length;

                if (!seenNodes.has(node) && start < end) {
                    seenNodes.add(node);
                    segments.push({ node, start, end });
                }

                return;
            }

            const walker = document.createTreeWalker(
                range.commonAncestorContainer,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode(node) {
                        if (seenNodes.has(node)) {
                            return NodeFilter.FILTER_REJECT;
                        }

                        if (!range.intersectsNode(node)) {
                            return NodeFilter.FILTER_REJECT;
                        }

                        return NodeFilter.FILTER_ACCEPT;
                    }
                }
            );

            while (walker.nextNode()) {
                const node = walker.currentNode;
                seenNodes.add(node);

                const start = node === range.startContainer ? range.startOffset : 0;
                const end = node === range.endContainer ? range.endOffset : node.nodeValue.length;

                if (start < end) {
                    segments.push({ node, start, end });
                }
            }
        });

        return segments;
    }

    function wrapListenUpWords(node, start, end, wordIndex) {
        const text = node.nodeValue;
        const before = text.slice(0, start);
        const selected = text.slice(start, end);
        const after = text.slice(end);
        const fragment = document.createDocumentFragment();
        const wordPattern = getListenUpWordPattern();
        let lastIndex = 0;
        let match;

        if (before) {
            fragment.appendChild(document.createTextNode(before));
        }

        while ((match = wordPattern.exec(selected)) !== null) {
            if (match.index > lastIndex) {
                fragment.appendChild(document.createTextNode(selected.slice(lastIndex, match.index)));
            }

            const span = document.createElement('span');
            span.dataset.listenupWord = String(wordIndex);
            span.textContent = match[0];
            fragment.appendChild(span);
            wordIndex++;
            lastIndex = match.index + match[0].length;
        }

        if (lastIndex < selected.length) {
            fragment.appendChild(document.createTextNode(selected.slice(lastIndex)));
        }

        if (after) {
            fragment.appendChild(document.createTextNode(after));
        }

        node.parentNode.replaceChild(fragment, node);
        return wordIndex;
    }

    function highlightListenUpWord(charIndex) {
        const state = window.__listenUpHighlight;
        if (!state) {
            return;
        }

        const tokenIndex = state.wordTokens.findIndex((token) => charIndex >= token.start && charIndex < token.end);
        const nextTokenIndex = tokenIndex === -1
            ? state.wordTokens.findIndex((token) => token.start >= charIndex)
            : tokenIndex;

        if (nextTokenIndex === -1) {
            return;
        }

        if (state.activeWord) {
            state.activeWord.classList.remove('listenup-word-active');
        }

        const word = document.querySelector(`[data-listenup-word="${nextTokenIndex}"]`);
        if (word) {
            word.classList.add('listenup-word-active');
            state.activeWord = word;
        }
    }

    function cleanupListenUpHighlighting() {
        const previousWords = document.querySelectorAll('[data-listenup-word]');
        previousWords.forEach((word) => {
            const parent = word.parentNode;
            word.replaceWith(document.createTextNode(word.textContent));
            if (parent) {
                parent.normalize();
            }
        });

        const style = document.getElementById('listenup-highlight-style');
        if (style) {
            style.remove();
        }

        window.__listenUpHighlight = null;
    }

    function injectListenUpHighlightStyles() {
        if (document.getElementById('listenup-highlight-style')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'listenup-highlight-style';
        style.textContent = '.listenup-word-active{background:#ffe66d!important;color:#111!important;border-radius:3px!important;box-shadow:0 0 0 2px #ffe66d!important;}';
        document.documentElement.appendChild(style);
    }

    function getListenUpWordTokens(text) {
        const tokens = [];
        const wordPattern = getListenUpWordPattern();
        let match;

        while ((match = wordPattern.exec(text)) !== null) {
            tokens.push({
                start: match.index,
                end: match.index + match[0].length
            });
        }

        return tokens;
    }

    function getListenUpWordPattern() {
        try {
            return new RegExp("[\\p{L}\\p{N}]+(?:['’\\-][\\p{L}\\p{N}]+)*", 'gu');
        } catch (error) {
            return /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g;
        }
    }
}

// 4. Listen for messages from the injected script (from the keyboard shortcut) and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Background received message:', request.action);
    
    switch (request.action) {

        case "speak":
            speakTextFromBackground(request.text, sender.tab && sender.tab.id).then(() => {
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
        case "speechBoundary":
            highlightActiveTabWord(request.charIndex);
            sendResponse({ success: true });
            return true;
        case "speechFinished":
            clearActiveTabHighlight();
            speechState.isPlaying = false;
            speechState.isPaused = false;
            sendResponse({ success: true });
            return true;
        } 
        
        // Send response for other messages
        sendResponse({ success: true });
});

// 5. CENTRAL FUNCTION: Handles sending text to the offscreen document for speech
async function speakTextFromBackground(text, tabId = null) {
    if (!text) return; // Nothing to read
    
    // Update state
    speechState.isPlaying = true;
    speechState.isPaused = false;
    activeSpeechTabId = tabId;
    
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
    clearActiveTabHighlight();
    
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

function highlightActiveTabWord(charIndex) {
    if (!activeSpeechTabId || typeof charIndex !== 'number') {
        return;
    }

    chrome.tabs.sendMessage(activeSpeechTabId, {
        action: 'highlightWord',
        charIndex: charIndex
    }, () => {
        if (chrome.runtime.lastError) {
            console.log('Highlight not available on this page:', chrome.runtime.lastError.message);
        }
    });
}

function clearActiveTabHighlight() {
    if (!activeSpeechTabId) {
        return;
    }

    chrome.tabs.sendMessage(activeSpeechTabId, { action: 'clearHighlight' }, () => {
        if (chrome.runtime.lastError) {
            console.log('Clear highlight not available on this page:', chrome.runtime.lastError.message);
        }
    });
}

function isRestrictedUrl(url = '') {
    return url.startsWith('chrome://') ||
        url.startsWith('chrome-extension://') ||
        url.startsWith('moz-extension://');
}
