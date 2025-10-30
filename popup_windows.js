// popup.js
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
chrome.runtime.sendMessage({action: "get_state"}, (response) => {
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


