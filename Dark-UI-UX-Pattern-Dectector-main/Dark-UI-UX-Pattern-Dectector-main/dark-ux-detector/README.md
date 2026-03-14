# Dark UX Detector 🔎⚠️

## 🚀 What is this?
A Chrome extension that detects shady/dark UX patterns on websites (like pre-checked boxes, hidden cancel links, tiny disclaimers, vague CTAs, auto-renew text).  
It highlights them directly on the page and lists them in a popup so users and judges can see what’s wrong.

---

## 🛠 Installation (Developer Mode)
1. Download or clone this project.
2. Open Chrome and go to: `chrome://extensions/`
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked**.
5. Select this folder (`dark-ux-detector`).
6. The extension icon will appear in your toolbar.

---

## 👩‍💻 How to Use
- Visit any website (like a signup/checkout form).
- The extension will:
  - Scan for dark patterns.
  - Highlight them in pink with small badges.
  - Show a floating panel with findings.
- Click the extension icon in the toolbar:
  - See a summary of findings in the popup.
  - Use **Rescan page** to check again.
  - Use **Clear history** to reset stored results.

---

## 🎨 Team Workflow
- **Person A (Core Developer)** → builds detection logic (content.js, content.css, background.js).
- **Person B (UI/UX Developer)** → builds popup interface, icons, branding, README, pitch deck.

---

## 📊 Hackathon Pitch Deck (for judges)
- Problem → Dark UX patterns trick users.
- Solution → This extension flags them live.
- Demo → Show highlights + popup.
- Impact → Awareness, ethical UX, trust.
- Next steps → More heuristics, ML-based detection, reporting.

---

## ⚠️ Notes
- This is a hackathon demo → heuristics are basic, so false positives may happen.
- To focus only on certain sites, edit `manifest.json` → `"host_permissions"`.

---

## 📷 Screenshots (optional)
_Add screenshots of your popup and detection highlights here to impress judges!_
