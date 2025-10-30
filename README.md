# ListenUp - Text to Speech Reader 🎧
A Lightweight web-browser extension to read any selected text or AI chat into natural sounding audio with real-time word highlighting. Perfect for reading articles, documentation, and long conversations hands-free.

## ✨ Features

- 🎯 **Instant Text-to-Speech** - Convert selected text to speech with one click
- 🎨 **Word-by-Word Highlighting** - Visual tracking as words are spoken
- ⚡ **Lightning Fast** - No delays, works completely offline
- 🎛️ **Smart Controls** - Play, pause, stop with intuitive shortcuts
- 🌐 **Universal Compatibility** - Works on articles, chats, PDFs, and more
- 🆓 **Completely Free** - No subscriptions, no limits, no tracking

## 🚀 Installation

1. Download the latest `zip` file for Windows & `tar.gz` file for Linux from the `releases` section.
2. Extract the zip file in your convenient location.
3. Open Chrome and go to `chrome://extensions/`
4. Enable **"Developer mode"** in the top right
5. Click **"Load unpacked"** and select the extension folder
6. The ListenUp icon will appear in your toolbar

## 🎯 How to Use

### Method 1: Right-Click Menu
1. Select any text on any webpage
2. Right-click and choose **"Read Selected Text"**
3. Sit back and listen!

### Method 2: Keyboard Shortcuts
- `ctrl + Shift + S` - Read selected text
- `Alt + X` - Pause/Resume reading  
- `Ctrl + Shift + X` - Stop reading

### Method 3: Popup Controls
1. Click the ListenUp icon in your toolbar
2. Use the control buttons:
   - **Start Reading** - Read selected text
   - **Pause/Resume** - Toggle playback
   - **Stop** - Stop reading
   - **Speed Slider** - Adjust speech rate (0.5x to 2.0x)

## 🛠️ Technical Details

### Architecture
- **Background Script** - Manages extension state and messaging
- **Content Script** - Handles text selection and highlighting
- **Offscreen Document** - Processes text-to-speech audio
- **Popup Interface** - Provides user controls and settings

### Technologies Used
- Chrome Extension Manifest V3
- Web Speech API (built-in browser TTS)
- Vanilla JavaScript (no frameworks)
- CSS3 with smooth animations

### Permissions
- `activeTab` - Access currently active tab for text selection
- `scripting` - Inject highlighting functionality
- `offscreen` - Audio playback for text-to-speech
- `storage` - Remember user settings locally

## 📁 Project Structure

```
listenup-tts/
├── manifest.json          # Extension configuration
├── background.js          # Background service worker
├── content.js            # Content script for highlighting
├── content.css           # Highlighting styles
├── offscreen.js          # Text-to-speech processing
├── offscreen.htm         # Offscreen document
├── popup.html            # Popup interface
├── popup.js              # Popup functionality
└── icons/                # Extension icons
    ├── icon-16.png
    ├── icon-48.png
    └── icon-128.png
```

## 🔧 Development

### Prerequisites
- Chrome Browser (version 88+)
- Basic knowledge of JavaScript and Chrome Extensions

### Building from Source
1. Clone the repository:
   ```bash
   git clone https://github.com/Mahmud-Mahi/ListenUp.git
   cd ListenUp
   ```

2. Load in Chrome:
   - Go to `chrome://extensions/`
   - Enable Developer Mode
   - Click "Load unpacked" and select the project folder

### File Descriptions
- `manifest.json` - Extension metadata and permissions
- `background.js` - Core extension logic and message handling
- `content.js` - DOM manipulation for text highlighting
- `offscreen.js` - Web Speech API integration
- `popup.js` - User interface controls

## 🌟 Use Cases

### 🎓 For Students
- Listen to research papers and articles
- Proofread essays by hearing them read aloud
- Study while multitasking

### 💼 For Professionals
- Consume long articles during commute
- Listen to documentation while coding
- Review emails and reports hands-free

### 👁️ For Accessibility
- Help users with visual impairments
- Support those with reading difficulties
- Provide alternative content consumption

## 🤝 Contributing

We welcome contributions! Please feel free to submit pull requests, report bugs, or suggest new features.

### Development Setup
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔒 Privacy

**ListenUp respects your privacy:**
- ✅ No data collection
- ✅ No tracking
- ✅ No external servers
- ✅ All processing happens locally
- ✅ Your text never leaves your device

## 🐛 Troubleshooting

### Common Issues

**Speech not working?**
- Ensure your system has text-to-speech capabilities
- Check if audio is not muted
- Try selecting different text

**Highlighting not appearing?**
- Some websites restrict DOM modification
- Try on different websites to test

**Extension not loading?**
- Verify Chrome is updated to version 88+
- Check Developer Mode is enabled
- Ensure all files are in the correct structure

### Getting Help
- Create an [Issue](https://github.com/Mahmud-Mahi/ListenUp/issues)
- Check existing issues for solutions
- Describe your problem with steps to reproduce

---

<div align="center">

**Give your eyes a break. Let ListenUp do the reading.** 🎧

⭐ Star this repo if you find it useful!

</div>
