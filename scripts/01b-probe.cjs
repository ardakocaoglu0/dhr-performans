const { openAdmin, unwrap, arr, ok, errText, writeJson } = require("./dhr.cjs");

(async () => {
  const { browser, api } = await openAdmin();
  const out = {};
  const t = await api("GET", "/api/PerformanceTemplate/6fec412f-8e06-498c-ae19-5531e7938e37");
  out.template = ok(t) ? unwrap(t) : errText(t);
  const p = await api("GET", "/api/PerformancePeriod/21539fa6-6e6c-4b0d-848c-7c26ca3a247d");
  const period = ok(p) ? unwrap(p) : null;
  out.period = period
    ? {
        name: period.name,
        periodType: period.periodType,
        periodStatus: period.periodStatus,
        scoreScale: period.scoreScale,
        evaluationModelOverride: period.evaluationModelOverride,
        stages: (period.stages || []).map((s) => ({ type: s.stageType, order: s.order, enabled: s.isEnabled, status: s.stageStatus || s.status })),
        keys: Object.keys(period),
      }
    : errText(p);
  const roles = arr(unwrap(await api("GET", "/api/OrganizationalUnit/d93d6660-892d-4dcf-8fc2-36bed171017a/roles")));
  out.calisan = (roles.find((r) => r.name === "Çalışan")?.roleAbilities || []).map((a) => a.ability?.name || a.abilityName || a.abilityId);
  out.ikSample = (roles.find((r) => r.name === "İK")?.roleAbilities || [])
    .map((a) => a.ability?.name || a.abilityName)
    .filter((n) => n && /perf|viewmy|competen|goal/i.test(n));
  const hours = arr(unwrap(await api("GET", "/api/WorkingHourType/all")));
  out.hours = hours.slice(0, 8).map((h) => ({ id: h.id, name: h.name, ou: h.organizationalUnitId }));
  const goals = arr(unwrap(await api("GET", "/api/PerformanceGoal/all")));
  out.goal0 = goals[0] ? { keys: Object.keys(goals[0]), goal: goals[0] } : null;
  writeJson("data/probe.json", out);
  console.log("stages", JSON.stringify(out.period?.stages));
  console.log("calisan abs", out.calisan.length, out.calisan.filter((n) => /perf/i.test(n)).join(","));
  console.log("template cats", (out.template.categories || []).map((c) => c.name + ":" + c.categoryType + " w" + c.weight).join(" | "));
  console.log("hours", out.hours.map((h) => h.name).join(", "));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
