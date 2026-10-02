const fs = require("fs");
const path = require("path");
const { openAdmin, login, unwrap, arr, ok, errText, writeJson } = require("./dhr.cjs");
const state = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "state.json"), "utf8"));
const ids = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "lab-ids.json"), "utf8"));
const file = path.join(__dirname, "..", "data", "scenarios.json");
let scenarios = JSON.parse(fs.readFileSync(file, "utf8"));
function rec(id, title, pass, expected, actual, evidence) {
  const row = { id, title, pass: !!pass, expected: String(expected || ""), actual: String(actual || "").slice(0, 500), evidence: String(evidence || "").slice(0, 400) };
  const i = scenarios.findIndex((s) => s.id === id);
  if (i >= 0) scenarios[i] = row; else scenarios.push(row);
  console.log(pass ? "PASS" : "FAIL", id, String(actual || "").slice(0, 160));
}
function save() {
  fs.writeFileSync(file, JSON.stringify(scenarios, null, 2));
  fs.copyFileSync(file, path.join(__dirname, "..", "src", "data", "scenarios.json"));
}
async function call(api, m, p, b) {
  const r = await api(m, p, b);
  return { r, data: unwrap(r), good: ok(r), err: errText(r) };
}
(async () => {
  const admin = await openAdmin();
  const api = admin.api;
  const actions = arr(unwrap(await api("GET", `/api/TalentAction/list?periodId=${ids.periods.box}`)));
  const pending = actions.find((a) => a.actionStatus === 0) || actions[0];
  console.log("ACTION KEYS", pending && Object.keys(pending).join(","));
  console.log("ACTION", JSON.stringify(pending, null, 2).slice(0, 1200));
  const full = pending ? unwrap(await api("GET", `/api/TalentAction/${pending.id}`)) : null;
  console.log("FULL", JSON.stringify(full, null, 2).slice(0, 1500));

  const reviews = arr(unwrap(await api("GET", "/api/EmployeePerformanceReview/all")));
  const ada = Object.values(state.people).find((p) => p.email === "adakorkmaz@perf.com");
  const adaReview = reviews.find((r) => r.employeeId === ada.employeeId && r.performancePeriodId === ids.periods.p360);
  const reviewers = adaReview ? arr(unwrap(await api("GET", `/api/PerformanceReviewer/by-review/${adaReview.id}`))) : [];
  console.log("REVIEWERS", reviewers.map((r) => `${r.reviewerType}:${r.evaluatorEmployeeId || r.employeeId}:${r.id}`).join(" | "));

  const preview = await call(api, "POST", "/api/PerformancePeriod/scope-preview", {
    organizationalUnitId: state.units.p360.id,
    includeNewJoiners: true,
    scopes: [{ scopeType: 1, organizationalUnitId: state.units.p360.id, isExcluded: false }],
  });
  console.log("PREVIEW", preview.good, JSON.stringify(preview.data).slice(0, 500));

  const period = unwrap(await api("GET", `/api/PerformancePeriod/${ids.periods.pip}`));
  console.log("PIP PERIOD", period.periodStatus, period.resultReleaseMode, (period.stages || []).map((s) => s.stageType + ":" + (s.stageStatus ?? s.status)).join(","));

  save();
  await admin.browser.close();
})().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
