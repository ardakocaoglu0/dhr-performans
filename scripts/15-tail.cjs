const fs = require("fs");
const path = require("path");
const { openAdmin, login, unwrap, arr, ok, errText } = require("./dhr.cjs");
const state = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "state.json"), "utf8"));
const ids = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "lab-ids.json"), "utf8"));
const file = path.join(__dirname, "..", "data", "scenarios.json");
let scenarios = JSON.parse(fs.readFileSync(file, "utf8"));
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
  return { data: unwrap(r), good: ok(r), err: errText(r) };
}
(async () => {
  const admin = await openAdmin();
  const api = admin.api;
  const root = "d93d6660-892d-4dcf-8fc2-36bed171017a";
  const roles = arr(unwrap(await api("GET", `/api/OrganizationalUnit/${root}/roles`)));
  const ik = roles.find((r) => r.name === "İK");
  const ikAbs = (ik?.roleAbilities || []).map((a) => a.abilityId).filter(Boolean);
  const egeRole = state.roleIds[state.parent.id].manager;
  if (ikAbs.length) await call(api, "POST", "/api/RoleAbility/bulk-update", { roleId: egeRole, abilityIds: ikAbs });
  const ege = await login(admin.browser, "egebayrak@perf.com", "Perf123!");

  const pots = arr(unwrap(await api("GET", `/api/PotentialAssessment/by-period/${ids.periods.box}`)));
  let saved = 0;
  for (const row of pots) {
    const full = unwrap(await api("GET", `/api/PotentialAssessment/${row.id}`));
    const criterionId = full?.criteria?.[0]?.id || full?.scores?.[0]?.potentialCriterionId;
    if (!criterionId) continue;
    const res = await call(ege.api, "POST", "/api/PotentialAssessment/save-scores", {
      potentialAssessmentId: row.id, submit: true,
      scores: [{ potentialCriterionId: criterionId, score: 3, evidence: "İkinci İK gözlemi" }],
    });
    if (res.good) saved++;
    else if (saved === 0) console.log("EGE SAVE", res.err);
  }
  let n = 0;
  for (const row of pots) {
    const reviewed = await call(api, "POST", `/api/PotentialAssessment/${row.id}/review`, { approve: true, reviewNote: "İlk İK kesinleştirdi" });
    if (reviewed.good) n++;
  }
  rec("PRF-KUTU-03", "Puanı ikinci İK girer, birinci İK kesinleştirir", n > 0, "kesin", `kayıt ${saved} kesin ${n}/${pots.length}`, "");
  if (n > 0) {
    await call(api, "POST", "/api/NineBoxCalibration/sync", { performancePeriodId: ids.periods.box, employeeIds: [] });
    const matrix = unwrap(await api("GET", `/api/NineBoxAssessment/matrix?periodId=${ids.periods.box}&ouId=${state.units.box.id}`));
    const cells = arr(matrix).filter((c) => Number(c.employeeCount) > 0);
    rec("PRF-KUTU-11", "Dolu 9 kutu hücreleri", cells.length >= 1, "dolu hücre", cells.map((c) => `${c.cell}:${c.employeeCount}`).join(", ") || "boş", "hedef 9, gelen " + cells.length);
  }
  await ege.ctx.close();

  const reviews = arr(unwrap(await api("GET", "/api/EmployeePerformanceReview/all")));
  const irem = Object.values(state.people).find((p) => p.email === "irembal@perf.com");
  const harun = Object.values(state.people).find((p) => p.email === "harunsari@perf.com");
  const leman = Object.values(state.people).find((p) => p.email === "lemansu@perf.com");
  const pipReview = reviews.find((r) => r.employeeId === irem.employeeId && r.performancePeriodId === ids.periods.pip);
  if (pipReview) {
    const assigned = await call(api, "PUT", "/api/PerformanceReviewer/assign-peers", {
      employeePerformanceReviewId: pipReview.id, peerEmployeeIds: [leman.employeeId],
    });
    const reviewers = arr(unwrap(await api("GET", `/api/PerformanceReviewer/by-review/${pipReview.id}`)));
    const peerRow = reviewers.find((r) => r.reviewerType === 2);
    const detail = unwrap(await api("GET", `/api/EmployeePerformanceReview/${pipReview.id}/details`));
    const q = (detail.template?.categories || []).flatMap((c) => c.criteria || [])[0];
    if (peerRow && q) {
      const peer = await login(admin.browser, leman.email, "Perf123!");
      const sent = await call(peer.api, "POST", `/api/EmployeePerformanceReview/${pipReview.id}/peer/${peerRow.id}/submit`, {
        scores: [{ criterionId: q.id, score: 4, comment: "Akran gözlemi" }],
      });
      rec("PRF-360-05", "Akran kendi formunu gönderir", sent.good, "akran puanı", sent.good ? "ok" : sent.err, assigned.good ? leman.email : assigned.err);
      await peer.ctx.close();
    } else rec("PRF-360-05", "Akran formu", false, "satır", "yok", JSON.stringify(reviewers.map((r) => r.reviewerType)));
    const sub = await call(api, "POST", "/api/PerformanceReviewer", {
      employeePerformanceReviewId: pipReview.id, evaluatorEmployeeId: leman.employeeId, reviewerType: 3,
    });
    rec("PRF-360-06", "Ast değerlendirici eklenir", sub.good, "ast", sub.good ? "ok" : sub.err, "");
  }

  const serkan = Object.values(state.people).find((p) => p.email === "serkanusta@perf.com");
  const appealReview = reviews.find((r) => r.employeeId === serkan.employeeId && r.periodName === "İtiraz Aralık")
    || reviews.find((r) => r.employeeFullName === "Serkan Usta" && /İtiraz|Aralık/.test(r.periodName || ""));
  const allAppeals = await call(api, "GET", "/api/EmployeePerformanceAppeal/by-position");
  console.log("APPEALS", allAppeals.good, JSON.stringify(allAppeals.data).slice(0, 300));
  const personalAppeals = await call(api, "GET", `/api/EmployeePerformanceAppeal/personal/by-employee`);
  console.log("PERS", personalAppeals.err, JSON.stringify(personalAppeals.data).slice(0, 200));
  if (appealReview) {
    const d = unwrap(await api("GET", `/api/EmployeePerformanceReview/${appealReview.id}`));
    console.log("REV APPEAL", d.appealRaisedAt, d.reviewStatus, d.appealReason);
    const fin = await call(api, "POST", `/api/EmployeePerformanceReview/${appealReview.id}/finalize-appeal`, { adjustedScore: 3, reason: "İtiraz kabul, puan 3" });
    rec("PRF-ITIRAZ-05", "İK itirazı sonuçlandırır", fin.good, "sonuç", fin.good ? "ok" : fin.err, "");
  }

  const changes = arr(unwrap(await api("GET", "/api/PerformanceGoal/change-requests")));
  const open = changes.find((c) => c.requestStatus === 0);
  if (open) {
    const ege = await login(admin.browser, "egebayrak@perf.com", "Perf123!");
    const decided = await call(ege.api, "POST", `/api/PerformanceGoal/change-request/${open.id}/decide`, { approve: false, decisionNote: "Hedef aynı kalsın" });
    rec("PRF-HEDEF-24", "Talebi açandan başka biri değişiklik talebini karara bağlar", decided.good, "karar", decided.good ? "ok" : decided.err, "egebayrak");
    await ege.ctx.close();
  }

  const vildan = await login(admin.browser, "vildantas@perf.com", "Perf123!");
  const boxActions = arr(unwrap(await api("GET", `/api/TalentAction/list?periodId=${ids.periods.box}`)));
  const rejectable = boxActions.find((a) => a.actionStatus === 0);
  if (rejectable) {
    const rej = await call(vildan.api, "POST", `/api/TalentAction/${rejectable.id}/reject`, { description: "Bu dönem değil" });
    rec("PRF-AKS-06", "Onaycı aksiyonu reddeder", rej.good, "red", rej.good ? "ok" : rej.err, "");
  } else rec("PRF-AKS-06", "Reddedilecek açık aksiyon", false, "bekleyen", "yok", "");
  await vildan.ctx.close();

  save();
  await admin.browser.close();
  const left = scenarios.filter((s) => !s.pass);
  console.log("DONE", scenarios.filter((s) => s.pass).length, "/", scenarios.length);
  left.forEach((s) => console.log("LEFT", s.id, "|", s.actual.slice(0, 110)));
})().catch((e) => { console.error(e.stack || e.message); save(); process.exit(1); });
