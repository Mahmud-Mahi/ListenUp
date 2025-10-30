// content.js - Handles word highlighting on web pages
console.log('🚀 Content script LOADED successfully');

let highlightedElement = null;
let originalText = '';
let isTracking = false;
let selectedRange = null;
let originalSelection = null;

console.log('Content script initialized');

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
        console.log('🎧 Content script received message:', message.type, message);

        if (message.type === 'PING') {
        sendResponse({ success: true, available: true });
    } else if (message.type === 'WORD_HIGHLIGHT') {
        console.log('Received WORD_HIGHLIGHT message:', message);
        highlightWord(message.charIndex, message.charLength, message.text);
        sendResponse({ success: true });
    } else if (message.type === 'CLEAR_HIGHLIGHT') {
        clearHighlight();
        sendResponse({ success: true });
    } else if (message.type === 'START_TRACKING') {
        console.log('START_TRACKING received with text length:', message.text ? message.text.length : 'null');
        startTracking(message.text);
        sendResponse({ success: true });
    } else if (message.type === 'STOP_TRACKING') {
        stopTracking();
        sendResponse({ success: true });
    } else if (message.type === 'TEST_HIGHLIGHT') {
        console.log('TEST_HIGHLIGHT received - testing highlighting');
        testHighlight();
        sendResponse({ success: true });
    }
    } catch (error) {
        console.error('❌ Error in content script message listener:', error);
        sendResponse({ success: false, error: error.message });
    }
    return true; // Keep message channel open
});

function startTracking(text) {
    console.log('Starting tracking for text:', text.substring(0, 50) + '...');

    // Text is already normalized in popup.js
    originalText = text;

    console.log('Using normalized text:', originalText.substring(0, 50) + '...');
    isTracking = true;

    // Store the current selection for initial highlighting
    const selection = window.getSelection();
    console.log('Current selection:', selection);
    console.log('Selection range count:', selection.rangeCount);

    if (selection.rangeCount > 0) {
        originalSelection = selection.getRangeAt(0).cloneRange();
        selectedRange = originalSelection.cloneRange();
        console.log('Original selection stored:', originalSelection.toString());
        console.log('Selected range stored:', selectedRange.toString());

        // Highlight the entire selected text initially
        highlightInitialSelection();
    } else {
        console.log('No selection range found - will use document search');
    }

    clearHighlight();
}

function highlightInitialSelection() {
    if (!selectedRange) return;

    try {
        const selectedText = selectedRange.toString();
        if (!selectedText.trim()) {
            console.log('No text in selection to highlight');
            return;
        }

        console.log('Highlighting initial selection:', selectedText.substring(0, 50) + '...');

        // Use text node splitting approach for initial selection
        const startContainer = selectedRange.startContainer;
        const endContainer = selectedRange.endContainer;
        const startOffset = selectedRange.startOffset;
        const endOffset = selectedRange.endOffset;

        if (startContainer === endContainer && startContainer.nodeType === Node.TEXT_NODE) {
            // Simple case: selection within a single text node
            const text = startContainer.textContent;
            const beforeText = text.substring(0, startOffset);
            const selectedTextContent = text.substring(startOffset, endOffset);
            const afterText = text.substring(endOffset);

            const parent = startContainer.parentNode;

            // Replace the text node
            parent.removeChild(startContainer);

            if (beforeText) {
                parent.appendChild(document.createTextNode(beforeText));
            }

            const highlightElement = document.createElement('span');
            highlightElement.style.backgroundColor = '#e3f2fd';
            highlightElement.style.color = '#000000';
            highlightElement.style.borderRadius = '3px';
            highlightElement.style.padding = '2px 4px';
            highlightElement.style.boxShadow = '0 0 0 1px #2196f3 inset';
            highlightElement.setAttribute('data-tts-selection-highlight', 'true');
            highlightElement.textContent = selectedTextContent;
            parent.appendChild(highlightElement);

            if (afterText) {
                parent.appendChild(document.createTextNode(afterText));
            }

            console.log('Initial selection highlighted successfully');
        } else {
            console.log('Complex selection spanning multiple elements - skipping initial highlight');
        }
    } catch (error) {
        console.error('Error highlighting initial selection:', error);
    }
}

function stopTracking() {
    console.log('Stopping tracking');
    isTracking = false;
    clearHighlight();
    originalSelection = null;
    selectedRange = null;
}

function highlightWord(charIndex, charLength, speechText) {
    console.log(`🎯 CONTENT: Highlighting at index ${charIndex}, length ${charLength}`);

    if (!isTracking || !originalText) {
        console.log('⚠️ Not tracking or no original text');
        return;
    }

    // Clear previous word highlight
    clearHighlight();

    // Use the boundary event data directly to find and highlight the text
    if (selectedRange) {
        highlightInSelection(charIndex, charLength);
    } else {
        highlightInDocument(charIndex, charLength);
    }
}

