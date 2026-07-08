// popup.js
function loadCommandShortcuts() {
    if (!chrome.commands || !chrome.commands.getAll) {
        loadSuggestedCommandShortcuts();
        return;
    }

    chrome.commands.getAll((commands) => {
        if (chrome.runtime.lastError) {
            loadSuggestedCommandShortcuts();
            return;
        }

        commands.forEach((command) => {
            const shortcutBadge = document.getElementById(`shortcut-${command.name}`);

            if (shortcutBadge) {
                shortcutBadge.textContent = command.shortcut || 'Set shortcut';
            }
        });
    });
}

function loadSuggestedCommandShortcuts() {
    const commands = chrome.runtime.getManifest().commands || {};

    Object.entries(commands).forEach(([commandName, command]) => {
        const shortcutBadge = document.getElementById(`shortcut-${commandName}`);

        if (shortcutBadge) {
            shortcutBadge.textContent = getSuggestedShortcut(command) || 'Set shortcut';
        }
    });
}

function getSuggestedShortcut(command) {
    const suggestedKey = command.suggested_key || {};

    if (navigator.platform && navigator.platform.toLowerCase().includes('win')) {
        return suggestedKey.windows || suggestedKey.default;
    }

    return suggestedKey.default;
}

loadCommandShortcuts();

document.getElementById('startBtn').addEventListener('click', async () => {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        // Check if we can inject script into this tab
        if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('moz-extension://')) {
            alert('Cannot read text from browser internal pages. Please navigate to a regular webpage.');
            return;
        }
        
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: getSelectedText,
        }, () => {
            if (chrome.runtime.lastError) {
                console.error('Script injection error:', chrome.runtime.lastError.message);
                alert('Error accessing page content. Make sure you have selected text on a regular webpage.');
            }
            // Close popup after a delay to ensure message is sent
            setTimeout(() => window.close(), 200);
        });
    } catch (error) {
        console.error('Error in start button handler:', error);
        alert('An error occurred. Please try again.');
    }
});

document.getElementById('stopBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'stop' }, (response) => {
        if (chrome.runtime.lastError) {
            console.error('Stop message error:', chrome.runtime.lastError.message);
        }
        // Close popup after a delay to ensure message is processed
        setTimeout(() => window.close(), 100);
    });
});

const toggleBtn = document.getElementById('toggleBtn');
toggleBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'toggle' }, (response) => {
        if (chrome.runtime.lastError) {
            console.error('Toggle message error:', chrome.runtime.lastError.message);
        } else if (response && response.success) {
            // Update button text based on response
            if (response.isPaused) {
                toggleBtn.textContent = 'Resume';
            } else {
                toggleBtn.textContent = 'Pause';
            }
            console.log('Toggle state:', response.isPaused ? 'Paused' : 'Playing');
        }
        // Close popup after showing the change
        setTimeout(() => window.close(), 500);
    });
});

// Speed slider
const speedSlider = document.getElementById('speedSlider');
const speedValue = document.getElementById('speedValue');

// Load initial rate from storage
chrome.storage.sync.get('speechRate', (result) => {
    const rate = result.speechRate || 1.0;
    speedSlider.value = rate;
    speedValue.textContent = rate.toFixed(1) + 'x';
});

speedSlider.addEventListener('input', () => {
    const value = parseFloat(speedSlider.value);
    speedValue.textContent = value.toFixed(1) + 'x';
    chrome.storage.sync.set({ speechRate: value });
});

// Get initial playback state
chrome.runtime.sendMessage({action: "getState"}, (response) => {
    if (chrome.runtime.lastError) {
        console.error('Get state error:', chrome.runtime.lastError.message);
        toggleBtn.textContent = 'Pause'; // Default state
    } else if (response && response.isPaused) {
        toggleBtn.textContent = 'Resume';
    } else {
        toggleBtn.textContent = 'Pause';
    }
});

// Function to get selected text from the page
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
        alert('No text selected! Please select some text on the webpage first.');
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
