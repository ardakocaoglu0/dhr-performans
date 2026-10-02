const { chromium } = require(require("path").join(process.env.TEMP, "node_modules", "playwright"));
const fs = require("fs");
const path = require("path");
(async () => {
  const state = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "state.json"), "utf8"));
  const emp = Object.values(state.people).find((p) => p.unit === "miras" && p.kind === "ic");
  const mgr = Object.values(state.people).find((p) => p.unit === "miras" && p.kind === "director");
  const browser = await chromium.launch({ headless: true });
  const notes = [];
  async function look(email, route) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("https://dhrtest2.d1-tech.com.tr/login", { waitUntil: "commit" });
    await page.fill("#login_email", email);
    await page.fill("#login_password", "Perf123!");
    await page.locator("#login_password").press("Enter");
    for (let i = 0; i < 40 && page.url().includes("/login"); i++) await page.waitForTimeout(300);
    await page.goto("https://dhrtest2.d1-tech.com.tr" + route, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const text = await page.locator("body").innerText();
    notes.push({ email, route, url: page.url(), hasPerf: /performans|Performance|Hedef|Değerlendirme/i.test(text), snippet: text.replace(/\s+/g, " ").slice(0, 280) });
    await ctx.close();
  }
  await look(emp.email, "/my-performances");
  await look(mgr.email, "/performance-management");
  fs.writeFileSync(path.join(__dirname, "..", "data", "ui.json"), JSON.stringify(notes, null, 2));
  console.log(JSON.stringify(notes, null, 2));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