function getWordAtPosition(charIndex, charLength) {
    if (charIndex >= 0 && charIndex < originalText.length) {
        return originalText.substring(charIndex, charIndex + charLength).trim();
    }
    return null;
}

function highlightInSelection(charIndex, charLength) {
    if (!selectedRange) return;

    try {
        // Find the text node and position within the selection
        const textNodes = getTextNodesInRange(selectedRange);
        let accumulatedLength = 0;
        let targetNode = null;
        let localOffset = 0;

        for (const node of textNodes) {
            const nodeLength = node.textContent.length;
            if (accumulatedLength + nodeLength > charIndex) {
                targetNode = node;
                localOffset = charIndex - accumulatedLength;
                break;
            }
            accumulatedLength += nodeLength;
        }

        if (targetNode && localOffset >= 0) {
            const endOffset = Math.min(localOffset + charLength, targetNode.textContent.length);
            const textToHighlight = targetNode.textContent.substring(localOffset, endOffset);

            if (textToHighlight.trim()) {
                // Create highlight element
                const range = document.createRange();
                range.setStart(targetNode, localOffset);
                range.setEnd(targetNode, endOffset);

                const highlightedElement = document.createElement('span');
                highlightedElement.style.backgroundColor = '#ff6b35';
                highlightedElement.style.color = '#ffffff';
                highlightedElement.style.borderRadius = '3px';
                highlightedElement.style.padding = '2px 3px';
                highlightedElement.style.fontWeight = 'bold';
                highlightedElement.setAttribute('data-tts-highlight', 'true');

                range.surroundContents(highlightedElement);

                // Scroll to highlighted word
                highlightedElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                    inline: 'nearest'
                });

                console.log('Highlighted in selection:', textToHighlight);
            }
        }
    } catch (error) {
        console.error('Error highlighting in selection:', error);
    }
}

function highlightInDocument(charIndex, charLength) {
    try {
        // Get the text to find from our normalized original text
        const textToFind = originalText.substring(charIndex, charIndex + charLength).trim();
        console.log('🔍 Searching for text:', JSON.stringify(textToFind), 'at index', charIndex);
        console.log('📄 Original text around index:', JSON.stringify(originalText.substring(Math.max(0, charIndex-10), charIndex + charLength + 10)));

        if (!textToFind) return;

        // Search in document
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        let node;
        let nodeCount = 0;
        while (node = walker.nextNode()) {
            nodeCount++;
            const text = node.textContent;
            const index = text.indexOf(textToFind);

            if (index !== -1) {
                console.log('✅ Found text in DOM node', nodeCount, '- DOM text around match:', JSON.stringify(text.substring(Math.max(0, index-10), index + textToFind.length + 10)));
                try {
                    const range = document.createRange();
                    range.setStart(node, index);
                    range.setEnd(node, index + textToFind.length);

                    highlightedElement = document.createElement('span');
                    highlightedElement.style.backgroundColor = '#ff6b35';
                    highlightedElement.style.color = '#ffffff';
                    highlightedElement.style.borderRadius = '3px';
                    highlightedElement.style.padding = '2px 3px';
                    highlightedElement.style.fontWeight = 'bold';
                    highlightedElement.setAttribute('data-tts-highlight', 'true');

                    range.surroundContents(highlightedElement);

                    // Scroll to highlighted word
                    highlightedElement.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center',
                        inline: 'nearest'
                    });

                    console.log('✅ Highlighted in document:', textToFind);
                    return;
                } catch (error) {
                    console.error('❌ Error in document highlighting:', error);
                }
            }
        }

        console.log('❌ Text not found in document after checking', nodeCount, 'nodes:', JSON.stringify(textToFind));
    } catch (error) {
        console.error('❌ Error highlighting in document:', error);
    }
}

function getTextNodesInRange(range) {
    const textNodes = [];
    const walker = document.createTreeWalker(
        range.commonAncestorContainer,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: function(node) {
                if (range.intersectsNode(node)) {
                    return NodeFilter.FILTER_ACCEPT;
                }
                return NodeFilter.FILTER_REJECT;
            }
        },
        false
    );

    let node;
    while (node = walker.nextNode()) {
        textNodes.push(node);
    }
    return textNodes;
}

function clearHighlight() {
    // Only clear word highlights
    const existingHighlights = document.querySelectorAll('[data-tts-highlight="true"]');
    existingHighlights.forEach(element => {
        const parent = element.parentNode;
        if (parent) {
            // Move all child nodes before the highlight element
            while (element.firstChild) {
                parent.insertBefore(element.firstChild, element);
            }
            // Remove the highlight element
            parent.removeChild(element);
            // Normalize the text nodes
            parent.normalize();
        }
    });

    if (highlightedElement) {
        highlightedElement = null;
    }
}

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    clearHighlight();
});
