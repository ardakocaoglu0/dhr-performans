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
  console.log(pass ? "PASS" : "FAIL", id, String(actual || "").slice(0, 150));
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
  const pending = actions.find((a) => a.actionStatus === 0);
  const who = pending?.currentApprover;
  console.log("APPROVER", JSON.stringify(who), "canAdmin", pending?.canCurrentUserDecide, "approvals", JSON.stringify(pending?.approvals)?.slice(0, 400));
  const approver = who?.id ? byEmp[who.id] : null;
  const actorEmail = approver?.email || "vildantas@perf.com";
  const actor = await login(admin.browser, actorEmail, "Perf123!");
  if (pending) {
    const approved = await call(actor.api, "POST", `/api/TalentAction/${pending.id}/approve`, { description: "Uygun" });
    const done = approved.good ? await call(actor.api, "POST", `/api/TalentAction/${pending.id}/complete`, { outcome: 0, outcomeResult: 0 }) : approved;
    rec("PRF-AKS-02", "Sıradaki onaycı aksiyonu onaylar ve tamamlar", approved.good && done.good, "tamam", approved.good ? (done.good ? "ok" : done.err) : approved.err, actorEmail);
  }
  const pipActions = arr(unwrap(await api("GET", `/api/TalentAction/list?periodId=${ids.periods.pip}`)));
  let pipAction = pipActions.find((a) => a.actionType === 5 && a.actionStatus === 0);
  if (!pipAction) {
    const mert = Object.values(state.people).find((p) => p.email === "mertacar@perf.com");
    const made = await call(api, "POST", "/api/TalentAction", {
      actionType: 5, employeeId: mert.employeeId, performancePeriodId: ids.periods.pip,
      title: "PIP planı", rationale: "Eşik altı", priority: 3, sourceType: 2,
    });
    pipAction = made.good ? made.data : null;
    console.log("PIP CREATE", made.good, made.err);
  }
  if (pipAction?.id) {
    const full = unwrap(await api("GET", `/api/TalentAction/${pipAction.id}`));
    const mail = byEmp[full.currentApprover?.id]?.email || actorEmail;
    const whoApi = mail === actorEmail ? actor.api : (await login(admin.browser, mail, "Perf123!")).api;
    if (full.actionStatus === 0) await call(whoApi, "POST", `/api/TalentAction/${pipAction.id}/approve`, { description: "PIP gerekli" });
    const pip = await call(api, "PUT", "/api/Pip", {
      talentActionId: pipAction.id, startDate: "2026-02-10", endDate: "2026-04-10", checkInIntervalDays: 14,
      goals: [{ title: "Hatayı 2 nin altına indir", successMeasure: "Haftalık hata en fazla 2", targetDate: "2026-04-01", order: 0 }],
    });
    rec("PRF-PIP-01", "Onaylı aksiyondan PIP oluşur", pip.good, "plan", pip.good ? pip.data?.id || "ok" : pip.err, "");
    if (pip.good && pip.data?.id) {
      const check = await call(api, "POST", "/api/Pip/check-in", {
        performanceImprovementPlanId: pip.data.id, checkInDate: "2026-02-24", progressPercentage: 40, managerNote: "Hata 3", employeeNote: "Eğitim aldım",
      });
      rec("PRF-PIP-02", "PIP ara kontrolü yazılır", check.good, "not", check.good ? "ok" : check.err, "");
      const ext = await call(api, "POST", `/api/Pip/${pip.data.id}/extend`, { extendedToDate: "2026-05-01", extensionReason: "İki hafta daha" });
      rec("PRF-PIP-03", "PIP uzatılır", ext.good, "uzadı", ext.good ? "ok" : ext.err, "");
      const closed = await call(api, "POST", `/api/Pip/${pip.data.id}/close`, { result: 0, closingNote: "Hedef tuttu" });
      rec("PRF-PIP-04", "PIP kapanır", closed.good, "kapandı", closed.good ? "ok" : closed.err, "");
    }
  }
  await actor.ctx.close();

  const reviews = arr(unwrap(await api("GET", "/api/EmployeePerformanceReview/all")));
  const ada = Object.values(state.people).find((p) => p.email === "adakorkmaz@perf.com");
  const adaReview = reviews.find((r) => r.employeeId === ada.employeeId && r.performancePeriodId === ids.periods.p360);
  const reviewers = arr(unwrap(await api("GET", `/api/PerformanceReviewer/by-review/${adaReview.id}`)));
  const peerRow = reviewers.find((r) => r.reviewerType === 2);
  const peerPerson = peerRow && byEmp[peerRow.evaluatorEmployeeId];
  if (peerPerson) {
    const peer = await login(admin.browser, peerPerson.email, "Perf123!");
    const detail = unwrap(await peer.api("GET", `/api/EmployeePerformanceReview/${adaReview.id}/details`));
    const q = (detail.template?.categories || []).flatMap((c) => c.criteria || []).find((c) => c.questionType === 0);
    const sent = await call(peer.api, "POST", `/api/EmployeePerformanceReview/${adaReview.id}/peer/${peerRow.id}/submit`, {
      scores: [{ criterionId: q.id, score: 5, comment: "Birlikte çalıştık" }],
    });
    rec("PRF-360-05", "Akran kendi formunu gönderir", sent.good, "akran puanı", sent.good ? "ok" : sent.err, peerPerson.email);
    const anon = unwrap(await ada && (await (async () => {
      const emp = await login(admin.browser, ada.email, "Perf123!");
      const d = unwrap(await emp.api("GET", `/api/EmployeePerformanceReview/personal/${adaReview.id}/details`));
      await emp.ctx.close();
      return d;
    })()));
    const peerNames = JSON.stringify(anon?.reviewers || []);
    rec("PRF-360-10", "Anonim akranın adı çalışana açılmaz", anon && !peerNames.toLowerCase().includes(peerPerson.email.split("@")[0]), "isim yok", peerNames.slice(0, 180), "");
    await peer.ctx.close();
  } else rec("PRF-360-05", "Akran kendi formunu gönderir", false, "akran", "eşleşme yok", JSON.stringify(reviewers.map((r) => r.reviewerType)));

  const vildan = await login(admin.browser, "vildantas@perf.com", "Perf123!");
  const pots = arr(unwrap(await api("GET", `/api/PotentialAssessment/by-period/${ids.periods.box}`)));
  let n = 0;
  for (const row of pots) {
    const reviewed = await call(vildan.api, "POST", `/api/PotentialAssessment/${row.id}/review`, { approve: true, reviewNote: "Yönetici kesinleştirdi" });
    if (reviewed.good) n++;
    else if (n === 0) console.log("VILDAN", reviewed.err);
  }
  await vildan.ctx.close();
  rec("PRF-KUTU-03", "Potansiyeli başka bir yetkili kesinleştirir", n > 0, "kesin", n + "/" + pots.length, "");
  if (n > 0) {
    await call(api, "POST", "/api/NineBoxCalibration/sync", { performancePeriodId: ids.periods.box, employeeIds: [] });
    const matrix = unwrap(await api("GET", `/api/NineBoxAssessment/matrix?periodId=${ids.periods.box}&ouId=${state.units.box.id}`));
    const cells = arr(matrix).filter((c) => Number(c.employeeCount) > 0);
    rec("PRF-KUTU-11", "Dolu 9 kutu hücreleri", cells.length >= 3, "en az 3 hücre", cells.map((c) => c.cell + ":" + c.employeeCount).join(", ") || "boş", "");
  }

  const changes = arr(unwrap(await api("GET", "/api/PerformanceGoal/change-requests")));
  const goal = changes[0];
  if (goal) {
    console.log("CHANGE", JSON.stringify(goal).slice(0, 400));
    const oya = await login(admin.browser, "oyapolat@perf.com", "Perf123!");
    const decided = await call(oya.api, "POST", `/api/PerformanceGoal/change-request/${goal.id}/decide`, { approve: false, decisionNote: "Hedef aynı kalsın" });
    rec("PRF-HEDEF-24", "Yönetici değişiklik talebini karara bağlar", decided.good, "karar", decided.good ? "ok" : decided.err, "oyapolat");
    await oya.ctx.close();
  }

  const on = unwrap(await api("POST", "/api/PerformancePeriod/scope-preview", {
    organizationalUnitId: state.units.p360.id, includeNewJoiners: true,
    scopes: [{ scopeType: 1, organizationalUnitId: state.units.p360.id, isExcluded: false }],
  }));
  const off = unwrap(await api("POST", "/api/PerformancePeriod/scope-preview", {
    organizationalUnitId: state.units.p360.id, includeNewJoiners: false,
    scopes: [{ scopeType: 1, organizationalUnitId: state.units.p360.id, isExcluded: false }],
  }));
  rec("PRF-DONEM-YENI", "Yeni giren bayrağı kapsam sayısını değiştirir", Number(off?.excludedNewJoinerCount) !== Number(on?.excludedNewJoinerCount) || Number(off?.employeeCount) !== Number(on?.employeeCount), "sayı değişir", `açık kisi ${on?.employeeCount} haric ${on?.excludedNewJoinerCount} / kapalı kisi ${off?.employeeCount} haric ${off?.excludedNewJoinerCount}`, "");

  const emp = await login(admin.browser, ada.email, "Perf123!");
  const personal = unwrap(await emp.api("GET", `/api/EmployeePerformanceReview/personal/${adaReview.id}/details`));
  rec("PRF-YETKI-05", "Sonuç kapalıyken çalışan karnesinde genel skor görünmez", personal && (personal.showResultToEmployee === false || personal.overallScore == null), "gizli", `show=${personal?.showResultToEmployee} score=${personal?.overallScore}`, "");
  await emp.ctx.close();

  save();
  await admin.browser.close();
  console.log("DONE", scenarios.filter((s) => s.pass).length, "/", scenarios.length);
})().catch((e) => { console.error(e.stack || e.message); save(); process.exit(1); });
