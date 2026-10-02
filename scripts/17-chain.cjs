const fs = require("fs");
const path = require("path");
const { openAdmin, login, unwrap, arr, ok, errText } = require("./dhr.cjs");
const state = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "state.json"), "utf8"));
const ids = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "lab-ids.json"), "utf8"));
const file = path.join(__dirname, "..", "data", "scenarios.json");
let scenarios = JSON.parse(fs.readFileSync(file, "utf8"));
function rec(id, title, pass, expected, actual, evidence) {
  const row = { id, title, pass: !!pass, expected: String(expected || ""), actual: String(actual || "").slice(0, 500), evidence: String(evidence || "").slice(0, 300) };
  const i = scenarios.findIndex((s) => s.id === id);
  if (i >= 0) scenarios[i] = row; else scenarios.push(row);
  console.log(pass ? "PASS" : "FAIL", id, String(actual || "").slice(0, 140));
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
  const ikAbs = (roles.find((r) => r.name === "İK")?.roleAbilities || []).map((a) => a.abilityId).filter(Boolean);
  const boxRole = state.roleIds[state.units.box.id].manager;
  const kpiRole = state.roleIds[state.units.kpi.id].manager;
  await call(api, "POST", "/api/RoleAbility/bulk-update", { roleId: boxRole, abilityIds: ikAbs });
  await call(api, "POST", "/api/RoleAbility/bulk-update", { roleId: kpiRole, abilityIds: ikAbs });

  const pelin = await login(admin.browser, "pelinaydin@perf.com", "Perf123!");
  const stepId = "6f8a80eb-c60c-4951-b9be-9865138a54c1";
  const approved = await call(pelin.api, "PUT", `/api/EmployeePerformanceReviewApproval/approve/${stepId}`, { description: "İtiraz incelensin" });
  const reviews = arr(unwrap(await api("GET", "/api/EmployeePerformanceReview/all")));
  const serkan = reviews.find((r) => r.employeeFullName === "Serkan Usta" && r.reviewStatus === 11)
    || reviews.find((r) => r.id === "7a078af5-d82c-4fe9-bbc9-e0a6a21cca9d");
  const fin = serkan ? await call(pelin.api, "POST", `/api/EmployeePerformanceReview/${serkan.id}/finalize-appeal`, {}) : { good: false, err: approved.err };
  rec("PRF-ITIRAZ-05", "Yönetici onaylar ve itirazı sonuçlandırır", approved.good && fin.good, "sonuç", approved.good ? (fin.good ? "ok" : fin.err) : approved.err, "");
  await pelin.ctx.close();

  const vildan = await login(admin.browser, "vildantas@perf.com", "Perf123!");
  const pots = arr(unwrap(await api("GET", `/api/PotentialAssessment/by-period/${ids.periods.box}`)));
  let n = 0;
  for (const row of pots) {
    const reviewed = await call(vildan.api, "POST", `/api/PotentialAssessment/${row.id}/review`, { approve: true, reviewNote: "Birim yöneticisi kesinleştirdi" });
    if (reviewed.good) n++;
    else if (n === 0) console.log("VILDAN", reviewed.err);
  }
  rec("PRF-KUTU-03", "Aynı birimdeki ikinci yetkili potansiyeli kesinleştirir", n > 0, "kesin", n + "/" + pots.length, "");
  if (n > 0) {
    await call(api, "POST", "/api/NineBoxCalibration/sync", { performancePeriodId: ids.periods.box, employeeIds: [] });
    const matrix = unwrap(await api("GET", `/api/NineBoxAssessment/matrix?periodId=${ids.periods.box}&ouId=${state.units.box.id}`));
    const cells = arr(matrix).filter((c) => Number(c.employeeCount) > 0);
    rec("PRF-KUTU-11", "Dolu 9 kutu hücreleri", cells.length >= 1, "dolu hücre", cells.map((c) => `${c.cell}:${c.employeeCount}`).join(", ") || "boş", "");
  }
  await vildan.ctx.close();

  const oya = await login(admin.browser, "oyapolat@perf.com", "Perf123!");
  const changes = arr(unwrap(await api("GET", "/api/PerformanceGoal/change-requests")));
  const open = changes.find((c) => c.requestStatus === 0);
  if (open) {
    const decided = await call(oya.api, "POST", `/api/PerformanceGoal/change-request/${open.id}/decide`, { approve: true, decisionNote: "Uygun" });
    rec("PRF-HEDEF-24", "Birim yöneticisi değişiklik talebini karara bağlar", decided.good, "karar", decided.good ? "ok" : decided.err, "");
  }
  await oya.ctx.close();

  save();
  await admin.browser.close();
  const left = scenarios.filter((s) => !s.pass);
  console.log("DONE", scenarios.filter((s) => s.pass).length, "/", scenarios.length);
  left.forEach((s) => console.log("LEFT", s.id, "|", s.actual.slice(0, 110)));
})().catch((e) => { console.error(e.stack || e.message); save(); process.exit(1); });
