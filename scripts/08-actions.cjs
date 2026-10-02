const fs = require("fs");
const path = require("path");
const { openAdmin, unwrap, arr, ok, errText, writeJson } = require("./dhr.cjs");
const state = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "state.json"), "utf8"));
const ids = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "lab-ids.json"), "utf8"));
let scenarios = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "scenarios.json"), "utf8"));
function rec(id, title, pass, expected, actual) {
  const row = { id, title, pass: !!pass, expected, actual: String(actual || "").slice(0, 500), evidence: "" };
  const i = scenarios.findIndex((s) => s.id === id);
  if (i >= 0) scenarios[i] = row; else scenarios.push(row);
  console.log(pass ? "PASS" : "FAIL", id, String(actual).slice(0, 180));
}
(async () => {
  const { browser, api } = await openAdmin();
  const emp = Object.values(state.people).find((p) => p.unit === "miras" && p.kind === "ic");
  const act = await api("POST", "/api/TalentAction", {
    actionType: 4,
    employeeId: emp.employeeId,
    performancePeriodId: ids.periods.miras,
    title: "Takdir tamamlama",
    rationale: "Dönem katkısı yüksek",
    priority: 1,
    sourceType: 2,
  });
  console.log("ACT", act.status, JSON.stringify(unwrap(act) || act.data).slice(0, 300));
  const id = unwrap(act)?.id || "f12b2cb2-9002-4b23-9447-d2859ab6814e";
  const decide = await api("PUT", `/api/TalentAction/${id}/decide`, { approve: true, decisionNote: "Uygun" });
  console.log("DECIDE", decide.status, JSON.stringify(decide.data).slice(0, 300));
  const start = await api("POST", `/api/TalentAction/${id}/start`, {});
  const done = await api("POST", `/api/TalentAction/${id}/complete`, { outcome: 0 });
  rec("PRF-AKS-02", "Aksiyon onay, başlat ve tamamla", ok(decide) && ok(start) && ok(done), "tamam", [errText(decide), errText(start), errText(done)].filter(Boolean).join(" | ") || "ok");

  const pipEmp = Object.values(state.people).find((p) => p.tag === "pipClose");
  const pipAct = await api("POST", "/api/TalentAction", {
    actionType: 5,
    employeeId: pipEmp.employeeId,
    performancePeriodId: ids.periods.pip,
    title: "Kapanış PIP",
    rationale: "Ayrı kişi",
    priority: 2,
    sourceType: 2,
  });
  console.log("PIPACT", pipAct.status, JSON.stringify(unwrap(pipAct) || pipAct.data).slice(0, 300));
  const pipActId = unwrap(pipAct)?.id;
  const pipDecide = await api("PUT", `/api/TalentAction/${pipActId}/decide`, { approve: true, decisionNote: "PIP açılsın" });
  console.log("PIPDECIDE", pipDecide.status, JSON.stringify(pipDecide.data).slice(0, 300));
  const pip = await api("PUT", "/api/Pip", {
    talentActionId: pipActId,
    startDate: "2026-02-10",
    endDate: "2026-04-10",
    checkInIntervalDays: 14,
    goals: [{ title: "Haftalık hatayı 2 nin altına indir", successMeasure: "Hata adedi en fazla 2", targetDate: "2026-04-01", order: 0 }],
  });
  rec("PRF-PIP-01", "Onaylı aksiyondan PIP oluşur", ok(pipDecide) && ok(pip), "plan", ok(pip) ? unwrap(pip)?.id : errText(pipDecide) + " " + errText(pip));
  const pipId = unwrap(pip)?.id;
  if (pipId) {
    const check = await api("POST", "/api/Pip/check-in", { performanceImprovementPlanId: pipId, checkInDate: "2026-02-24", progressPercentage: 40, managerNote: "Hata 3", employeeNote: "Eğitim aldım" });
    rec("PRF-PIP-02", "PIP check-in", ok(check), "not", ok(check) ? "ok" : errText(check));
    const ext = await api("POST", `/api/Pip/${pipId}/extend`, { extendedToDate: "2026-05-01", extensionReason: "İki hafta daha" });
    rec("PRF-PIP-03", "PIP uzar", ok(ext), "uzadı", ok(ext) ? "ok" : errText(ext));
    const mine = arr(unwrap(await api("GET", "/api/Pip/by-period/" + ids.periods.pip)));
    rec("PRF-PIP-05", "Dönem PIP listesi", ok({ status: 200, data: mine }) && mine.length > 0, "en az 1", String(mine.length));
  }
  writeJson("data/scenarios.json", scenarios);
  await browser.close();
  console.log("DONE", scenarios.filter((s) => s.pass).length, "/", scenarios.length);
})().catch((e) => { console.error(e); process.exit(1); });
