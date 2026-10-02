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
  return { data: unwrap(r), good: ok(r), err: errText(r), raw: r.data };
}
(async () => {
  const admin = await openAdmin();
  const api = admin.api;

  rec("PRF-YETKI-05", "Sonuç kapalıyken çalışan karnesinde genel skor görünmez", false, "skor boş", "show=false iken overallScore 92.22 döndü", "personal details");

  const reviews = arr(unwrap(await api("GET", "/api/EmployeePerformanceReview/all")));
  const ada = Object.values(state.people).find((p) => p.email === "adakorkmaz@perf.com");
  const adaReview = reviews.find((r) => r.employeeId === ada.employeeId && r.performancePeriodId === ids.periods.p360);
  const adminDetail = unwrap(await api("GET", `/api/EmployeePerformanceReview/${adaReview.id}/details`));
  const q = (adminDetail.template?.categories || []).flatMap((c) => c.criteria || []).find((c) => c.questionType === 0);
  const reviewers = arr(unwrap(await api("GET", `/api/PerformanceReviewer/by-review/${adaReview.id}`)));
  const peerRow = reviewers.find((r) => r.reviewerType === 2);
  const peerPerson = byEmp[peerRow?.evaluatorEmployeeId];
  if (peerPerson && q) {
    const peer = await login(admin.browser, peerPerson.email, "Perf123!");
    const sent = await call(peer.api, "POST", `/api/EmployeePerformanceReview/${adaReview.id}/peer/${peerRow.id}/submit`, {
      scores: [{ criterionId: q.id, score: 5, comment: "Birlikte çalıştık" }],
    });
    rec("PRF-360-05", "Akran kendi formunu gönderir", sent.good, "akran puanı", sent.good ? "ok" : sent.err, peerPerson.email);
    await peer.ctx.close();
    const emp = await login(admin.browser, ada.email, "Perf123!");
    const personal = unwrap(await emp.api("GET", `/api/EmployeePerformanceReview/personal/${adaReview.id}/details`));
    const blob = JSON.stringify(personal?.reviewers || []);
    const leaked = blob.toLowerCase().includes(String(peerPerson.firstName || "").toLowerCase()) || blob.toLowerCase().includes(String(peerPerson.lastName || "").toLowerCase());
    rec("PRF-360-10", "Anonim akranın adı çalışana açılmaz", !leaked, "isim yok", leaked ? "ad var" : "ad yok, id var", blob.slice(0, 180));
    await emp.ctx.close();
  }

  const vildan = await login(admin.browser, "vildantas@perf.com", "Perf123!");
  const pots = arr(unwrap(await api("GET", `/api/PotentialAssessment/by-period/${ids.periods.box}`)));
  let saved = 0;
  for (const row of pots) {
    const full = unwrap(await api("GET", `/api/PotentialAssessment/${row.id}`));
    const criterionId = full?.criteria?.[0]?.id || full?.template?.criteria?.[0]?.id || full?.scores?.[0]?.potentialCriterionId;
    if (!criterionId) { if (saved === 0) console.log("POT KEYS", Object.keys(full || {})); continue; }
    const res = await call(vildan.api, "POST", "/api/PotentialAssessment/save-scores", {
      potentialAssessmentId: row.id, submit: true,
      scores: [{ potentialCriterionId: criterionId, score: full?.scores?.[0]?.score || 3, evidence: "Yönetici gözlemi" }],
    });
    if (res.good) saved++;
    else if (saved === 0) console.log("SAVE", res.err);
  }
  let n = 0;
  for (const row of pots) {
    const reviewed = await call(api, "POST", `/api/PotentialAssessment/${row.id}/review`, { approve: true, reviewNote: "İK kesinleştirdi" });
    if (reviewed.good) n++;
    else if (n === 0) console.log("ADMIN REVIEW", reviewed.err);
  }
  rec("PRF-KUTU-03", "Puanı yönetici girer, İK kesinleştirir", n > 0, "kesin", `kayıt ${saved} kesin ${n}/${pots.length}`, "");
  await vildan.ctx.close();
  if (n > 0) {
    await call(api, "POST", "/api/NineBoxCalibration/sync", { performancePeriodId: ids.periods.box, employeeIds: [] });
    const matrix = unwrap(await api("GET", `/api/NineBoxAssessment/matrix?periodId=${ids.periods.box}&ouId=${state.units.box.id}`));
    const cells = arr(matrix).filter((c) => Number(c.employeeCount) > 0);
    rec("PRF-KUTU-11", "Dolu 9 kutu hücreleri", cells.length >= 3, "en az 3 hücre", cells.map((c) => `${c.cell}:${c.employeeCount}`).join(", ") || "boş", "");
  }

  const pelin = Object.values(state.people).find((p) => p.email === "pelinaydin@perf.com");
  const serkan = Object.values(state.people).find((p) => p.email === "serkanusta@perf.com");
  const period = await call(api, "POST", "/api/PerformancePeriod", {
    name: "İtiraz Aralık", code: "PRF-ITIRAZ-ARALIK", startDate: "2026-12-01", endDate: "2026-12-31",
    periodType: 0, organizationalUnitId: state.units.miras.id, scoreScale: 0, defaultTemplateId: ids.t90,
    includeNewJoiners: true, resultReleaseMode: 1, employeeResultVisibility: 0, peerAnswerVisibility: 0, showResultToEmployee: true,
  });
  if (period.good) {
    await call(api, "PUT", `/api/PerformancePeriod/${period.data.id}/stages`, [0, 4, 5, 9, 10].map((stageType, order) => ({
      stageType, order, isEnabled: true, plannedStartDate: "2026-12-01", plannedEndDate: "2026-12-31",
    })));
    await call(api, "PUT", `/api/PerformancePeriod/${period.data.id}/scope`, {
      scopes: [{ scopeType: 2, employeeId: serkan.employeeId, isExcluded: false }],
    });
    const ready = unwrap(await api("GET", `/api/PerformancePeriod/${period.data.id}/readiness`));
    const block = (ready.issues || []).find((i) => i.isBlocking);
    const started = block ? { good: false, err: block.message } : await call(api, "POST", `/api/PerformancePeriod/${period.data.id}/start`, {});
    const created = started.good ? await call(api, "POST", "/api/EmployeePerformanceReview/create-for-period", {
      performancePeriodId: period.data.id, performanceTemplateId: ids.t90,
    }) : started;
    const all = arr(unwrap(await api("GET", "/api/EmployeePerformanceReview/all")));
    const rev = all.find((r) => r.employeeId === serkan.employeeId && r.performancePeriodId === period.data.id);
    if (rev) {
      const d = unwrap(await api("GET", `/api/EmployeePerformanceReview/${rev.id}/details`));
      const criterionId = d.template.categories[0].criteria[0].id;
      const mgr = await login(admin.browser, pelin.email, "Perf123!");
      const sent = await call(mgr.api, "POST", `/api/EmployeePerformanceReview/${rev.id}/submit-manager`, {
        scores: [{ criterionId, score: 2, comment: "İtiraz denemesi için düşük puan" }],
      });
      await mgr.ctx.close();
      const window = await call(api, "GET", `/api/EmployeePerformanceAppeal/window-status/${rev.id}`);
      const emp = await login(admin.browser, serkan.email, "Perf123!");
      const raised = await call(emp.api, "POST", `/api/EmployeePerformanceReview/${rev.id}/raise-appeal`, {
        reason: "Puan dönem içindeki teslimleri eksik saydı, itiraz gerekçem bu.",
      });
      await emp.ctx.close();
      rec("PRF-ITIRAZ-04", "Yönetici puanından sonra itiraz penceresi açılır", raised.good, "itiraz açıldı", raised.good ? "ok" : raised.err, `puan ${sent.good ? "gitti" : sent.err} pencere ${JSON.stringify(window.data).slice(0, 120)}`);
      if (raised.good) {
        const appeals = arr(unwrap(await api("GET", "/api/EmployeePerformanceAppeal/by-position")));
        const mine = appeals.find((a) => a.employeePerformanceReviewId === rev.id) || appeals[0];
        const resolved = mine?.id ? await call(api, "PUT", `/api/EmployeePerformanceAppeal/resolve/${mine.id}`, { approve: true, note: "Puan gözden geçirilsin" }) : { good: false, err: "kayıt yok" };
        rec("PRF-ITIRAZ-05", "İK itirazı kabul eder", resolved.good, "kabul", resolved.good ? "ok" : resolved.err, "");
      }
    } else rec("PRF-ITIRAZ-04", "İtiraz dönemi ve form", false, "form", created.err || started.err || "form yok", block?.message || "");
  } else rec("PRF-ITIRAZ-04", "İtiraz dönemi açılır", false, "dönem", period.err, "");

  const changes = arr(unwrap(await api("GET", "/api/PerformanceGoal/change-requests")));
  if (changes[0]) {
    console.log("CHANGE KEYS", Object.keys(changes[0]).join(","));
    console.log(JSON.stringify({ ...changes[0], employee: undefined }).slice(0, 500));
  }

  save();
  await admin.browser.close();
  const pass = scenarios.filter((s) => s.pass).length;
  const fail = scenarios.filter((s) => !s.pass);
  console.log("DONE", pass, "/", scenarios.length);
  fail.forEach((s) => console.log("LEFT", s.id, s.title, "|", s.actual.slice(0, 100)));
})().catch((e) => { console.error(e.stack || e.message); save(); process.exit(1); });
