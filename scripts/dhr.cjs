/**
 * dhrtest2 in-page fetch session. Password stays in DHR_PASSWORD, never in files.
 */
const { chromium } = require(require("path").join(process.env.TEMP, "node_modules", "playwright"));
const fs = require("fs");
const path = require("path");

const BASE = process.env.DHR_URL || "https://dhrtest2.d1-tech.com.tr";
const EMAIL = process.env.DHR_EMAIL || "arda.kocaoglu@d1-tech.com";
const ADMIN_PASS = process.env.DHR_PASSWORD;

function unwrap(r) {
  let x = r?.data ?? r;
  for (let i = 0; i < 6; i++) {
    if (x && typeof x === "object" && !Array.isArray(x) && "data" in x) x = x.data;
    else break;
  }
  return x;
}
function arr(x) {
  if (Array.isArray(x)) return x;
  if (x?.items) return x.items;
  if (x?.results) return x.results;
  return [];
}
function ok(r) {
  return r && r.status >= 200 && r.status < 300 && !(r.data?.statusCode >= 400) && !r.data?.error;
}
function errText(r) {
  const e = r?.data?.error || r?.data?.title;
  const msg =
    e?.message ||
    (Array.isArray(e?.errors) ? e.errors[0] : null) ||
    (typeof e === "string" ? e : null) ||
    r?.text;
  return String(msg || r?.status || "").slice(0, 400);
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function bindApi(page) {
  async function api(method, p, body) {
    const res = await page.evaluate(
      async ({ method, p, body }) => {
        await fetch("/api/antiforgery/token", { credentials: "include" }).catch(() => {});
        const m = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
        const token = m ? decodeURIComponent(m[1]) : "";
        const headers = { Accept: "application/json", "X-XSRF-TOKEN": token, "X-CSRF-TOKEN": token };
        if (body !== undefined) headers["Content-Type"] = "application/json";
        const res = await fetch(p, {
          method,
          credentials: "include",
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
        return { status: res.status, data, text: String(text).slice(0, 800) };
      },
      { method, p, body }
    );
    if ((res.status === 429 || /çok fazla|csrf/i.test(res.text || "")) && api._attempt !== 6) {
      api._attempt = (api._attempt || 0) + 1;
      await sleep(3000 * api._attempt);
      const out = await api(method, p, body);
      api._attempt = 0;
      return out;
    }
    api._attempt = 0;
    return res;
  }
  return api;
}

async function login(browser, email, password) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/login", { waitUntil: "commit", timeout: 60000 });
  await page.waitForSelector("#login_email", { timeout: 30000 });
  await page.fill("#login_email", email);
  await page.fill("#login_password", password);
  await page.locator("#login_password").press("Enter");
  for (let i = 0; i < 90 && page.url().includes("/login"); i++) await page.waitForTimeout(400);
  if (page.url().includes("/login")) {
    const err = await page.locator(".ant-alert, .ant-form-item-explain-error").allTextContents().catch(() => []);
    throw new Error("login fail " + email + " " + err.join(" | "));
  }
  const api = await bindApi(page);
  return { ctx, page, api };
}

async function openAdmin() {
  if (!ADMIN_PASS) throw new Error("DHR_PASSWORD required");
  const browser = await chromium.launch({ headless: true });
  const session = await login(browser, EMAIL, ADMIN_PASS);
  return { browser, page: session.page, api: session.api, ctx: session.ctx, BASE, EMAIL };
}

function writeJson(rel, data) {
  const full = path.join(__dirname, "..", rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(data, null, 2));
  return full;
}

module.exports = { openAdmin, login, unwrap, arr, ok, errText, sleep, writeJson, BASE, EMAIL };
