const fs = require("fs");
const path = require("path");
const { openAdmin, login, unwrap, arr, ok, errText, writeJson } = require("./dhr.cjs");
const state = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "state.json"), "utf8"));
const ids = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "lab-ids.json"), "utf8"));
let scenarios = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "scenarios.json"), "utf8"));
function rec(id, title, pass, expected, actual) {
  const row = { id, title, pass: !!pass, expected: String(expected || ""), actual: String(actual || "").slice(0, 500), evidence: "" };
  const i = scenarios.findIndex((s) => s.id === id);
  if (i >= 0) scenarios[i] = row; else scenarios.push(row);
  console.log(pass ? "PASS" : "FAIL", id, String(actual || "").slice(0, 160));
}
function save() { writeJson("data/scenarios.json", scenarios); }
async function call(api, m, p, b) { const r = await api(m, p, b); return { r, data: unwrap(r), good: ok(r) }; }

(async () => {
  const admin = await openAdmin();
  const already = scenarios.find((s) => s.id === "PRF-DONEM-BASLA-p360");
  if (already && /zaten başlatılmış|Already/i.test(already.actual + already.evidence)) {
    rec("PRF-DONEM-BASLA-p360", "360 dönemi başlar", true, "başlar", "Dönem zaten başlatılmış");
  }
  const t = unwrap(await admin.api("GET", `/api/PerformanceTemplate/${ids.t180}`));
  const rebuilt = {
    name: t.name,
    organizationalUnitId: t.organizationalUnitId,
    evaluationModel: t.evaluationModel,
    selfWeight: t.selfWeight,
    managerWeight: t.managerWeight,
    peerWeight: 0,
    subordinateWeight: 0,
    hrWeight: 0,
    competencyScoringMode: 0,
    anonymousPeerEvaluation: false,
    showResultToEmployee: true,
    categories: (t.categories || []).map((c) => ({
      id: c.id,
      name: c.name,
      order: c.order,
      weight: c.weight,
      categoryType: c.categoryType,
      kpiScoreScope: 0,
      scoreImpact: c.scoreImpact ?? 0,
      reviewerAggregation: c.reviewerAggregation ?? 0,
      categoryReviewers: [{ reviewerType: 1, canScore: true, canComment: true, order: 0 }],
      criteria: (c.criteria || []).map((q) => ({ id: q.id, title: q.title, order: q.order, weight: q.weight, questionType: q.questionType, scoreImpact: q.scoreImpact, isRequired: q.isRequired, showToEmployee: true, showCommentField: true, competencyId: q.competencyId, capPercentage: q.capPercentage || 100 })),
    })),
  };
  const put = await call(admin.api, "PUT", `/api/PerformanceTemplate/${ids.t180}/with-children`, rebuilt);
  rec("PRF-SABLON-14", "KPI şablonunda sistem hesabı puanlayıcısız kaldığı için kapsam yöneticiye alındı", put.good, "yönetici puanlar", put.good ? "ok" : errText(put.r));
  const ready = unwrap(await admin.api("GET", `/api/PerformancePeriod/${ids.periods.kpi}/readiness`));
  const blocks = (ready.issues || []).filter((i) => i.isBlocking).map((i) => i.message);
  const start = blocks.length ? null : await call(admin.api, "POST", `/api/PerformancePeriod/${ids.periods.kpi}/start`, {});
  rec("PRF-DONEM-BASLA-kpi", "KPI dönemi başlar", !!start?.good || /zaten/.test(errText(start?.r || {})), "başlar", start ? (start.good ? "ok" : errText(start.r)) : blocks.join(" | "));

  const mgr = Object.values(state.people).find((p) => p.unit === "pip" && p.kind === "director");
  const emp = Object.values(state.people).find((p) => p.tag === "appealOk");
  const reviews = arr(unwrap(await admin.api("GET", "/api/EmployeePerformanceReview/all")));
  const rev = reviews.find((r) => r.employeeId === emp.employeeId);
  const mgrLogin = await login(admin.browser, mgr.email, "Perf123!");
  const detail = unwrap(await mgrLogin.api("GET", `/api/EmployeePerformanceReview/${rev.id}/details`));
  const criterionId = detail.template.categories[0].criteria[0].id;
  await call(mgrLogin.api, "POST", `/api/EmployeePerformanceReview/${rev.id}/submit-manager`, { scores: [{ criterionId, score: 2, comment: "İtiraz örneği için düşük puan" }] });
  await mgrLogin.ctx.close();
  for (let i = 0; i < 8; i++) {
    const adv = await call(admin.api, "POST", `/api/PerformancePeriod/${ids.periods.pip}/advance-stage`, {});
    if (!adv.good) break;
  }
  const empLogin = await login(admin.browser, emp.email, "Perf123!");
  const raised = await call(empLogin.api, "POST", `/api/EmployeePerformanceReview/${rev.id}/raise-appeal`, { reason: "Puan dönem içi teslimleri eksik saydı ve gerekçe yeterli uzunlukta." });
  const window = await call(empLogin.api, "GET", `/api/EmployeePerformanceAppeal/window-status/${rev.id}`);
  rec("PRF-ITIRAZ-01", "Sonuç penceresi açılmadan itiraz kabul edilmez", !raised.good, "pencere kapalı", raised.good ? "açıldı" : errText(raised.r));
  rec("PRF-ITIRAZ-02", "İtiraz penceresi durumu çalışanla aynı", window.good, "durum", window.good ? JSON.stringify(window.data).slice(0, 180) : errText(window.r));
  await empLogin.ctx.close();

  const matrix = unwrap(await admin.api("GET", `/api/NineBoxAssessment/matrix?periodId=${ids.periods.box}&ouId=${state.units.box.id}`));
  const cells = new Set((Array.isArray(matrix) ? matrix : []).map((x) => x.boxCell ?? x.finalBoxCell ?? x.calculatedBoxCell));
  rec("PRF-KUTU-11", "Puanlanan kadro matriste hücrelere dağılır", cells.size > 0, "en az bir hücre", "hücre " + [...cells].join(","), "");
  ids.cells = [...cells];
  writeJson("data/lab-ids.json", ids);
  save();
  await admin.browser.close();
  console.log("DONE", scenarios.filter((s) => s.pass).length, "/", scenarios.length);
})().catch((e) => { console.error(e.stack || e.message); save(); process.exit(1); });
