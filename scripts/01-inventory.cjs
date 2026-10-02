const { openAdmin, unwrap, arr, ok, errText, writeJson } = require("./dhr.cjs");

const GETS = [
  "/api/OrganizationalUnit/filteredByUnitAbilities",
  "/api/PerformancePeriod/all",
  "/api/PerformanceTemplate/all",
  "/api/PerformanceGoal/all",
  "/api/EmployeePerformanceReview/all",
  "/api/Competency/all",
  "/api/Ability/all",
  "/api/NineBoxAssessment/all",
  "/api/PerformanceCalibration/all",
  "/api/Pip/by-period/00000000-0000-0000-0000-000000000000",
];

(async () => {
  const { browser, page, api } = await openAdmin();
  console.log("LOGIN", page.url());
  const out = { loginUrl: page.url(), at: new Date().toISOString(), endpoints: {} };
  for (const p of GETS) {
    const r = await api("GET", p);
    const data = unwrap(r);
    const list = arr(data);
    out.endpoints[p] = {
      status: r.status,
      ok: ok(r),
      count: list.length,
      err: ok(r) ? null : errText(r),
      sampleKeys: list[0] ? Object.keys(list[0]).slice(0, 24) : data && typeof data === "object" ? Object.keys(data).slice(0, 24) : [],
    };
    console.log(r.status, list.length || (ok(r) ? "obj" : "fail"), p, ok(r) ? "" : errText(r));
    if (p.includes("OrganizationalUnit")) out.units = list.map((u) => ({ id: u.id, name: u.name, parentId: u.parentId || u.parentOrganizationalUnitId || null }));
    if (p.includes("PerformancePeriod/all")) out.periods = list.map((x) => ({ id: x.id, name: x.name, code: x.code, status: x.periodStatus ?? x.status, ou: x.organizationalUnitId, type: x.periodType }));
    if (p.includes("PerformanceTemplate/all")) out.templates = list.map((x) => ({ id: x.id, name: x.name, ou: x.organizationalUnitId, model: x.evaluationModel }));
    if (p.includes("Ability/all")) {
      out.perfAbilities = list
        .filter((a) => /perf|nine|pip|goal|competen|kalibr|yetkin/i.test(`${a.name} ${a.code} ${a.description}`))
        .map((a) => ({ id: a.id, name: a.name, code: a.code }));
    }
  }
  const root = (out.units || []).find((u) => !u.parentId) || (out.units || [])[0];
  if (root) {
    const roles = await api("GET", `/api/OrganizationalUnit/${root.id}/roles`);
    const roleList = arr(unwrap(roles));
    out.root = root;
    out.rootRoles = roleList.map((r) => ({ id: r.id, name: r.name, abilities: (r.roleAbilities || []).length }));
    console.log("ROOT", root.name, "roles", roleList.map((r) => r.name).join(", "));
    const setting = await api("GET", `/api/PerformanceSetting/effective/${root.id}`);
    out.rootSetting = { status: setting.status, ok: ok(setting), body: ok(setting) ? unwrap(setting) : errText(setting) };
  }
  const file = writeJson("data/inventory.json", out);
  console.log("WROTE", file);
  await browser.close();
})().catch((e) => {
  console.error("FAIL", e.message);
  process.exit(1);
});
