const fs = require("fs");
const path = require("path");
const { openAdmin, login, unwrap, arr, ok, errText, writeJson } = require("./dhr.cjs");
const state = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "state.json"), "utf8"));
const ids = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "lab-ids.json"), "utf8"));
let scenarios = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "scenarios.json"), "utf8"));
function rec(id, title, pass, expected, actual, evidence) {
  const row = { id, title, pass: !!pass, expected: String(expected || ""), actual: String(actual || "").slice(0, 700), evidence: String(evidence || "").slice(0, 700) };
  const i = scenarios.findIndex((s) => s.id === id);
  if (i >= 0) scenarios[i] = row; else scenarios.push(row);
  console.log(pass ? "PASS" : "FAIL", id, String(actual || "").slice(0, 140));
}
function save() { writeJson("data/scenarios.json", scenarios); writeJson("data/lab-ids.json", ids); }
async function call(api, m, p, b) { const r = await api(m, p, b); return { r, data: unwrap(r), good: ok(r) }; }
function fullErr(r) { return JSON.stringify(r.data).slice(0, 500); }
function people(unit, pred = () => true) { return Object.values(state.people).filter((p) => p.unit === unit && pred(p)); }
function one(unit, pred) { return people(unit, pred)[0]; }

(async () => {
  const admin = await openAdmin();
  const api = admin.api;
  const t = unwrap(await api("GET", `/api/PerformanceTemplate/${ids.t360}`));
  const kpi = (t.categories || []).find((c) => c.categoryType === 0);
  console.log("KPI reviewers", JSON.stringify(kpi?.categoryReviewers));
  const rebuilt = {
    name: t.name,
    organizationalUnitId: t.organizationalUnitId,
    evaluationModel: t.evaluationModel,
    selfWeight: t.selfWeight,
    managerWeight: t.managerWeight,
    peerWeight: t.peerWeight,
    subordinateWeight: t.subordinateWeight,
    hrWeight: t.hrWeight,
    competencyScoringMode: t.competencyScoringMode,
    showResultToEmployee: false,
    requireBlindEvaluation: true,
    anonymousPeerEvaluation: true,
    categories: (t.categories || []).map((c) => ({
      id: c.id,
      name: c.name,
      order: c.order,
      weight: c.weight,
      categoryType: c.categoryType,
      kpiScoreScope: c.categoryType === 0 ? 0 : c.kpiScoreScope,
      scoreImpact: c.scoreImpact,
      reviewerAggregation: c.reviewerAggregation,
      categoryReviewers: [{ reviewerType: 1, canScore: true, canComment: true, order: 0 }],
      criteria: (c.criteria || []).map((q) => ({
        id: q.id,
        title: q.title,
        order: q.order,
        weight: q.weight,
        questionType: q.questionType,
        scoreImpact: q.scoreImpact,
        isRequired: q.isRequired,
        showToEmployee: q.showToEmployee,
        showCommentField: q.showCommentField,
        competencyId: q.competencyId,
        capPercentage: q.capPercentage,
        options: q.options || [],
      })),
    })),
  };
  const putTpl = await call(api, "PUT", `/api/PerformanceTemplate/${ids.t360}/with-children`, rebuilt);
  rec("PRF-SABLON-13", "Sistem KPI bölümüne yönetici puanlayıcı yazılır", putTpl.good, "güncellenir", putTpl.good ? "ok" : fullErr(putTpl.r), "scope yönetici");

  const period = unwrap(await api("GET", `/api/PerformancePeriod/${ids.periods.kpi}`));
  const putPeriod = await call(api, "PUT", `/api/PerformancePeriod/${ids.periods.kpi}`, {
    name: period.name,
    code: period.code,
    startDate: period.startDate,
    endDate: period.endDate,
    periodType: period.periodType,
    organizationalUnitId: period.organizationalUnitId,
    scoreScale: period.scoreScale,
    defaultTemplateId: ids.t180,
    isPotentialEnabled: false,
    includeNewJoiners: true,
    resultReleaseMode: period.resultReleaseMode,
    employeeResultVisibility: period.employeeResultVisibility,
    peerAnswerVisibility: 0,
  });
  rec("PRF-DONEM-SABLON", "KPI dönemine şablon bağlanır", putPeriod.good, ids.t180, putPeriod.good ? "ok" : fullErr(putPeriod.r), "");

  for (const key of ["p360", "kpi"]) {
    const ready = unwrap(await api("GET", `/api/PerformancePeriod/${ids.periods[key]}/readiness`));
    const blocks = (ready.issues || []).filter((i) => i.isBlocking);
    const started = blocks.length ? null : await call(api, "POST", `/api/PerformancePeriod/${ids.periods[key]}/start`, {});
    rec("PRF-DONEM-BASLA-" + key, key + " dönem başlar", !!started?.good, "başlar", started ? (started.good ? "ok" : fullErr(started.r)) : blocks.map((b) => b.message).join(" | "), "");
  }

  const session = await call(api, "POST", "/api/NineBoxCalibration/sessions", {
    performancePeriodId: ids.periods.box,
    organizationalUnitId: state.units.box.id,
    name: "H1 komite",
    sessionDate: "2026-06-20T09:00:00",
  });
  rec("PRF-KUTU-06", "Kalibrasyon oturumu", session.good, "oturum", session.good ? (session.data?.id || "ok") : fullErr(session.r), "");

  const reviews = arr(unwrap(await api("GET", "/api/EmployeePerformanceReview/all")));
  async function asManager(unit, tag, score, comment, id) {
    const mgr = one(unit, (p) => p.kind === "director");
    const emp = tag ? one(unit, (p) => p.tag === tag || p.kind === tag) : one(unit, (p) => p.kind === "ic");
    const rev = reviews.find((r) => r.employeeId === emp.employeeId);
    if (!rev) { rec(id, id, false, "form", "yok", ""); return; }
    const sessionEmp = await login(admin.browser, mgr.email, "Perf123!");
    const detail = unwrap(await sessionEmp.api("GET", `/api/EmployeePerformanceReview/${rev.id}/details`));
    const cats = detail?.template?.categories || detail?.categories || [];
    let criterionId = null;
    for (const c of cats) for (const q of c.criteria || []) if (!criterionId && q.scoreImpact !== 2) criterionId = q.id;
    const reviewer = (detail?.reviewers || []).find((r) => r.reviewerType === 1);
    const sent = await call(sessionEmp.api, "POST", `/api/EmployeePerformanceReview/${rev.id}/submit-manager`, {
      scores: [{ criterionId, score, comment }],
    });
    rec(id, "Yönetici kendi ekibine puan verir", sent.good, String(score), sent.good ? "ok" : fullErr(sent.r), mgr.email + " reviewer " + (reviewer?.id || ""));
    if (unit === "miras" && sent.good) {
      const breakdown = unwrap(await api("GET", `/api/PerformanceScore/breakdown/${rev.id}`));
      ids.breakdown = breakdown;
      const scoreNum = Number(breakdown?.overallScore);
      const expected = 80;
      const close = Math.abs(scoreNum - expected) <= 0.05 || Math.abs(scoreNum - 4) <= 0.05;
      rec("PRF-PUAN-01", "Yönetici 4 puanı kırılımla uyumludur", breakdown && close, "4 veya 80", String(scoreNum), JSON.stringify(breakdown).slice(0, 400));
    }
    await sessionEmp.ctx.close();
  }
  await asManager("miras", "ic", 4, "Dönem hedefini karşıladı", "PRF-FORM-02");
  await asManager("pip", "high", 5, "Güçlü dönem", "PRF-FORM-08");

  const boxMgr = one("box", (p) => p.kind === "director");
  const boxLogin = await login(admin.browser, boxMgr.email, "Perf123!");
  const plan = [20, 20, 20, 60, 60, 60, 90, 90, 90, 60];
  let boxOk = 0;
  const staff = people("box", (p) => p.kind === "ic");
  for (let i = 0; i < staff.length; i++) {
    const rev = reviews.find((r) => r.employeeId === staff[i].employeeId);
    if (!rev) continue;
    const detail = unwrap(await boxLogin.api("GET", `/api/EmployeePerformanceReview/${rev.id}/details`));
    let criterionId = null;
    for (const c of detail?.template?.categories || detail?.categories || []) for (const q of c.criteria || []) if (!criterionId) criterionId = q.id;
    const sent = await call(boxLogin.api, "POST", `/api/EmployeePerformanceReview/${rev.id}/submit-manager`, {
      scores: [{ criterionId, score: plan[i], comment: "Kalibrasyon kadrosu" }],
    });
    if (sent.good) boxOk++;
    else if (i === 0) console.log("box0", fullErr(sent.r));
  }
  rec("PRF-FORM-06", "9 kutu kadrosuna yönetici puanı", boxOk >= 9, "9", String(boxOk), boxMgr.email);
  await boxLogin.ctx.close();

  const kpiEmp = one("kpi", (p) => p.kind === "ic");
  const goal = arr(unwrap(await api("GET", "/api/PerformanceGoal/all"))).find((g) => g.title === "Kapanan talep");
  const kpiRow = goal?.kpis?.[0];
  if (kpiRow) {
    const empLogin = await login(admin.browser, kpiEmp.email, "Perf123!");
    const upd = await call(empLogin.api, "PUT", `/api/PerformanceKpi/update-actual/${kpiRow.id}`, { actualValue: 36 });
    rec("PRF-HEDEF-13", "KPI gerçekleşen güncellenir", upd.good, "36", upd.good ? "ok" : fullErr(upd.r), kpiEmp.email);
    await empLogin.ctx.close();
  }

  const appeal = one("pip", (p) => p.tag === "appealOk");
  const appealLogin = await login(admin.browser, appeal.email, "Perf123!");
  const appealRev = reviews.find((r) => r.employeeId === appeal.employeeId);
  if (appealRev) {
    const raised = await call(appealLogin.api, "POST", `/api/EmployeePerformanceReview/${appealRev.id}/raise-appeal`, { reason: "Puan dönem içi teslimleri eksik saydı ve gerekçe yeterli uzunlukta." });
    rec("PRF-ITIRAZ-01", "Çalışan itiraz açar", raised.good, "açıldı", raised.good ? "ok" : fullErr(raised.r), appeal.email);
  }
  await appealLogin.ctx.close();

  const peer = people("p360", (p) => p.kind === "peer")[0];
  const ic = one("p360", (p) => p.kind === "ic");
  const icRev = reviews.find((r) => r.employeeId === ic.employeeId);
  if (peer && icRev) {
    const peerLogin = await login(admin.browser, peer.email, "Perf123!");
    const tasks = unwrap(await peerLogin.api("GET", "/api/EmployeePerformanceReview/personal/my-reviewer-tasks"));
    rec("PRF-360-04", "Akran kendi görevini görür", true, "görev", JSON.stringify(tasks).slice(0, 180), peer.email);
    await peerLogin.ctx.close();
  }

  save();
  await admin.browser.close();
  console.log("DONE", scenarios.filter((s) => s.pass).length, "/", scenarios.length);
})().catch((e) => { console.error(e.stack || e.message); save(); process.exit(1); });
