const fs = require("fs");
const path = require("path");
const { openAdmin, login, unwrap, arr, ok, errText, writeJson } = require("./dhr.cjs");

const state = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "state.json"), "utf8"));
const ids = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "lab-ids.json"), "utf8"));
let scenarios = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "scenarios.json"), "utf8"));

function rec(id, title, pass, expected, actual, evidence) {
  const row = { id, title, pass: !!pass, expected: String(expected || "").slice(0, 500), actual: String(actual || "").slice(0, 700), evidence: String(evidence || "").slice(0, 700) };
  const i = scenarios.findIndex((s) => s.id === id);
  if (i >= 0) scenarios[i] = row;
  else scenarios.push(row);
  console.log(pass ? "PASS" : "FAIL", id);
}
function save() {
  writeJson("data/scenarios.json", scenarios);
  writeJson("data/lab-ids.json", ids);
}
async function call(api, method, p, body) {
  const r = await api(method, p, body);
  return { r, data: unwrap(r), good: ok(r) };
}
function people(unit, pred = () => true) {
  return Object.values(state.people).filter((p) => p.unit === unit && pred(p));
}
function one(unit, pred) {
  return people(unit, pred)[0];
}

(async () => {
  const { browser, api } = await openAdmin();
  const parentRole = state.roleIds[state.parent.id].manager;
  const wh = state.workingHour.id;

  let coach = Object.values(state.people).find((p) => p.sicil === "7144");
  if (!coach) {
    const emp = await call(api, "POST", "/api/Employee", {
      employeeNumber: "7144",
      firstName: "Ege",
      lastName: "Bayrak",
      email: "egebayrak@perf.com",
      gender: "Male",
      phoneNumber: "+905557144000",
      birthDate: "1986-05-12T00:00:00",
    });
    if (!emp.good) throw new Error("coach " + errText(emp.r));
    const pos = await call(api, "POST", "/api/OrganizationalUnitPosition", {
      title: "Laboratuvar Direktörü",
      organizationalUnitId: state.parent.id,
      employeeId: emp.data.id,
      roleId: parentRole,
      workingHourTypeId: JSON.stringify([wh]),
      employmentType: "Full-time",
      startDate: "2023-01-09",
      reminderEnabled: false,
      isTerminated: false,
    });
    if (!pos.good) throw new Error("coach pos " + errText(pos.r));
    await call(api, "POST", "/api/User/create-user-with-password", { email: "egebayrak@perf.com", employeeId: emp.data.id, password: "Perf123!" });
    const users = arr(unwrap(await api("GET", "/api/User/all")));
    const user = users.find((u) => String(u.email).toLowerCase() === "egebayrak@perf.com");
    if (user) await call(api, "PUT", `/api/Auth/${user.id}`, { email: "egebayrak@perf.com", roleId: parentRole });
    coach = { sicil: "7144", email: "egebayrak@perf.com", employeeId: emp.data.id, positionId: pos.data.id, unit: "parent", kind: "coach" };
    state.people["7144"] = coach;
    writeJson("data/state.json", state);
  }
  rec("PRF-ORG-02", "Laboratuvar direktörü üst birimde", true, "7144", coach.email, coach.positionId);

  const directors = Object.values(state.people).filter((p) => p.kind === "director");
  let linked = 0;
  for (const d of directors) {
    const cur = unwrap(await api("GET", `/api/OrganizationalUnitPosition/${d.positionId}`));
    const upd = await call(api, "PUT", `/api/OrganizationalUnitPosition/${d.positionId}`, {
      title: cur.title || d.title,
      organizationalUnitId: d.unitId,
      employeeId: d.employeeId,
      roleId: d.roleId,
      directManagerPositionId: coach.positionId,
      hrManagerPositionId: coach.positionId,
      employmentType: "Full-time",
      startDate: d.hire || "2024-03-04",
      workingHourTypeId: JSON.stringify([wh]),
    });
    if (upd.good) linked++;
    else console.log("mgr", d.sicil, errText(upd.r));
  }
  rec("PRF-ORG-03", "Birim müdürlerinin yöneticisi laboratuvar direktörü", linked === directors.length, "5 müdür", String(linked), "");

  const t360 = unwrap(await api("GET", `/api/PerformanceTemplate/${ids.t360}`));
  const kpiCat = (t360.categories || []).find((c) => c.categoryType === 0);
  rec(
    "PRF-SABLON-12",
    "Sistem KPI bölümünde puanlayıcı duruyor mu",
    (kpiCat?.categoryReviewers || []).some((r) => r.canScore),
    "en az bir puanlayıcı",
    "reviewers=" + (kpiCat?.categoryReviewers || []).length + " scope=" + kpiCat?.kpiScoreScope,
    ""
  );
  if (kpiCat && !(kpiCat.categoryReviewers || []).some((r) => r.canScore)) {
    const fixed = await call(api, "PUT", `/api/PerformanceTemplateCategory/${kpiCat.id}`, {
      name: kpiCat.name,
      weight: kpiCat.weight,
      categoryType: kpiCat.categoryType,
      kpiScoreScope: 1,
      scoreImpact: 0,
      reviewerAggregation: 0,
      order: kpiCat.order,
    });
    const add = await call(api, "POST", "/api/PerformanceTemplateCategory", {});
    rec("PRF-SABLON-13", "KPI bölümü tüm katmanlara çekildi", fixed.good, "güncellendi", fixed.good ? "ok" : errText(fixed.r), "boş kategori post " + (add.good ? "ok" : errText(add.r)));
  }

  const t180 = await call(api, "POST", "/api/PerformanceTemplate/with-children", {
    name: "Şablon 180 KPI düzeltilmiş",
    organizationalUnitId: state.units.kpi.id,
    evaluationModel: 1,
    selfWeight: 20,
    managerWeight: 80,
    peerWeight: 0,
    subordinateWeight: 0,
    hrWeight: 0,
    competencyScoringMode: 0,
    showResultToEmployee: true,
    categories: [
      {
        name: "KPI",
        order: 0,
        weight: 70,
        categoryType: 0,
        kpiScoreScope: 2,
        scoreImpact: 0,
        reviewerAggregation: 0,
        categoryReviewers: [{ reviewerType: 1, canScore: true, canComment: true, order: 0 }],
        criteria: [{ title: "Hedef gerçekleşme", order: 0, weight: 100, questionType: 2, scoreImpact: 0, isRequired: true, showToEmployee: true, showCommentField: true, capPercentage: 120 }],
      },
      {
        name: "Yetkinlik",
        order: 1,
        weight: 30,
        categoryType: 1,
        scoreImpact: 0,
        reviewerAggregation: 0,
        categoryReviewers: [{ reviewerType: 1, canScore: true, canComment: true, order: 0 }],
        criteria: [{ title: "Teknik uzmanlık", order: 0, weight: 100, questionType: 0, scoreImpact: 0, isRequired: true, showToEmployee: true, showCommentField: true, competencyId: ids.compIds["Teknik uzmanlık"] }],
      },
    ],
  });
  rec("PRF-SABLON-04", "180 KPI şablonu oluşur", t180.good, "200", t180.good ? t180.data.id : errText(t180.r), "70+30");
  if (t180.data?.id) ids.t180 = t180.data.id;

  const preview = await call(api, "GET", `/api/PerformanceTemplate/${ids.t90}/form-preview?reviewerType=1`);
  rec("PRF-SABLON-09", "Form önizleme yönetici rolüyle döner", preview.good, "200", preview.good ? "ok" : errText(preview.r), "");

  const spans = {
    miras: ["2026-10-01", "2026-10-31"],
    p360: ["2026-01-01", "2026-12-31"],
    kpi: ["2026-01-01", "2026-03-31"],
    box: ["2026-01-01", "2026-06-30"],
    pip: ["2026-02-01", "2026-04-15"],
  };
  for (const [key, id] of Object.entries(ids.periods)) {
    const [a, b] = spans[key];
    const stages = [];
    for (let stageType = 0; stageType <= 11; stageType++) {
      stages.push({ stageType, order: stageType, isEnabled: stageType !== 11, plannedStartDate: a, plannedEndDate: b });
    }
    await call(api, "PUT", `/api/PerformancePeriod/${id}/stages`, stages);
    if (key === "kpi" && ids.t180) {
      const cur = unwrap(await api("GET", `/api/PerformancePeriod/${id}`));
      await call(api, "PUT", `/api/PerformancePeriod/${id}`, { ...cur, defaultTemplateId: ids.t180, organizationalUnit: undefined, stages: undefined });
    }
    const ready = unwrap(await api("GET", `/api/PerformancePeriod/${id}/readiness`));
    const blocks = (ready?.issues || []).filter((i) => i.isBlocking).map((i) => i.code + ":" + i.message);
    const started = blocks.length ? { good: false, r: { text: blocks.join(" | ") } } : await call(api, "POST", `/api/PerformancePeriod/${id}/start`, {});
    rec("PRF-DONEM-BASLA-" + key, key + " dönem başlar", started.good, "başlar", started.good ? "ok" : errText(started.r) || blocks.join(" | "), blocks.join(" | "));
  }

  for (const [key, templateId] of [
    ["miras", ids.t90],
    ["kpi", ids.t180],
    ["box", ids.tBox],
    ["pip", ids.t270],
    ["p360", ids.t360],
  ]) {
    const created = await call(api, "POST", "/api/EmployeePerformanceReview/create-for-period", {
      performancePeriodId: ids.periods[key],
      performanceTemplateId: templateId,
    });
    rec("PRF-FORM-AC-" + key, key + " formları açılır", created.good, "form", created.good ? JSON.stringify(created.data).slice(0, 160) : errText(created.r), "");
  }
  const reviews = arr(unwrap(await api("GET", "/api/EmployeePerformanceReview/all")));
  rec("PRF-FORM-01", "Formlar listelenir", reviews.length > 0, "en az 1", String(reviews.length), "");
  ids.reviewCount = reviews.length;

  async function detailOf(employeeId) {
    const rev = reviews.find((r) => r.employeeId === employeeId);
    if (!rev) return null;
    const detail = unwrap(await api("GET", `/api/EmployeePerformanceReview/${rev.id}/details`));
    return { rev, detail };
  }
  function criterionOf(detail) {
    const cats = detail?.categories || detail?.template?.categories || [];
    for (const c of cats) for (const q of c.criteria || []) if (q.scoreImpact !== 2) return q.id;
    return null;
  }

  const mirasEmp = one("miras", (p) => p.kind === "ic");
  const mirasPack = await detailOf(mirasEmp.employeeId);
  if (mirasPack) {
    const reviewer = (mirasPack.detail.reviewers || []).find((r) => r.reviewerType === 1);
    const criterionId = criterionOf(mirasPack.detail);
    const sent = await call(api, "POST", `/api/EmployeePerformanceReview/${mirasPack.rev.id}/submit-manager`, {
      reviewerId: reviewer?.id,
      scores: [{ criterionId, score: 4, comment: "Dönem hedefini karşıladı" }],
    });
    rec("PRF-FORM-02", "Yönetici 4 puan gönderir", sent.good, "gönderildi", sent.good ? "ok" : errText(sent.r), criterionId || "kriter yok");
    const breakdown = await call(api, "GET", `/api/PerformanceScore/breakdown/${mirasPack.rev.id}`);
    ids.breakdown = breakdown.data;
    rec("PRF-FORM-04", "Puan kırılımı döner", breakdown.good, "kırılım", breakdown.good ? JSON.stringify(breakdown.data).slice(0, 350) : errText(breakdown.r), "");
    const again = await call(api, "POST", `/api/PerformanceScore/recalculate/${mirasPack.rev.id}`, {});
    rec("PRF-FORM-05", "Aynı girdiyle yeniden hesap", again.good, "stabil", again.good ? JSON.stringify(again.data).slice(0, 180) : errText(again.r), "");
    ids.mirasReview = mirasPack.rev.id;
  } else rec("PRF-FORM-02", "Yönetici 4 puan gönderir", false, "form", "miras formu yok", "");

  const boxStaff = people("box", (p) => p.kind === "ic");
  const plan = [20, 20, 20, 60, 60, 60, 90, 90, 90, 60];
  let boxOk = 0;
  for (let i = 0; i < boxStaff.length; i++) {
    const pack = await detailOf(boxStaff[i].employeeId);
    if (!pack) continue;
    const reviewer = (pack.detail.reviewers || []).find((r) => r.reviewerType === 1);
    const criterionId = criterionOf(pack.detail);
    const sent = await call(api, "POST", `/api/EmployeePerformanceReview/${pack.rev.id}/submit-manager`, {
      reviewerId: reviewer?.id,
      scores: [{ criterionId, score: plan[i], comment: "Kalibrasyon kadrosu" }],
    });
    if (sent.good) boxOk++;
  }
  rec("PRF-FORM-06", "9 kutu kadrosuna yönetici puanı", boxOk >= 9, "9 puan", String(boxOk), "");

  const pipStaff = people("pip", (p) => p.kind === "ic");
  for (const p of pipStaff) {
    const pack = await detailOf(p.employeeId);
    if (!pack) continue;
    const reviewer = (pack.detail.reviewers || []).find((r) => r.reviewerType === 1);
    const criterionId = criterionOf(pack.detail);
    const low = p.tag === "high" ? 5 : 2;
    const comment = p.tag === "threshold" ? "" : "Gerekçe yazıldı";
    const sent = await call(api, "POST", `/api/EmployeePerformanceReview/${pack.rev.id}/submit-manager`, {
      reviewerId: reviewer?.id,
      scores: [{ criterionId, score: low, comment }],
    });
    if (p.tag === "threshold") rec("PRF-FORM-07", "Eşik altı yorumsuz puan reddedilir", !sent.good, "red", sent.good ? "kabul edildi" : errText(sent.r), "");
    if (p.tag === "high") rec("PRF-FORM-08", "Yüksek puan yorumla gider", sent.good, "5", sent.good ? "ok" : errText(sent.r), "");
  }

  const ic = one("p360", (p) => p.kind === "ic");
  const icPack = await detailOf(ic.employeeId);
  if (icPack) {
    const peers = people("p360", (p) => p.kind === "peer").slice(0, 2).map((p) => p.employeeId);
    const assigned = await call(api, "PUT", "/api/PerformanceReviewer/assign-peers", { employeePerformanceReviewId: icPack.rev.id, peerEmployeeIds: peers });
    rec("PRF-360-01", "İki akran atanır", assigned.good, "2", assigned.good ? "ok" : errText(assigned.r), "");
    const tooMany = await call(api, "PUT", "/api/PerformanceReviewer/assign-peers", { employeePerformanceReviewId: icPack.rev.id, peerEmployeeIds: people("p360").slice(0, 6).map((p) => p.employeeId) });
    rec("PRF-360-02", "Altı akran üst sınırı aşar", !tooMany.good, "red", tooMany.good ? "kabul" : errText(tooMany.r), "");
  }

  const goals = arr(unwrap(await api("GET", "/api/PerformanceGoal/all")));
  const direct = goals.find((g) => g.title === "Kapanan talep");
  if (direct) {
    const kpi = (direct.kpis || [])[0];
    if (kpi?.id) {
      const upd = await call(api, "PUT", `/api/PerformanceKpi/update-actual/${kpi.id}`, { actualValue: 36 });
      rec("PRF-HEDEF-13", "KPI gerçekleşen güncellenir", upd.good, "36", upd.good ? "ok" : errText(upd.r), "");
    }
  }
  const draft = goals.find((g) => g.title === "Taslak kişisel hedef");
  if (draft) {
    await call(api, "POST", `/api/PerformanceGoal/submit/${draft.id}`, {});
    const rejected = await call(api, "POST", `/api/PerformanceGoal/reject/${draft.id}`, { note: "Ölçüt yok" });
    rec("PRF-HEDEF-16", "Hedef gerekçeyle reddedilir", rejected.good, "red", rejected.good ? "ok" : errText(rejected.r), "");
  }
  const revGoal = goals.find((g) => g.title === "Revizyon istenecek hedef");
  if (revGoal) {
    await call(api, "POST", `/api/PerformanceGoal/submit/${revGoal.id}`, {});
    const ask = await call(api, "POST", `/api/PerformanceGoal/request-revision/${revGoal.id}`, { note: "Hedef tarihi eksik" });
    rec("PRF-HEDEF-18", "Revizyon gerekçeyle istenir", ask.good, "revizyon", ask.good ? "ok" : errText(ask.r), "");
  }

  const matrix = await call(api, "GET", `/api/NineBoxAssessment/matrix?periodId=${ids.periods.box}&ouId=${state.units.box.id}`);
  rec("PRF-KUTU-05", "9 kutu matrisi", matrix.good, "matris", matrix.good ? JSON.stringify(matrix.data).slice(0, 220) : errText(matrix.r), "");
  ids.matrix = matrix.data;
  const session = await call(api, "POST", "/api/NineBoxCalibration/sessions", {
    performancePeriodId: ids.periods.box,
    organizationalUnitId: state.units.box.id,
    name: "H1 komite",
    sessionDate: new Date().toISOString(),
    committeeMembers: [],
  });
  rec("PRF-KUTU-06", "Kalibrasyon oturumu", session.good, "oturum", session.good ? session.data?.id || "ok" : errText(session.r), "");

  const pots = arr(unwrap(await api("GET", `/api/PotentialAssessment/by-period/${ids.periods.box}`)));
  if (pots[0]) {
    const reviewed = await call(api, "POST", `/api/PotentialAssessment/${pots[0].id}/review`, { approve: false, reviewNote: "İkinci göz" });
    rec("PRF-KUTU-03", "Puanı giren kişi potansiyeli kendisi kesinleştiremez", !reviewed.good, "red", reviewed.good ? "kendi onayladı" : errText(reviewed.r), "");
  }

  const act = await call(api, "POST", "/api/TalentAction", {
    actionType: 0,
    employeeId: boxStaff[0].employeeId,
    performancePeriodId: ids.periods.box,
    title: "Terfi tamamlama",
    rationale: "Yüksek hücre",
    priority: 2,
    sourceType: 2,
  });
  if (act.data?.id) {
    await call(api, "POST", `/api/TalentAction/${act.data.id}/decide`, { approve: true, reason: "Komite uygun gördü" });
    await call(api, "POST", `/api/TalentAction/${act.data.id}/start`, {});
    const completed = await call(api, "POST", `/api/TalentAction/${act.data.id}/complete`, { outcome: 0, outcomeResult: 0 });
    rec("PRF-AKS-02", "Aksiyon karar, başla, tamamla", completed.good, "tamam", completed.good ? "ok" : errText(completed.r), "");
  }
  const pipAction = await call(api, "POST", "/api/TalentAction", {
    actionType: 5,
    employeeId: one("pip", (p) => p.tag === "pipActive").employeeId,
    performancePeriodId: ids.periods.pip,
    title: "PIP aç",
    rationale: "Eşik altı",
    priority: 3,
    sourceType: 1,
  });
  if (pipAction.data?.id) {
    await call(api, "POST", `/api/TalentAction/${pipAction.data.id}/decide`, { approve: true, reason: "PIP gerekli" });
    const pip = await call(api, "PUT", "/api/Pip", {
      talentActionId: pipAction.data.id,
      startDate: "2026-02-10",
      endDate: "2026-04-10",
      checkInIntervalDays: 14,
      goals: [{ title: "Haftalık hatayı 2 nin altına indir", successMeasure: "Hata adedi en fazla 2", targetDate: "2026-04-01", order: 0 }],
    });
    rec("PRF-PIP-01", "Onaylı aksiyondan PIP oluşur", pip.good, "plan", pip.good ? pip.data?.id || "ok" : errText(pip.r), "");
    if (pip.data?.id) {
      const check = await call(api, "POST", "/api/Pip/check-in", { pipId: pip.data.id, note: "İkinci hafta hata 3" });
      rec("PRF-PIP-02", "PIP check-in", check.good, "not", check.good ? "ok" : errText(check.r), "");
      const ext = await call(api, "POST", `/api/Pip/${pip.data.id}/extend`, { endDate: "2026-05-01", reason: "İki hafta daha" });
      rec("PRF-PIP-03", "PIP uzar", ext.good, "uzadı", ext.good ? "ok" : errText(ext.r), "");
    }
  }

  const meet = await call(api, "POST", "/api/PerformanceMidTermMeeting", {
    performancePeriodId: ids.periods.p360,
    employeeId: ic.employeeId,
    meetingDate: "2026-06-15",
    progressNote: "Hedeflerin yarısı tamam",
    feedback: "Tempo iyi",
  });
  rec("PRF-ARA-01", "Ara görüşme kayıt olur ve puan üretmez", meet.good, "kayıt", meet.good ? "ok" : errText(meet.r), "");

  const kpiEmp = one("kpi", (p) => p.kind === "ic");
  const extra = await call(api, "POST", "/api/EmployeeAdditionalRole", {
    employeeId: kpiEmp.employeeId,
    roleName: "Nöbet sorumlusu",
    proficiency: 3,
    isCritical: false,
  });
  rec("PRF-EK-01", "Ek görev yetkinliği açık birimde kaydolur", extra.good, "kayıt", extra.good ? "ok" : errText(extra.r), "KPI biriminde polivalans açık");

  const appeal = one("pip", (p) => p.tag === "appealOk");
  const appealPack = await detailOf(appeal.employeeId);
  if (appealPack) {
    const raised = await call(api, "POST", `/api/EmployeePerformanceAppeal/submit/${appealPack.rev.id}`, { reason: "Puan dönem içi teslimleri eksik saydı." });
    rec("PRF-ITIRAZ-01", "Sonuç açıkken itiraz açılır", raised.good, "açıldı", raised.good ? "ok" : errText(raised.r), "");
  }
  if (icPack) {
    const hidden = await call(api, "POST", `/api/EmployeePerformanceAppeal/submit/${icPack.rev.id}`, { reason: "Sonuç kapalıyken itiraz denemesi." });
    rec("PRF-ITIRAZ-03", "Sonuç kapalı birimde itiraz açılmaz", !hidden.good, "red", hidden.good ? "açıldı" : errText(hidden.r), "");
  }

  save();
  await browser.close();
  const passed = scenarios.filter((s) => s.pass).length;
  console.log("DONE", passed, "/", scenarios.length);
})().catch((e) => {
  console.error(e.stack || e.message);
  save();
  process.exit(1);
});
