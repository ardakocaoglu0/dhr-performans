const fs = require("fs");
const path = require("path");
const { openAdmin, login, unwrap, arr, ok, errText } = require("./dhr.cjs");
const state = require("../data/state.json");
const ids = require("../data/lab-ids.json");
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
  return { data: unwrap(r), good: ok(r), err: errText(r), status: r.status, raw: r.data };
}

(async () => {
  const admin = await openAdmin();
  const api = admin.api;
  const tpl = unwrap(await api("GET", `/api/PerformanceTemplate/${ids.t360}`));
  rec("PRF-AYAR-04", "Sonuç kapalıyken şablon itiraz günü sıfırlanır", tpl.showResultToEmployee === false && Number(tpl.appealPeriodDays) === 0, "şablonda 0", `şablon show=${tpl.showResultToEmployee} appeal=${tpl.appealPeriodDays}`, "birim varsayılanı 7 kalır, skora girmez");

  const cals = arr(unwrap(await api("GET", `/api/PerformanceCalibration/by-period/${ids.periods.box}`)));
  const fin = cals.find((c) => c.adjustmentsCount > 0) || cals.find((c) => c.calibrationStatus === 2);
  if (fin) {
    const d = unwrap(await api("GET", `/api/PerformanceCalibration/${fin.id}/details`));
    console.log("CAL KEYS", Object.keys(d || {}));
    const adjs = d.adjustments || d.reviews || [];
    console.log("ADJ0", JSON.stringify(adjs[0] || d).slice(0, 500));
    const reviewId = adjs[0]?.employeePerformanceReviewId;
    if (reviewId) {
      const bd = unwrap(await api("GET", `/api/PerformanceScore/breakdown/${reviewId}`));
      const review = arr(unwrap(await api("GET", "/api/EmployeePerformanceReview/all"))).find((r) => r.id === reviewId);
      rec("PRF-KAL-05", "Kesinleşen kalibrasyon puanı genel skora yazılır", Number(bd?.overallScore) === Number(adjs[0].adjustedScore) || Number(review?.overallScore) === Number(adjs[0].adjustedScore), String(adjs[0].adjustedScore), `skor ${review?.overallScore} kırılım ${bd?.overallScore} düzeltme ${adjs[0].adjustedScore}`, "");
    }
  }

  const jale = Object.values(state.people).find((p) => p.email === "jalekaya@perf.com");
  const pos = unwrap(await api("GET", `/api/OrganizationalUnitPosition/${jale.positionId}`));
  console.log("POS KEYS", Object.keys(pos).filter((k) => /date|start|hire/i.test(k)).join(","));
  console.log("POS START", pos.startDate, pos.employmentStartDate);
  const put = await call(api, "PUT", `/api/OrganizationalUnitPosition/${jale.positionId}`, {
    title: pos.title || "Yeni Uzman",
    organizationalUnitId: jale.unitId,
    employeeId: jale.employeeId,
    roleId: jale.roleId,
    directManagerPositionId: pos.directManagerPositionId,
    employmentType: "Full-time",
    startDate: "2026-06-15",
    workingHourTypeId: pos.workingHourTypeId,
  });
  console.log("POS PUT", put.good, put.err, put.data?.startDate);
  const on = unwrap(await api("POST", "/api/PerformancePeriod/scope-preview", {
    organizationalUnitId: state.units.p360.id, includeNewJoiners: true,
    scopes: [{ scopeType: 1, organizationalUnitId: state.units.p360.id, isExcluded: false }],
  }));
  const off = unwrap(await api("POST", "/api/PerformancePeriod/scope-preview", {
    organizationalUnitId: state.units.p360.id, includeNewJoiners: false,
    scopes: [{ scopeType: 1, organizationalUnitId: state.units.p360.id, isExcluded: false }],
  }));
  rec("PRF-DONEM-YENI", "Dönem içinde giren, bayrak kapalıyken dışarıda kalır", Number(off?.employeeCount) < Number(on?.employeeCount) || Number(off?.excludedNewJoinerCount) > 0, "sayı düşer", `açık ${on?.employeeCount}/${on?.excludedNewJoinerCount} kapalı ${off?.employeeCount}/${off?.excludedNewJoinerCount} işe giriş ${put.data?.startDate || pos.startDate}`, "");

  const commentTpl = await call(api, "POST", "/api/PerformanceTemplate/with-children", {
    name: "Yorum eşiği",
    organizationalUnitId: state.units.miras.id,
    evaluationModel: 0,
    selfWeight: 0, managerWeight: 100, peerWeight: 0, subordinateWeight: 0, hrWeight: 0,
    competencyScoringMode: 0, showResultToEmployee: true,
    categories: [{
      name: "Tek", order: 0, weight: 100, categoryType: 3, scoreImpact: 0, reviewerAggregation: 0,
      categoryReviewers: [{ reviewerType: 1, canScore: true, canComment: true, order: 0 }],
      criteria: [{ title: "İş birliği", order: 0, weight: 100, questionType: 0, scoreImpact: 0, isRequired: true, showToEmployee: true, showCommentField: true, requireCommentBelowScore: 3 }],
    }],
  });
  const period = commentTpl.good ? await call(api, "POST", "/api/PerformancePeriod", {
    name: "Yorum eşiği 2027", code: "PRF-YORUM-2027", startDate: "2027-04-01", endDate: "2027-04-30",
    periodType: 0, organizationalUnitId: state.units.miras.id, scoreScale: 0, defaultTemplateId: commentTpl.data.id,
    includeNewJoiners: true, resultReleaseMode: 1, employeeResultVisibility: 0, peerAnswerVisibility: 0,
  }) : commentTpl;
  if (period.good) {
    await call(api, "PUT", `/api/PerformancePeriod/${period.data.id}/stages`, [{ stageType: 5, order: 0, isEnabled: true, plannedStartDate: "2027-04-01", plannedEndDate: "2027-04-30" }]);
    const ready = unwrap(await api("GET", `/api/PerformancePeriod/${period.data.id}/readiness`));
    const block = (ready.issues || []).find((i) => i.isBlocking);
    const started = block ? { good: false, err: block.message } : await call(api, "POST", `/api/PerformancePeriod/${period.data.id}/start`, {});
    if (started.good) {
      await call(api, "POST", "/api/EmployeePerformanceReview/create-for-period", { performancePeriodId: period.data.id, performanceTemplateId: commentTpl.data.id });
      const serkan = Object.values(state.people).find((p) => p.email === "serkanusta@perf.com");
      const pelin = Object.values(state.people).find((p) => p.email === "pelinaydin@perf.com");
      const rev = arr(unwrap(await api("GET", "/api/EmployeePerformanceReview/all"))).find((r) => r.employeeId === serkan.employeeId && r.performancePeriodId === period.data.id);
      const d = unwrap(await api("GET", `/api/EmployeePerformanceReview/${rev.id}/details`));
      const q = d.template.categories[0].criteria[0];
      console.log("Q THRESH", q.requireCommentBelowScore, q.title);
      const mgr = await login(admin.browser, pelin.email, "Perf123!");
      const bare = await call(mgr.api, "POST", `/api/EmployeePerformanceReview/${rev.id}/submit-manager`, { scores: [{ criterionId: q.id, score: 2 }] });
      const withNote = bare.good ? null : await call(mgr.api, "POST", `/api/EmployeePerformanceReview/${rev.id}/submit-manager`, { scores: [{ criterionId: q.id, score: 2, comment: "Eşik altı gerekçe" }] });
      rec("PRF-FORM-07", "Eşiğin altındaki yorumsuz puan reddedilir", !bare.good && (!withNote || withNote.good), "yorumsuz red, yorumlu kabul", bare.good ? "yorumsuz kabul edildi" : `yorumsuz: ${bare.err} / yorumlu: ${withNote?.good ? "ok" : withNote?.err}`, `eşik ${q.requireCommentBelowScore}`);
      await mgr.ctx.close();
    } else rec("PRF-FORM-07", "Yorum eşiği dönemi", false, "dönem", started.err, "");
  } else console.log("COMMENT TPL", period.err);

  const changes = arr(unwrap(await api("GET", "/api/PerformanceGoal/change-requests")));
  const open = changes.find((c) => c.requestStatus === 0);
  if (open) {
    const oya = await login(admin.browser, "oyapolat@perf.com", "Perf123!");
    const decided = await call(oya.api, "POST", `/api/PerformanceGoal/change-request/${open.id}/decide`, { approve: true, decisionNote: "Uygun" });
    console.log("GOAL DECIDE", decided.status, JSON.stringify(decided.raw).slice(0, 300));
    await oya.ctx.close();
  }

  save();
  await admin.browser.close();
})().catch((e) => { console.error(e.stack || e.message); save(); process.exit(1); });
