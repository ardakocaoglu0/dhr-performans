const fs = require("fs");
const path = require("path");
const { openAdmin, login, unwrap, arr, ok, errText } = require("./dhr.cjs");
const state = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "state.json"), "utf8"));
const ids = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "lab-ids.json"), "utf8"));
const file = path.join(__dirname, "..", "data", "scenarios.json");
let scenarios = JSON.parse(fs.readFileSync(file, "utf8"));
const byEmp = Object.fromEntries(Object.values(state.people).map((p) => [p.employeeId, p]));
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
  return { data: unwrap(r), good: ok(r), err: errText(r) };
}
(async () => {
  const admin = await openAdmin();
  const api = admin.api;
  const vildan = await login(admin.browser, "vildantas@perf.com", "Perf123!");
  const actions = arr(unwrap(await api("GET", `/api/TalentAction/list?periodId=${ids.periods.box}`)));
  const pending = actions.find((a) => a.actionStatus === 0 || a.actionStatus === 1);
  if (pending) {
    if (pending.actionStatus === 0) await call(vildan.api, "POST", `/api/TalentAction/${pending.id}/approve`, { description: "Uygun" });
    const done = await call(vildan.api, "POST", `/api/TalentAction/${pending.id}/complete`, { outcome: "Hedef tuttu", outcomeResult: 0 });
    rec("PRF-AKS-02", "Sıradaki onaycı aksiyonu onaylar ve tamamlar", done.good, "tamam", done.good ? "ok" : done.err, pending.id);
  }
  const pipId = "c353c993-55c3-4420-adc4-0d8855f73f3d";
  let closed = await call(api, "POST", `/api/Pip/${pipId}/close`, { result: 2, closingNote: "Hedef tuttu" });
  if (!closed.good) closed = await call(api, "POST", `/api/Pip/${pipId}/close`, { result: 1, closingNote: "Hedef tuttu" });
  rec("PRF-PIP-04", "PIP kapanır", closed.good, "kapandı", closed.good ? "ok" : closed.err, "");

  const reviews = arr(unwrap(await api("GET", "/api/EmployeePerformanceReview/all")));
  const ada = Object.values(state.people).find((p) => p.email === "adakorkmaz@perf.com");
  const adaReview = reviews.find((r) => r.employeeId === ada.employeeId && r.performancePeriodId === ids.periods.p360);
  const reviewers = arr(unwrap(await api("GET", `/api/PerformanceReviewer/by-review/${adaReview.id}`)));
  const peerRow = reviewers.find((r) => r.reviewerType === 2);
  const peerPerson = peerRow && byEmp[peerRow.evaluatorEmployeeId];
  if (peerPerson && peerRow) {
    const peer = await login(admin.browser, peerPerson.email, "Perf123!");
    const detail = unwrap(await peer.api("GET", `/api/EmployeePerformanceReview/${adaReview.id}/details`));
    const q = (detail?.template?.categories || []).flatMap((c) => c.criteria || []).find((c) => c.questionType === 0);
    const sent = q
      ? await call(peer.api, "POST", `/api/EmployeePerformanceReview/${adaReview.id}/peer/${peerRow.id}/submit`, {
          scores: [{ criterionId: q.id, score: 5, comment: "Birlikte çalıştık" }],
        })
      : { good: false, err: "soru yok" };
    rec("PRF-360-05", "Akran kendi formunu gönderir", sent.good, "akran puanı", sent.good ? "ok" : sent.err, peerPerson.email);
    await peer.ctx.close();
    const emp = await login(admin.browser, ada.email, "Perf123!");
    const personal = unwrap(await emp.api("GET", `/api/EmployeePerformanceReview/personal/${adaReview.id}/details`));
    const blob = JSON.stringify(personal?.reviewers || []);
    rec("PRF-360-10", "Anonim akranın adı çalışana açılmaz", personal && !blob.toLowerCase().includes((peerPerson.firstName || "gokce").toLowerCase()), "isim yok", blob.slice(0, 200), "");
    rec("PRF-YETKI-05", "Sonuç kapalıyken çalışan karnesinde genel skor görünmez", !!personal && (personal.showResultToEmployee === false || personal.overallScore == null), "gizli", `show=${personal?.showResultToEmployee} score=${personal?.overallScore}`, "");
    await emp.ctx.close();
  }

  const pots = arr(unwrap(await api("GET", `/api/PotentialAssessment/by-period/${ids.periods.box}`)));
  let n = 0;
  for (const row of pots) {
    const reviewed = await call(vildan.api, "POST", `/api/PotentialAssessment/${row.id}/review`, { approve: true, reviewNote: "Yönetici kesinleştirdi" });
    if (reviewed.good) n++;
    else if (n === 0) console.log("POT", reviewed.err);
  }
  rec("PRF-KUTU-03", "Potansiyeli başka bir yetkili kesinleştirir", n > 0, "kesin", n + "/" + pots.length, "");
  if (n > 0) {
    await call(api, "POST", "/api/NineBoxCalibration/sync", { performancePeriodId: ids.periods.box, employeeIds: [] });
    const matrix = unwrap(await api("GET", `/api/NineBoxAssessment/matrix?periodId=${ids.periods.box}&ouId=${state.units.box.id}`));
    const cells = arr(matrix).filter((c) => Number(c.employeeCount) > 0);
    rec("PRF-KUTU-11", "Dolu 9 kutu hücreleri", cells.length >= 3, "en az 3 hücre", cells.map((c) => `${c.cell}:${c.employeeCount}`).join(", ") || "boş", "");
  }

  const on = unwrap(await api("POST", "/api/PerformancePeriod/scope-preview", {
    organizationalUnitId: state.units.p360.id, includeNewJoiners: true,
    scopes: [{ scopeType: 1, organizationalUnitId: state.units.p360.id, isExcluded: false }],
  }));
  const off = unwrap(await api("POST", "/api/PerformancePeriod/scope-preview", {
    organizationalUnitId: state.units.p360.id, includeNewJoiners: false,
    scopes: [{ scopeType: 1, organizationalUnitId: state.units.p360.id, isExcluded: false }],
  }));
  rec("PRF-DONEM-YENI", "Yeni giren bayrağı kapsam sayısını değiştirir", Number(off?.employeeCount) !== Number(on?.employeeCount) || Number(off?.excludedNewJoinerCount) > 0, "sayı değişir", `açık ${on?.employeeCount}/${on?.excludedNewJoinerCount} kapalı ${off?.employeeCount}/${off?.excludedNewJoinerCount}`, "");

  const changes = arr(unwrap(await api("GET", "/api/PerformanceGoal/change-requests")));
  if (changes[0]) {
    const oya = await login(admin.browser, "oyapolat@perf.com", "Perf123!");
    const decided = await call(oya.api, "POST", `/api/PerformanceGoal/change-request/${changes[0].id}/decide`, { approve: false, decisionNote: "Hedef aynı kalsın" });
    rec("PRF-HEDEF-24", "Yönetici değişiklik talebini karara bağlar", decided.good, "karar", decided.good ? "ok" : decided.err, "");
    await oya.ctx.close();
  }

  save();
  await vildan.ctx.close();
  await admin.browser.close();
  console.log("DONE", scenarios.filter((s) => s.pass).length, "/", scenarios.length);
})().catch((e) => { console.error(e.stack || e.message); save(); process.exit(1); });
