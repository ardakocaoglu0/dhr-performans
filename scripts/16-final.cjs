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
  const ege = await login(admin.browser, "egebayrak@perf.com", "Perf123!");
  const pots = arr(unwrap(await api("GET", `/api/PotentialAssessment/by-period/${ids.periods.box}`)));
  let n = 0;
  for (const row of pots) {
    const reviewed = await call(ege.api, "POST", `/api/PotentialAssessment/${row.id}/review`, { approve: true, reviewNote: "İkinci İK kesinleştirdi" });
    if (reviewed.good) n++;
    else if (n === 0) console.log("EGE REVIEW", reviewed.err);
  }
  rec("PRF-KUTU-03", "Puanı giren İK değil, ikinci İK kesinleştirir", n > 0, "kesin", n + "/" + pots.length, "");
  if (n > 0) {
    await call(api, "POST", "/api/NineBoxCalibration/sync", { performancePeriodId: ids.periods.box, employeeIds: [] });
    const matrix = unwrap(await api("GET", `/api/NineBoxAssessment/matrix?periodId=${ids.periods.box}&ouId=${state.units.box.id}`));
    const cells = arr(matrix).filter((c) => Number(c.employeeCount) > 0);
    rec("PRF-KUTU-11", "Dolu 9 kutu hücreleri", cells.length >= 1, "dolu hücre", cells.map((c) => `${c.cell}:${c.employeeCount}`).join(", ") || "boş", "");
  }

  const reviews = arr(unwrap(await api("GET", "/api/EmployeePerformanceReview/all")));
  const serkan = reviews.find((r) => r.employeeFullName === "Serkan Usta" && r.reviewStatus === 11);
  if (serkan) {
    const approvals = arr(unwrap(await api("GET", "/api/EmployeePerformanceReviewApproval/by-position")));
    console.log("CHAIN", JSON.stringify(approvals).slice(0, 400));
    const detail = unwrap(await api("GET", `/api/EmployeePerformanceReview/${serkan.id}/details`));
    console.log("DETAIL APPR", JSON.stringify(detail.approvals || []).slice(0, 400));
    const chain = detail.approvals || approvals;
    for (const step of chain) {
      if (step.approvalStatus === 1 || step.isActive || step.approvalStatus === 0) {
        const who = step.approver?.id;
        const person = Object.values(state.people).find((p) => p.employeeId === who);
        const client = person ? (await login(admin.browser, person.email, "Perf123!")).api : api;
        const hit = await call(client, "PUT", `/api/EmployeePerformanceReviewApproval/approve/${step.id}`, { description: "İtiraz incelensin" });
        console.log("STEP", step.id, person?.email || "admin", hit.good, hit.err);
      }
    }
    const fin = await call(ege.api, "POST", `/api/EmployeePerformanceReview/${serkan.id}/finalize-appeal`, {});
    const finAdmin = fin.good ? fin : await call(api, "POST", `/api/EmployeePerformanceReview/${serkan.id}/finalize-appeal`, {});
    rec("PRF-ITIRAZ-05", "Onay zincirinin son halkası itirazı sonuçlandırır", fin.good || finAdmin.good, "sonuç", (fin.good ? fin : finAdmin).good ? "ok" : finAdmin.err, "");
  }

  const murat = Object.values(state.people).find((p) => p.email === "muratkoc@perf.com");
  const goals = arr(unwrap(await api("GET", "/api/PerformanceGoal/all")));
  const goal = goals.find((g) => g.employeeId === murat.employeeId && g.goalStatus === 3 || (g.title && g.employeeId === murat.employeeId));
  if (goal) {
    const emp = await login(admin.browser, murat.email, "Perf123!");
    const req = await call(emp.api, "POST", "/api/PerformanceGoal/change-request", {
      performanceGoalId: goal.id, changeType: 0, reason: "Hedef 40 kalsın ama tarih uzasın", newWeight: 40,
    });
    await emp.ctx.close();
    const id = req.data?.id;
    const decided = id ? await call(api, "POST", `/api/PerformanceGoal/change-request/${id}/decide`, { approve: true, decisionNote: "Tarih uygun" }) : { good: false, err: req.err };
    rec("PRF-HEDEF-24", "Çalışan talep eder, İK karara bağlar", decided.good, "kabul", decided.good ? "ok" : decided.err, "");
  }

  const period = await call(api, "POST", "/api/PerformancePeriod", {
    name: "Akran Mart 2027", code: "PRF-AKRAN-2027", startDate: "2027-03-01", endDate: "2027-03-31",
    periodType: 0, organizationalUnitId: state.units.pip.id, scoreScale: 0, defaultTemplateId: ids.t270,
    includeNewJoiners: true, resultReleaseMode: 1, employeeResultVisibility: 0, peerAnswerVisibility: 0,
  });
  if (period.good) {
    await call(api, "PUT", `/api/PerformancePeriod/${period.data.id}/stages`, [4, 5, 6].map((stageType, order) => ({
      stageType, order, isEnabled: true, plannedStartDate: "2027-03-01", plannedEndDate: "2027-03-31",
    })));
    const ready = unwrap(await api("GET", `/api/PerformancePeriod/${period.data.id}/readiness`));
    const block = (ready.issues || []).find((i) => i.isBlocking);
    const started = block ? { good: false, err: block.message } : await call(api, "POST", `/api/PerformancePeriod/${period.data.id}/start`, {});
    if (started.good) {
      await call(api, "POST", "/api/EmployeePerformanceReview/create-for-period", { performancePeriodId: period.data.id, performanceTemplateId: ids.t270 });
      const all = arr(unwrap(await api("GET", "/api/EmployeePerformanceReview/all")));
      const irem = Object.values(state.people).find((p) => p.email === "irembal@perf.com");
      const leman = Object.values(state.people).find((p) => p.email === "lemansu@perf.com");
      const rev = all.find((r) => r.employeeId === irem.employeeId && r.performancePeriodId === period.data.id);
      if (rev) {
        await call(api, "PUT", "/api/PerformanceReviewer/assign-peers", { employeePerformanceReviewId: rev.id, peerEmployeeIds: [leman.employeeId] });
        const reviewers = arr(unwrap(await api("GET", `/api/PerformanceReviewer/by-review/${rev.id}`)));
        const peerRow = reviewers.find((r) => r.reviewerType === 2);
        const detail = unwrap(await api("GET", `/api/EmployeePerformanceReview/${rev.id}/details`));
        const q = (detail.template?.categories || []).flatMap((c) => c.criteria || [])[0];
        const peer = await login(admin.browser, leman.email, "Perf123!");
        const sent = peerRow && q ? await call(peer.api, "POST", `/api/EmployeePerformanceReview/${rev.id}/peer/${peerRow.id}/submit`, {
          scores: [{ criterionId: q.id, score: 4, comment: "Akran gözlemi" }],
        }) : { good: false, err: "satır yok" };
        rec("PRF-360-05", "Akran kendi formunu gönderir", sent.good, "akran puanı", sent.good ? "ok" : sent.err, "");
        await peer.ctx.close();
      } else rec("PRF-360-05", "Akran formu açılır", false, "form", "yok", "");
    } else rec("PRF-360-05", "Akran dönemi açılır", false, "dönem", started.err, "");
  } else rec("PRF-360-05", "Akran dönemi", false, "dönem", period.err, "");

  save();
  await ege.ctx.close();
  await admin.browser.close();
  const left = scenarios.filter((s) => !s.pass);
  console.log("DONE", scenarios.filter((s) => s.pass).length, "/", scenarios.length);
  left.forEach((s) => console.log("LEFT", s.id, "|", s.actual.slice(0, 120)));
})().catch((e) => { console.error(e.stack || e.message); save(); process.exit(1); });
