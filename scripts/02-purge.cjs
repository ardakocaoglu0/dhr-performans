const { openAdmin, unwrap, ok, errText, writeJson } = require("./dhr.cjs");

(async () => {
  const { browser, api } = await openAdmin();
  const roots = [
    "d93d6660-892d-4dcf-8fc2-36bed171017a",
    "39989942-58b1-4ec8-8a95-435122391aa1",
  ];
  const deleted = [];
  for (const organizationalUnitId of [null, ...roots]) {
    const r = await api("POST", "/api/PerformanceDemoData/reset", {
      confirmText: "PERFORMANS-DEMO",
      organizationalUnitId,
      purge: true,
      seed: false,
      employeeLimit: 1,
      fixOrgChartGaps: false,
    });
    const body = ok(r) ? unwrap(r) : errText(r);
    console.log("RESET", organizationalUnitId || "null", r.status, typeof body === "string" ? body : JSON.stringify(body).slice(0, 500));
    deleted.push({ organizationalUnitId, status: r.status, ok: ok(r), body });
  }
  const left = {};
  for (const p of [
    "/api/PerformancePeriod/all",
    "/api/PerformanceTemplate/all",
    "/api/PerformanceGoal/all",
    "/api/EmployeePerformanceReview/all",
    "/api/Competency/all",
    "/api/NineBoxAssessment/all",
    "/api/PerformanceCalibration/all",
  ]) {
    const r = await api("GET", p);
    const list = Array.isArray(unwrap(r)) ? unwrap(r) : unwrap(r)?.items || [];
    left[p] = list.length;
    console.log("LEFT", list.length, p);
  }
  writeJson("data/purge.json", { at: new Date().toISOString(), deleted, left });
  await browser.close();
})().catch((e) => {
  console.error("FAIL", e.message);
  process.exit(1);
});
