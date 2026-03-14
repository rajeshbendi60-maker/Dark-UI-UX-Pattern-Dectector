// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const puppeteer = require("puppeteer");
const cheerio = require("cheerio");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = 3000;

app.use(express.static("public"));

// Normalize incoming options: remove spaces, lowercase keys
function normalizeOptions(raw = {}) {
  const defaults = {
    prechecked: true,
    confirmshaming: true,
    autorenew: true,
    scarcity: false,
    nagging: false,
    hiddenfees: false,
  };

  const normalized = {};
  Object.keys(raw || {}).forEach((k) => {
    const nk = String(k).replace(/\s+/g, "").toLowerCase();
    normalized[nk] = !!raw[k];
  });

  return { ...defaults, ...normalized };
}

// 🔍 Analyze website for dark patterns (robust)
async function analyzeWebsite(url, options = {}) {
  let score = 100;
  let issues = [];
  let browser;

  // normalize options for internal checks
  options = normalizeOptions(options);

  try {
    // ensure URL has protocol
    if (!/^https?:\/\//i.test(url)) {
      url = "http://" + url;
    }

    browser = await puppeteer.launch({
      headless: true,
      // add args if running in restricted environments:
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    // grab rendered page text
    const bodyText = (
      await page.evaluate(() => document.body.innerText || "")
    ).toLowerCase();

    // Use Cheerio for structure if needed
    const html = await page.content();
    const $ = cheerio.load(html);

    // 1. Pre-checked checkboxes
    if (options.prechecked) {
      const precheckedCount = await page.$$eval("input[type='checkbox']", (inputs) =>
        inputs.filter((i) => i.checked || i.hasAttribute("checked")).length
      );
      if (precheckedCount > 0) {
        issues.push(`⚠ Pre-checked checkbox(es) detected (${precheckedCount})`);
        score -= 15 * precheckedCount;
      }
    }

    // 2. Confirmshaming
    if (options.confirmshaming) {
      const confirmshamingPatterns = [
        "no thanks",
        "i don’t want",
        "i don't want",
        "skip this deal",
        "not interested",
        "i’ll miss out",
        "i'll miss out",
      ];
      confirmshamingPatterns.forEach((pattern) => {
        if (bodyText.includes(pattern)) {
          issues.push(`⚠ Confirmshaming phrase found: "${pattern}"`);
          score -= 20;
        }
      });
    }

    // 3. Auto-renew / forced continuity
    if (options.autorenew) {
      const autoRenewPatterns = [
        "auto-renew",
        "automatically renews",
        "billed monthly",
        "cancel anytime",
        "subscription will continue",
        "trial will convert",
      ];
      autoRenewPatterns.forEach((pattern) => {
        if (bodyText.includes(pattern)) {
          issues.push(`⚠ Forced continuity language: "${pattern}"`);
          score -= 20;
        }
      });
    }

    // 4. Scarcity tactics
    if (options.scarcity) {
      const scarcityRegexes = [
        /only\s+\d+\s+left/i,
        /selling fast/i,
        /limited stock/i,
        /\bhurry\b/i,
        /ends (soon|in \d+)/i,
      ];
      scarcityRegexes.forEach((rx) => {
        if (rx.test(bodyText)) {
          issues.push(`⚠ Scarcity tactic detected (${rx})`);
          score -= 15;
        }
      });
    }

    // 5. Nagging popups
    if (options.nagging) {
      const popupCount = await page.$$eval(
        "div[class*='popup'], div[class*='modal'], [role='dialog'], .modal, .popup",
        (els) => els.length
      );
      if (popupCount > 0) {
        issues.push(`⚠ Possible nagging popup/modal detected (${popupCount})`);
        score -= 10;
      }
    }

    // 6. Hidden fees
    if (options.hiddenfees) {
      const feePatterns = [
        "additional fees apply",
        "excluding tax",
        "plus fees",
        "shipping not included",
        "additional cost",
        "processing fee",
      ];
      feePatterns.forEach((pattern) => {
        if (bodyText.includes(pattern)) {
          issues.push(`⚠ Possible hidden fee language: "${pattern}"`);
          score -= 15;
        }
      });
    }

    if (score < 0) score = 0;
  } catch (err) {
    console.error("❌ Error analyzing site:", err && err.message ? err.message : err);
    issues = issues || [];
    issues.push("❌ Failed to fetch or analyze site (blocked or invalid URL)");
    score = 0;
  } finally {
    if (browser) await browser.close();
  }

  if (!Array.isArray(issues)) issues = [];

  return { score, issues, timestamp: new Date().toLocaleTimeString() };
}

// 🔄 Real-time WebSocket communication
io.on("connection", (socket) => {
  console.log("🔌 New client connected");
  let monitorInterval = null;

  socket.on("startMonitoring", (payload) => {
    let url;
    let options = {};
    if (typeof payload === "string") {
      url = payload;
    } else if (payload && typeof payload === "object") {
      url = payload.url || "";
      options = payload.options || {};
    }

    if (!url) {
      socket.emit("update", {
        score: 0,
        issues: ["❌ No URL provided to start monitoring"],
        timestamp: new Date().toLocaleTimeString(),
      });
      return;
    }

    console.log(`📡 Monitoring started for: ${url} (options: ${JSON.stringify(options)})`);

    if (monitorInterval) clearInterval(monitorInterval);

    const runCheck = async () => {
      const results = await analyzeWebsite(url, options);
      socket.emit("update", results);
    };

    runCheck();
    monitorInterval = setInterval(runCheck, 20000);
  });

  socket.on("stopMonitoring", () => {
    if (monitorInterval) {
      clearInterval(monitorInterval);
      monitorInterval = null;
      socket.emit("update", {
        score: 0,
        issues: ["ℹ Monitoring stopped"],
        timestamp: new Date().toLocaleTimeString(),
      });
      console.log("🛑 Monitoring stopped by client");
    }
  });

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected");
    if (monitorInterval) {
      clearInterval(monitorInterval);
      monitorInterval = null;
    }
  });
});

server.listen(PORT, () => {
  console.log(`✅ Real-time server running at http://localhost:${PORT}`);
});
