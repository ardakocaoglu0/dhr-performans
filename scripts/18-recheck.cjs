const { openAdmin, login, unwrap, arr, ok, errText } = require("./dhr.cjs");
const state = require("../data/state.json");
const ids = require("../data/lab-ids.json");

(async () => {
  const admin = await openAdmin();
  const api = admin.api;
  const setting = unwrap(await api("GET", `/api/PerformanceSetting/effective/${state.units.p360.id}`));
  console.log("UNIT", {
    show: setting.showResultToEmployee,
    appeal: setting.appealWindowDays,
    peerMin: setting.peerEvaluatorMinCount,
    peerMax: setting.peerEvaluatorMaxCount,
    comment: setting.minScoreRequireComment,
    anon: setting.anonymousPeerEvaluation,
  });
  const tpl = unwrap(await api("GET", `/api/PerformanceTemplate/${ids.t360}`));
  console.log("TPL", { show: tpl.showResultToEmployee, appeal: tpl.appealPeriodDays, anon: tpl.anonymousPeerEvaluation });

  const reviews = arr(unwrap(await api("GET", "/api/EmployeePerformanceReview/all")));
  const ada = Object.values(state.people).find((p) => p.email === "adakorkmaz@perf.com");
  const adaReview = reviews.find((r) => r.employeeId === ada.employeeId && r.performancePeriodId === ids.periods.p360);
  const detail = unwrap(await api("GET", `/api/EmployeePerformanceReview/${adaReview.id}/details`));
  console.log("REVIEW SHOW", detail.showResultToEmployee, "score", detail.overallScore, "anonTpl", detail.template?.anonymousPeerEvaluation);
  const crits = (detail.template?.categories || []).flatMap((c) => c.criteria || []);
  console.log("CRITERIA", crits.map((c) => `${c.questionType}:${c.title}:commentBelow=${c.requireCommentBelowScore}`).join(" | "));

  const emp = await login(admin.browser, ada.email, "Perf123!");
  const personal = unwrap(await emp.api("GET", `/api/EmployeePerformanceReview/personal/${adaReview.id}/details`));
  const reviewers = personal?.reviewers || [];
  console.log("PERSONAL score", personal?.overallScore, "show", personal?.showResultToEmployee);
  console.log("PERSONAL reviewers", reviewers.map((r) => ({
    type: r.reviewerType,
    name: r.evaluatorFullName || r.employeeFullName || r.evaluatorEmployeeName || null,
    anon: r.isAnonymous,
    keys: Object.keys(r).filter((k) => /name|anon|email/i.test(k)),
  })));
  await emp.ctx.close();

  const box = Object.values(state.people).find((p) => p.email === "denizsahin@perf.com");
  const boxReview = reviews.find((r) => r.employeeId === box.employeeId && r.performancePeriodId === ids.periods.box);
  if (boxReview) {
    const bd = unwrap(await api("GET", `/api/PerformanceScore/breakdown/${boxReview.id}`));
    console.log("BOX SCORE", boxReview.overallScore, "breakdown", bd?.overallScore);
  }
  const cals = arr(unwrap(await api("GET", `/api/PerformanceCalibration/by-period/${ids.periods.box}`)));
  console.log("CALS", cals.map((c) => ({ id: c.id, status: c.calibrationStatus, adj: c.adjustmentsCount })));
  if (cals[0]) {
    const d = unwrap(await api("GET", `/api/PerformanceCalibration/${cals[0].id}/details`));
    const adjs = d?.adjustments || d?.items || [];
    console.log("ADJ", JSON.stringify(adjs).slice(0, 400));
  }

  const jale = Object.values(state.people).find((p) => p.email === "jalekaya@perf.com");
  const empRow = unwrap(await api("GET", `/api/Employee/${jale.employeeId}`));
  const pos = unwrap(await api("GET", `/api/OrganizationalUnitPosition/${jale.positionId}`));
  console.log("JALE hire", pos.startDate, empRow.startDate, jale.hire);

  const goal = arr(unwrap(await api("GET", "/api/PerformanceGoal/all"))).find((g) => g.title === "Kapanan talep");
  console.log("GOAL", goal && { id: goal.id, emp: goal.employeeFullName, status: goal.goalStatus, ou: goal.organizationalUnitName });
  const approvals = goal ? unwrap(await api("GET", `/api/PerformanceGoal/${goal.id}/approvals`)) : null;
  console.log("GOAL APPR", JSON.stringify(approvals).slice(0, 500));

  const pot = arr(unwrap(await api("GET", `/api/PotentialAssessment/by-period/${ids.periods.box}`)))[0];
  if (pot) {
    const full = unwrap(await api("GET", `/api/PotentialAssessment/${pot.id}`));
    const slim = { ...full };
    delete slim.employee;
    console.log("POT", Object.keys(full).join(","));
    console.log(JSON.stringify({
      status: full.potentialAssessmentStatus || full.status,
      scoredBy: full.assessedByEmployeeFullName || full.scoredByEmployeeFullName || full.submittedByEmployeeFullName,
      keysOfPeople: Object.keys(full).filter((k) => /by|employee|status/i.test(k)),
    }));
    for (const k of Object.keys(full)) {
      if (/by|status|score/i.test(k) && typeof full[k] !== "object") console.log(" ", k, full[k]);
    }
  }
  await admin.browser.close();
})().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
