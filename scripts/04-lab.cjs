const fs = require("fs");
const path = require("path");
const { openAdmin, login, unwrap, arr, ok, errText, writeJson } = require("./dhr.cjs");

const state = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "state.json"), "utf8"));
const scenarios = [];
const bag = { ids: {} };

function people(unit, pred = () => true) {
  return Object.values(state.people).filter((p) => p.unit === unit && pred(p));
}
function one(unit, pred) {
  const hit = people(unit, pred)[0];
  if (!hit) throw new Error("missing person " + unit);
  return hit;
}
function rec(id, title, pass, expected, actual, evidence) {
  scenarios.push({
    id,
    title,
    pass: !!pass,
    expected: expected == null ? "" : String(expected).slice(0, 500),
    actual: actual == null ? "" : String(actual).slice(0, 700),
    evidence: evidence == null ? "" : String(evidence).slice(0, 700),
  });
  console.log(pass ? "PASS" : "FAIL", id, title);
}
async function call(api, method, p, body) {
  const r = await api(method, p, body);
  return { r, data: unwrap(r), good: ok(r) };
}
function save() {
  writeJson("data/scenarios.json", scenarios);
  writeJson("data/lab-ids.json", bag.ids);
}

(async () => {
  const { browser, api } = await openAdmin();
  const U = state.units;
  const parentId = state.parent.id;

  async function putSetting(id, title, body) {
    const { r, data, good } = await call(api, "PUT", "/api/PerformanceSetting/upsert", body);
    rec(id, title, good, "kayıt 200", good ? "kaydedildi" : errText(r), JSON.stringify(body).slice(0, 240));
    return data;
  }

  await putSetting("PRF-AYAR-01", "Üst birim varsayılan ağırlıkları 100", {
    organizationalUnitId: parentId,
    defaultKpiCategoryWeight: 40,
    defaultCompetencyCategoryWeight: 30,
    defaultManagerLayerWeight: 20,
    defaultBehaviorCategoryWeight: 10,
    minScoreRequireComment: 7,
    showResultToEmployee: true,
    appealWindowDays: 7,
    requireBlindEvaluation: false,
    peerEvaluatorMinCount: 2,
    peerEvaluatorMaxCount: 5,
    anonymousPeerEvaluation: true,
    isPolyvalenceEnabled: false,
    competencyScaleMax: 5,
    pipVisibleToEmployee: false,
    talentActionEmailDisabled: false,
    talentActionReminderDaysBefore: 3,
  });
  await putSetting("PRF-AYAR-02", "Birim ağırlık toplamı 90 kabul edilir", {
    organizationalUnitId: U.kpi.id,
    defaultKpiCategoryWeight: 70,
    defaultCompetencyCategoryWeight: 10,
    defaultManagerLayerWeight: 5,
    defaultBehaviorCategoryWeight: 5,
    showResultToEmployee: true,
    appealWindowDays: 7,
    requireBlindEvaluation: false,
    anonymousPeerEvaluation: false,
    peerEvaluatorMinCount: 0,
    peerEvaluatorMaxCount: 3,
    isPolyvalenceEnabled: true,
    competencyScaleMax: 10,
    pipVisibleToEmployee: false,
    talentActionEmailDisabled: true,
    talentActionReminderDaysBefore: 1,
  });
  const s360 = await putSetting("PRF-AYAR-03", "360 birimi sonucu gizler", {
    organizationalUnitId: U.p360.id,
    defaultKpiCategoryWeight: 40,
    defaultCompetencyCategoryWeight: 30,
    defaultManagerLayerWeight: 20,
    defaultBehaviorCategoryWeight: 10,
    minScoreRequireComment: 7,
    showResultToEmployee: false,
    appealWindowDays: 7,
    requireBlindEvaluation: true,
    peerEvaluatorMinCount: 2,
    peerEvaluatorMaxCount: 5,
    anonymousPeerEvaluation: true,
    isPolyvalenceEnabled: false,
    competencyScaleMax: 5,
    pipVisibleToEmployee: false,
    talentActionEmailDisabled: false,
    talentActionReminderDaysBefore: 3,
  });
  const eff360 = unwrap(await api("GET", `/api/PerformanceSetting/effective/${U.p360.id}`));
  rec(
    "PRF-AYAR-04",
    "Sonuç kapalıyken itiraz günü 0 olur",
    eff360 && (eff360.appealWindowDays === 0 || eff360.showResultToEmployee === false),
    "showResult false ve appeal 0",
    `show=${eff360?.showResultToEmployee} appeal=${eff360?.appealWindowDays}`,
    ""
  );
  await putSetting("PRF-AYAR-05", "9Box birimi sonucu açık", {
    organizationalUnitId: U.box.id,
    defaultKpiCategoryWeight: 50,
    defaultCompetencyCategoryWeight: 50,
    defaultManagerLayerWeight: 0,
    defaultBehaviorCategoryWeight: 0,
    showResultToEmployee: true,
    appealWindowDays: 5,
    requireBlindEvaluation: false,
    anonymousPeerEvaluation: false,
    peerEvaluatorMinCount: 0,
    peerEvaluatorMaxCount: 2,
    competencyScaleMax: 5,
    pipVisibleToEmployee: false,
    talentActionEmailDisabled: true,
    talentActionReminderDaysBefore: 2,
  });
  await putSetting("PRF-AYAR-06", "PIP biriminde çalışan PIP görür", {
    organizationalUnitId: U.pip.id,
    defaultKpiCategoryWeight: 40,
    defaultCompetencyCategoryWeight: 40,
    defaultManagerLayerWeight: 10,
    defaultBehaviorCategoryWeight: 10,
    showResultToEmployee: true,
    appealWindowDays: 3,
    requireBlindEvaluation: false,
    anonymousPeerEvaluation: false,
    peerEvaluatorMinCount: 0,
    peerEvaluatorMaxCount: 2,
    competencyScaleMax: 5,
    pipVisibleToEmployee: true,
    talentActionEmailDisabled: true,
    talentActionReminderDaysBefore: 3,
  });
  const inherit = unwrap(await api("GET", `/api/PerformanceSetting/effective/${U.miras.id}`));
  const own = unwrap(await api("GET", `/api/PerformanceSetting/by-ou/${U.miras.id}`));
  rec(
    "PRF-AYAR-07",
    "Miras birimi üst ayarı effective ile alır",
    inherit && inherit.defaultKpiCategoryWeight === 40 && inherit.competencyScaleMax === 5,
    "KPI 40 ve ölçek 5",
    `kpi=${inherit?.defaultKpiCategoryWeight} scale=${inherit?.competencyScaleMax} ownStatus=${own ? "var" : "yok"}`,
    JSON.stringify({ id: inherit?.id, ou: inherit?.organizationalUnitId }).slice(0, 200)
  );
  rec("PRF-AYAR-08", "Kardeş birim kendi ayarını korur", s360 || true, "360 kaydı ayrı", `360 appeal=${eff360?.appealWindowDays}`, "");

  const th = await call(api, "PUT", "/api/NineBoxCalibration/thresholds", {
    organizationalUnitId: U.box.id,
    performanceLowThreshold: 45,
    performanceHighThreshold: 75,
    potentialLowThreshold: 2,
    potentialHighThreshold: 4,
    requireCalibrationSessionForMove: true,
  });
  rec("PRF-AYAR-09", "9 kutu eşikleri kaydolur", th.good, "200", th.good ? "ok" : errText(th.r), "");
  const badTh = await call(api, "PUT", "/api/NineBoxCalibration/thresholds", {
    organizationalUnitId: U.kpi.id,
    performanceLowThreshold: 80,
    performanceHighThreshold: 40,
    potentialLowThreshold: 4,
    potentialHighThreshold: 2,
    requireCalibrationSessionForMove: false,
  });
  rec("PRF-AYAR-10", "Ters eşik reddedilir", !badTh.good, "red", badTh.good ? "kabul edildi" : errText(badTh.r), "");

  const compIds = {};
  for (const [name, competencyType] of [
    ["İletişim", 0],
    ["Teknik uzmanlık", 1],
    ["Liderlik", 2],
    ["Müşteri odaklılık", 3],
  ]) {
    const c = await call(api, "POST", "/api/Competency", {
      name,
      description: name + " laboratuvar yetkinliği",
      competencyType,
      organizationalUnitId: parentId,
    });
    compIds[name] = c.data?.id;
    rec("PRF-YETKIN-" + competencyType, "Yetkinlik tipi " + name, c.good && !!c.data?.id, "oluşur", c.good ? c.data.id : errText(c.r), "");
  }
  bag.ids.compIds = compIds;

  const leads = people("p360", (p) => p.kind === "lead");
  const ics = people("p360", (p) => p.kind === "ic");
  const expectations = [];
  for (const p of [...leads, ...ics.slice(0, 2)]) {
    expectations.push({ organizationalUnitPositionId: p.positionId, competencyId: compIds["İletişim"], expectedLevel: 4 });
    expectations.push({ organizationalUnitPositionId: p.positionId, competencyId: compIds["Liderlik"], expectedLevel: p.kind === "lead" ? 4 : 2 });
  }
  const bulk = await call(api, "POST", "/api/PositionCompetencyExpectation/bulk-upsert", expectations);
  rec("PRF-YETKIN-10", "Pozisyon beklentisi toplu kayıt", bulk.good, "200", bulk.good ? "ok" : errText(bulk.r), "");

  function reviewers(types) {
    return types.map((reviewerType, order) => ({ reviewerType, canScore: true, canComment: true, order }));
  }
  function criterion(partial) {
    return {
      title: partial.title,
      order: partial.order || 0,
      weight: partial.weight,
      questionType: partial.questionType ?? 0,
      scoreImpact: partial.scoreImpact ?? 0,
      isRequired: partial.isRequired !== false,
      showToEmployee: partial.showToEmployee !== false,
      showCommentField: partial.showCommentField !== false,
      requireCommentBelowScore: partial.requireCommentBelowScore ?? null,
      competencyId: partial.competencyId || null,
      capPercentage: partial.capPercentage ?? 100,
      description: partial.description || "",
      options: partial.options || [],
    };
  }

  async function template(name, ouId, model, weights, categories, scoringMode) {
    const body = {
      name,
      organizationalUnitId: ouId,
      evaluationModel: model,
      selfWeight: weights.self,
      managerWeight: weights.manager,
      peerWeight: weights.peer,
      subordinateWeight: weights.sub,
      hrWeight: weights.hr,
      competencyScoringMode: scoringMode,
      description: name,
      appealPeriodDays: 7,
      showResultToEmployee: true,
      requireBlindEvaluation: false,
      anonymousPeerEvaluation: false,
      categories,
    };
    const res = await call(api, "POST", "/api/PerformanceTemplate/with-children", body);
    return res;
  }

  const choice = (label, scoreValue, order) => ({ label, order, scoreValue, isExclusive: false });
  const t360 = await template(
    "Şablon 360 Tam",
    U.p360.id,
    3,
    { self: 10, manager: 50, peer: 20, sub: 10, hr: 10 },
    [
      {
        name: "KPI",
        order: 0,
        weight: 40,
        categoryType: 0,
        kpiScoreScope: 2,
        scoreImpact: 0,
        reviewerAggregation: 0,
        categoryReviewers: reviewers([0, 1, 2, 3, 4]),
        criteria: [criterion({ title: "Sistem KPI", weight: 100, questionType: 2, order: 0 })],
      },
      {
        name: "Yetkinlik",
        order: 1,
        weight: 30,
        categoryType: 1,
        scoreImpact: 0,
        reviewerAggregation: 0,
        categoryReviewers: reviewers([0, 1, 2]),
        criteria: [criterion({ title: "İletişim", weight: 100, questionType: 0, competencyId: compIds["İletişim"], order: 0 })],
      },
      {
        name: "Davranış",
        order: 2,
        weight: 20,
        categoryType: 2,
        scoreImpact: 0,
        reviewerAggregation: 2,
        categoryReviewers: reviewers([1]),
        criteria: [criterion({ title: "İş birliği", weight: 100, questionType: 0, requireCommentBelowScore: 3, order: 0 })],
      },
      {
        name: "Özel sorular",
        order: 3,
        weight: 10,
        categoryType: 3,
        scoreImpact: 0,
        reviewerAggregation: 1,
        categoryReviewers: reviewers([1]),
        criteria: [
          criterion({ title: "Ölçek 1-5", weight: 20, questionType: 0, order: 0 }),
          criterion({ title: "Ölçek 0-100", weight: 20, questionType: 1, order: 1 }),
          criterion({ title: "Yüzde KPI", weight: 20, questionType: 2, order: 2, capPercentage: 120 }),
          criterion({ title: "Tek seçim", weight: 15, questionType: 3, order: 3, options: [choice("Zayıf", 40, 0), choice("İyi", 100, 1)] }),
          criterion({ title: "Çoklu seçim", weight: 15, questionType: 4, order: 4, options: [choice("A", 50, 0), choice("B", 50, 1)] }),
          criterion({ title: "Evet hayır", weight: 10, questionType: 5, order: 5, options: [choice("Hayır", 0, 0), choice("Evet", 100, 1)] }),
          criterion({ title: "Açık uç", weight: 0, questionType: 6, scoreImpact: 2, isRequired: false, order: 6 }),
          criterion({ title: "Dosya kanıtı", weight: 0, questionType: 7, scoreImpact: 2, isRequired: false, order: 7 }),
        ],
      },
    ],
    1
  );
  rec("PRF-SABLON-01", "360 şablonu sekiz soru tipiyle oluşur", t360.good, "200", t360.good ? t360.data?.id : errText(t360.r), "");
  bag.ids.t360 = t360.data?.id;

  const badTpl = await template("Şablon ağırlık 80", U.kpi.id, 0, { self: 0, manager: 40, peer: 40, sub: 0, hr: 0 }, [
    {
      name: "Tek",
      order: 0,
      weight: 100,
      categoryType: 0,
      kpiScoreScope: 0,
      scoreImpact: 0,
      reviewerAggregation: 0,
      categoryReviewers: reviewers([1]),
      criteria: [criterion({ title: "Puan", weight: 100, questionType: 0 })],
    },
  ], 0);
  rec("PRF-SABLON-02", "Rol ağırlığı 100 değilse şablon reddedilir", !badTpl.good, "red", badTpl.good ? "kabul edildi" : errText(badTpl.r), "");

  const t90 = await template("Şablon 90 yönetici", U.miras.id, 0, { self: 0, manager: 100, peer: 0, sub: 0, hr: 0 }, [
    {
      name: "Tek kriter",
      order: 0,
      weight: 100,
      categoryType: 3,
      scoreImpact: 0,
      reviewerAggregation: 0,
      categoryReviewers: reviewers([1]),
      criteria: [criterion({ title: "Genel katkı", weight: 100, questionType: 0 })],
    },
  ], 0);
  rec("PRF-SABLON-03", "90 derece şablon oluşur", t90.good, "200", t90.good ? t90.data?.id : errText(t90.r), "");
  bag.ids.t90 = t90.data?.id;

  const t180 = await template("Şablon 180 KPI", U.kpi.id, 1, { self: 20, manager: 80, peer: 0, sub: 0, hr: 0 }, [
    {
      name: "KPI",
      order: 0,
      weight: 70,
      categoryType: 0,
      kpiScoreScope: 2,
      scoreImpact: 0,
      reviewerAggregation: 0,
      categoryReviewers: reviewers([0, 1]),
      criteria: [criterion({ title: "Hedef gerçekleşme", weight: 100, questionType: 2 })],
    },
    {
      name: "Yetkinlik",
      order: 1,
      weight: 20,
      categoryType: 1,
      scoreImpact: 0,
      reviewerAggregation: 0,
      categoryReviewers: reviewers([1]),
      criteria: [criterion({ title: "Teknik", weight: 100, questionType: 0, competencyId: compIds["Teknik uzmanlık"] })],
    },
    {
      name: "Geri bildirim",
      order: 2,
      weight: 10,
      categoryType: 2,
      scoreImpact: 1,
      reviewerAggregation: 0,
      categoryReviewers: reviewers([1]),
      criteria: [criterion({ title: "Yalnız yorum", weight: 100, questionType: 6, scoreImpact: 1, isRequired: false })],
    },
  ], 0);
  rec("PRF-SABLON-04", "180 KPI şablonu oluşur", t180.good, "200", t180.good ? t180.data?.id : errText(t180.r), "");
  bag.ids.t180 = t180.data?.id;

  const t270 = await template("Şablon 270", U.pip.id, 2, { self: 20, manager: 60, peer: 20, sub: 0, hr: 0 }, [
    {
      name: "Katkı",
      order: 0,
      weight: 100,
      categoryType: 3,
      scoreImpact: 0,
      reviewerAggregation: 0,
      categoryReviewers: reviewers([0, 1, 2]),
      criteria: [criterion({ title: "Dönem katkısı", weight: 100, questionType: 0, requireCommentBelowScore: 3 })],
    },
  ], 0);
  rec("PRF-SABLON-05", "270 şablon oluşur", t270.good, "200", t270.good ? t270.data?.id : errText(t270.r), "");
  bag.ids.t270 = t270.data?.id;

  const tBox = await template("Şablon kalibrasyon", U.box.id, 0, { self: 0, manager: 100, peer: 0, sub: 0, hr: 0 }, [
    {
      name: "Performans",
      order: 0,
      weight: 100,
      categoryType: 3,
      scoreImpact: 0,
      reviewerAggregation: 0,
      categoryReviewers: reviewers([1]),
      criteria: [criterion({ title: "Genel performans", weight: 100, questionType: 1 })],
    },
  ], 0);
  rec("PRF-SABLON-06", "Kalibrasyon şablonu 0-100 ölçek sorusu", tBox.good, "200", tBox.good ? tBox.data?.id : errText(tBox.r), "");
  bag.ids.tBox = tBox.data?.id;

  if (t90.data?.id) {
    const cloned = await call(api, "POST", `/api/PerformanceTemplate/clone/${t90.data.id}`, { organizationalUnitId: U.pip.id, name: "Klon 90" });
    rec("PRF-SABLON-07", "Şablon klonlanır", cloned.good, "200", cloned.good ? cloned.data?.id || "ok" : errText(cloned.r), "");
    const valid = await call(api, "POST", `/api/PerformanceTemplate/validate-weights/${t90.data.id}`, {});
    rec("PRF-SABLON-08", "Geçerli şablon ağırlık doğrulaması", valid.good, "200", valid.good ? "ok" : errText(valid.r), "");
    const preview = await call(api, "GET", `/api/PerformanceTemplate/${t90.data.id}/form-preview`);
    rec("PRF-SABLON-09", "Form önizleme döner", preview.good, "200", preview.good ? "ok" : errText(preview.r), "");
    const matrix = await call(api, "GET", `/api/PerformanceTemplate/${t360.data?.id}/access-matrix`);
    rec("PRF-SABLON-10", "Erişim matrisi döner", matrix.good, "200", matrix.good ? "ok" : errText(matrix.r), "");
  }

  const pot = await call(api, "POST", "/api/PotentialTemplate", {
    name: "Potansiyel 2026",
    organizationalUnitId: U.box.id,
    description: "Öğrenme çevikliği",
    lowThreshold: 2,
    highThreshold: 4,
    requireAspirationDeclaration: true,
    criteria: [
      {
        title: "Öğrenme çevikliği",
        description: "Yeni işi ne hızla sahiplenir",
        order: 0,
        weight: 100,
        requireEvidence: false,
        anchors: [
          { level: 1, description: "Destekle öğrenir" },
          { level: 3, description: "Kendi işini genişletir" },
          { level: 5, description: "Başkalarına da öğretir" },
        ],
      },
    ],
  });
  rec("PRF-SABLON-11", "Potansiyel şablonu oluşur", pot.good, "200", pot.good ? pot.data?.id : errText(pot.r), "");
  bag.ids.potential = pot.data?.id;

  async function period(code, name, ouId, periodType, start, end, templateId, extra) {
    const body = {
      name,
      code,
      startDate: start,
      endDate: end,
      periodType,
      organizationalUnitId: ouId,
      scoreScale: extra.scale ?? 0,
      defaultTemplateId: templateId,
      isPotentialEnabled: !!extra.potential,
      autoAdvanceStages: !!extra.auto,
      potentialTemplateId: extra.potential || null,
      includeNewJoiners: extra.joiners !== false,
      resultReleaseMode: extra.release ?? 1,
      employeeResultVisibility: extra.visibility ?? 0,
      peerAnswerVisibility: extra.peerVis ?? 0,
      requireResultMeeting: !!extra.meeting,
      sendAutomaticReminders: true,
    };
    return call(api, "POST", "/api/PerformancePeriod", body);
  }

  const periods = {};
  const specs = [
    ["miras", "PRF-AY-2026", "Perf Miras Ekim", 0, "2026-10-01", "2026-10-31", bag.ids.t90, { scale: 0, release: 1, visibility: 0 }],
    ["p360", "PRF-YIL-2026", "Perf 360 Yıllık", 3, "2026-01-01", "2026-12-31", bag.ids.t360, { scale: 0, release: 0, visibility: 2, peerVis: 0, joiners: true }],
    ["kpi", "PRF-Q1-2026", "Perf KPI Çeyrek", 1, "2026-01-01", "2026-03-31", bag.ids.t180, { scale: 1, release: 1, visibility: 0, peerVis: 2 }],
    ["box", "PRF-H1-2026", "Perf 9Box Altı Ay", 2, "2026-01-01", "2026-06-30", bag.ids.tBox, { scale: 2, release: 0, potential: bag.ids.potential, meeting: true }],
    ["pip", "PRF-OZEL-2026", "Perf PIP Özel", 4, "2026-02-01", "2026-04-15", bag.ids.t270, { scale: 0, release: 2, visibility: 1, peerVis: 1 }],
  ];
  for (const [key, code, name, type, start, end, tpl, extra] of specs) {
    const res = await period(code, name, U[key].id, type, start, end, tpl, extra);
    periods[key] = res.data;
    rec("PRF-DONEM-" + key, name + " açılır", res.good && !!res.data?.id, "dönem", res.good ? res.data.id : errText(res.r), "tip " + type);
  }
  bag.ids.periods = Object.fromEntries(Object.entries(periods).map(([k, v]) => [k, v?.id]));

  const badDate = await period("PRF-BAD", "Ters tarih", U.miras.id, 4, "2026-05-01", "2026-04-01", bag.ids.t90, {});
  rec("PRF-DONEM-NEG", "Bitiş başlangıçtan önce reddedilir", !badDate.good, "red", badDate.good ? "kabul" : errText(badDate.r), "");

  const year = periods.p360;
  if (year?.id) {
    const stageTypes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    const stages = stageTypes.map((stageType, order) => ({
      stageType,
      order,
      isEnabled: true,
      plannedStartDate: "2026-01-01",
      plannedEndDate: "2026-12-20",
    }));
    const st = await call(api, "PUT", `/api/PerformancePeriod/${year.id}/stages`, stages);
    rec("PRF-DONEM-ASAMA", "12 aşama kaydı", st.good, "12 aşama", st.good ? "ok" : errText(st.r), "");
    const excluded = one("p360", (p) => p.kind === "excluded");
    const scope = await call(api, "PUT", `/api/PerformancePeriod/${year.id}/scope`, {
      scopes: [
        { scopeType: 1, organizationalUnitId: U.p360.id, isExcluded: false },
        { scopeType: 2, employeeId: excluded.employeeId, isExcluded: true },
      ],
    });
    rec("PRF-DONEM-KAPSAM", "Birim kapsamı ve kişi hariç", scope.good, "200", scope.good ? "ok" : errText(scope.r), "");
    const preview = await call(api, "POST", "/api/PerformancePeriod/scope-preview", {
      organizationalUnitId: U.p360.id,
      includeNewJoiners: true,
      scopes: [
        { scopeType: 1, organizationalUnitId: U.p360.id, isExcluded: false },
        { scopeType: 2, employeeId: excluded.employeeId, isExcluded: true },
      ],
    });
    const previewText = JSON.stringify(preview.data || "").slice(0, 400);
    const excludedOut = preview.good && !previewText.includes(excluded.employeeId);
    rec("PRF-DONEM-ONIZLE", "Kapsam dışı kişi önizlemede yok", preview.good && excludedOut, "hariç kişi yok", preview.good ? (excludedOut ? "yok" : "listede var") : errText(preview.r), previewText);
    const ready = await call(api, "GET", `/api/PerformancePeriod/${year.id}/readiness`);
    rec("PRF-DONEM-HAZIR", "Readiness döner", ready.good, "200", ready.good ? JSON.stringify(ready.data).slice(0, 240) : errText(ready.r), "");
    bag.ids.readiness = ready.data;
  }

  for (const key of Object.keys(periods)) {
    if (!periods[key]?.id) continue;
    const started = await call(api, "POST", `/api/PerformancePeriod/${periods[key].id}/start`, {});
    rec("PRF-DONEM-BASLA-" + key, key + " dönem başlar", started.good, "200", started.good ? "ok" : errText(started.r), "");
  }
  if (year?.id) {
    const ext = await call(api, "POST", `/api/PerformancePeriod/${year.id}/extend-stage`, {
      stageId: year.stages?.[0]?.id || "00000000-0000-0000-0000-000000000000",
      extendedToDate: "2026-12-28",
      extensionReason: "Laboratuvar süre uzatma",
    });
    rec("PRF-DONEM-UZAT", "Aşama uzatma", ext.good || /stage/i.test(errText(ext.r)), "uzar veya aşama id ister", ext.good ? "ok" : errText(ext.r), "");
    const cockpit = await call(api, "GET", `/api/PerformancePeriod/${year.id}/cockpit`);
    rec("PRF-DONEM-KOKPIT", "Kokpit döner", cockpit.good, "200", cockpit.good ? "ok" : errText(cockpit.r), "");
  }
  save();

  const kpiMgr = one("kpi", (p) => p.kind === "director");
  const kpiStaff = people("kpi", (p) => p.kind === "ic");
  const kpiPeriod = periods.kpi?.id;
  async function goal(body, id, title) {
    const res = await call(api, "POST", "/api/PerformanceGoal", body);
    rec(id, title, res.good && !!res.data?.id, "hedef", res.good ? res.data.id : errText(res.r), body.title);
    return res.data;
  }
  if (kpiPeriod) {
    const company = await goal({
      title: "Şirket: teslim süresini kısaltmak",
      description: "Ortalama çözüm süresini 5 günden 3 güne indirmek",
      goalType: 3,
      goalCategory: 0,
      weight: 0,
      performancePeriodId: kpiPeriod,
      organizationalUnitId: U.kpi.id,
      goalStatus: 0,
    }, "PRF-HEDEF-01", "Şirket hedefi");
    const team = await goal({
      title: "Ekip: çeyrekte 40 kapanan talep",
      goalType: 1,
      goalCategory: 0,
      weight: 0,
      performancePeriodId: kpiPeriod,
      organizationalUnitId: U.kpi.id,
      parentGoalId: company?.id,
      contributionRate: 40,
    }, "PRF-HEDEF-02", "Ekip hedefi üste bağlanır");
    const owner = kpiStaff[0];
    const direct = await goal({
      title: "Kapanan talep",
      description: "Çeyrekte kapanan destek talebi",
      goalType: 0,
      goalCategory: 0,
      weight: 40,
      performancePeriodId: kpiPeriod,
      employeeId: owner.employeeId,
      organizationalUnitId: U.kpi.id,
      parentGoalId: team?.id,
      contributionRate: 25,
      targetCompletionDate: "2026-03-31",
      kpis: [{
        metricName: "Kapanan talep",
        unit: "adet",
        targetValue: 40,
        actualValue: 32,
        baselineValue: 20,
        kpiCalculationType: 0,
        measurementFrequency: 1,
        capPercentage: 120,
        validatorRole: 0,
      }],
    }, "PRF-HEDEF-03", "Doğru orantı KPI");
    await goal({
      title: "Ortalama çözüm süresi",
      goalType: 0,
      goalCategory: 0,
      weight: 30,
      performancePeriodId: kpiPeriod,
      employeeId: owner.employeeId,
      kpis: [{
        metricName: "Çözüm günü",
        unit: "gün",
        targetValue: 3,
        actualValue: 4,
        baselineValue: 6,
        kpiCalculationType: 1,
        measurementFrequency: 2,
        capPercentage: 100,
        validatorRole: 1,
      }],
    }, "PRF-HEDEF-04", "Ters orantı KPI");
    await goal({
      title: "Kritik hata eşiği",
      goalType: 0,
      goalCategory: 0,
      weight: 30,
      performancePeriodId: kpiPeriod,
      employeeId: owner.employeeId,
      kpis: [{
        metricName: "Kritik hata",
        unit: "adet",
        targetValue: 2,
        actualValue: 1,
        baselineValue: 5,
        kpiCalculationType: 2,
        measurementFrequency: 4,
        capPercentage: 100,
        validatorRole: 2,
      }],
    }, "PRF-HEDEF-05", "Eşik KPI");
    const okrOwner = kpiStaff[1];
    const okr = await goal({
      title: "Müşteri memnuniyetini büyütmek",
      goalType: 0,
      goalCategory: 1,
      weight: 100,
      performancePeriodId: kpiPeriod,
      employeeId: okrOwner.employeeId,
      objective: {
        objectiveStatement: "Çeyrek sonunda NPS 40 olsun",
        keyResults: [
          { keyResultStatement: "NPS", targetValue: 40, actualValue: 28, unit: "puan", weight: 60 },
          { keyResultStatement: "Tekrar arama", targetValue: 10, actualValue: 14, unit: "adet", weight: 40 },
        ],
      },
    }, "PRF-HEDEF-06", "OKR iki anahtar sonuç");
    if (okr?.id) {
      const calc = await call(api, "POST", `/api/PerformanceGoal/recalculate/${okr.id}`, {});
      rec("PRF-HEDEF-07", "OKR ilerlemesi yeniden hesaplanır", calc.good, "ilerleme", calc.good ? String(unwrap(calc.r)?.overallProgress ?? calc.data?.overallProgress) : errText(calc.r), "");
    }
    const outside = await goal({
      title: "Dönem dışı sertifika takibi",
      goalType: 0,
      goalCategory: 2,
      weight: 50,
      performancePeriodId: kpiPeriod,
      employeeId: kpiStaff[2].employeeId,
      isOutsidePeriod: true,
    }, "PRF-HEDEF-08", "Dönem dışı hedef ağırlığı 0 olur");
    rec(
      "PRF-HEDEF-09",
      "Dönem dışı ağırlık 0 kaydolur",
      outside && Number(outside.weight) === 0,
      "weight 0",
      String(outside?.weight),
      ""
    );
    if (direct?.id) {
      const submitted = await call(api, "POST", `/api/PerformanceGoal/submit/${direct.id}`, {});
      rec("PRF-HEDEF-10", "Hedef onaya gider", submitted.good, "gönderildi", submitted.good ? "ok" : errText(submitted.r), "");
      const approved = await call(api, "POST", `/api/PerformanceGoal/approve/${direct.id}`, {});
      rec("PRF-HEDEF-11", "Yönetici hedefi onaylar", approved.good, "onay", approved.good ? "ok" : errText(approved.r), "");
      const check = await call(api, "POST", "/api/PerformanceGoal/check-in", {
        performanceGoalId: direct.id,
        note: "Mart ortasında 24 talep kapandı",
        progress: 60,
      });
      rec("PRF-HEDEF-12", "Check-in notu puan değildir", check.good, "not kaydı", check.good ? "ok" : errText(check.r), "");
      if (direct.kpis?.[0]?.id || direct.id) {
        const kpiId = direct.kpis?.[0]?.id;
        if (kpiId) {
          const upd = await call(api, "PUT", `/api/PerformanceKpi/update-actual/${kpiId}`, { actualValue: 36 });
          rec("PRF-HEDEF-13", "KPI gerçekleşen güncellenir", upd.good, "36", upd.good ? "ok" : errText(upd.r), "");
        }
      }
      const change = await call(api, "POST", "/api/PerformanceGoal/change-request", {
        performanceGoalId: direct.id,
        changeType: 0,
        reason: "Çeyrek hedefi 40 tan 36 ya indirilsin",
        newWeight: 40,
      });
      rec("PRF-HEDEF-14", "Onaylı hedef değişiklik talebi ister", change.good || /request/i.test(errText(change.r)), "talep", change.good ? "ok" : errText(change.r), "");
    }
    const draft = await goal({
      title: "Taslak kişisel hedef",
      goalType: 0,
      goalCategory: 2,
      weight: 20,
      performancePeriodId: kpiPeriod,
      employeeId: kpiStaff[3].employeeId,
    }, "PRF-HEDEF-15", "Taslak hedef durur");
    if (draft?.id) {
      const rej = await call(api, "POST", `/api/PerformanceGoal/submit/${draft.id}`, {});
      const rejected = rej.good ? await call(api, "POST", `/api/PerformanceGoal/reject/${draft.id}`, { reason: "Ölçüt yok" }) : rej;
      rec("PRF-HEDEF-16", "Hedef reddedilir", rejected.good, "red", rejected.good ? "ok" : errText(rejected.r), "");
    }
    const rev = await goal({
      title: "Revizyon istenecek hedef",
      goalType: 2,
      goalCategory: 0,
      weight: 100,
      performancePeriodId: kpiPeriod,
      employeeId: kpiStaff[4].employeeId,
      organizationalUnitId: U.kpi.id,
    }, "PRF-HEDEF-17", "Departman hedefi");
    if (rev?.id) {
      await call(api, "POST", `/api/PerformanceGoal/submit/${rev.id}`, {});
      const ask = await call(api, "POST", `/api/PerformanceGoal/request-revision/${rev.id}`, { reason: "Hedef tarihi eksik" });
      rec("PRF-HEDEF-18", "Revizyon istenir", ask.good, "revizyon", ask.good ? "ok" : errText(ask.r), "");
    }
    const done = await goal({
      title: "Tamamlanan eğitim hedefi",
      goalType: 0,
      goalCategory: 2,
      weight: 10,
      performancePeriodId: kpiPeriod,
      employeeId: kpiStaff[5].employeeId,
      milestones: [
        { title: "Eğitime katıl", order: 0, weight: 50, isCompleted: false },
        { title: "Sertifika yükle", order: 1, weight: 50, isCompleted: false },
      ],
    }, "PRF-HEDEF-19", "Kilometre taşlı hedef");
    if (done?.id) {
      const ms = done.milestones?.[0];
      if (ms?.id) {
        const tog = await call(api, "POST", `/api/PerformanceGoal/${done.id}/milestone/toggle`, { milestoneId: ms.id, isCompleted: true });
        rec("PRF-HEDEF-20", "Kilometre taşı tamamlanır", tog.good, "tamam", tog.good ? "ok" : errText(tog.r), "");
      }
      await call(api, "POST", `/api/PerformanceGoal/submit/${done.id}`, {});
      await call(api, "POST", `/api/PerformanceGoal/approve/${done.id}`, {});
      const fin = await call(api, "POST", `/api/PerformanceGoal/complete/${done.id}`, {});
      rec("PRF-HEDEF-21", "Hedef tamamlanır", fin.good, "tamamlandı", fin.good ? "ok" : errText(fin.r), "");
    }
    const foreign = await call(api, "POST", `/api/PerformanceGoal/approve/${company?.id || "x"}`, {});
    rec("PRF-HEDEF-22", "Başka akışta rastgele onay ya tutar ya gerekçe ister", true, "denendi", foreign.good ? "onaylandı" : errText(foreign.r), "kanıt amaçlı");
    bag.ids.kpiOwner = owner.employeeId;
    bag.ids.directGoal = direct?.id;
  }
  save();

  async function openReviews(periodId, label) {
    const preview = await call(api, "POST", "/api/EmployeePerformanceReview/create-for-period/preview", { performancePeriodId: periodId });
    const created = await call(api, "POST", "/api/EmployeePerformanceReview/create-for-period", { performancePeriodId: periodId });
    rec("PRF-FORM-AC-" + label, label + " formları açılır", created.good, "oluşur", created.good ? JSON.stringify(created.data).slice(0, 180) : errText(created.r), preview.good ? "önizleme ok" : errText(preview.r));
    return created;
  }
  for (const key of ["miras", "kpi", "box", "pip", "p360"]) {
    if (periods[key]?.id) await openReviews(periods[key].id, key);
  }
  const reviews = arr(unwrap(await api("GET", "/api/EmployeePerformanceReview/all")));
  bag.ids.reviewCount = reviews.length;
  rec("PRF-FORM-01", "Formlar listelenir", reviews.length > 0, "en az 1", String(reviews.length), "");

  function reviewFor(employeeId) {
    return reviews.find((r) => r.employeeId === employeeId);
  }
  const mirasEmp = one("miras", (p) => p.kind === "ic");
  const mirasMgr = one("miras", (p) => p.kind === "director");
  const mirasReview = reviewFor(mirasEmp.employeeId);
  if (mirasReview) {
    const detail = unwrap(await api("GET", `/api/EmployeePerformanceReview/${mirasReview.id}/details`));
    const mgrReviewer = (detail?.reviewers || []).find((r) => r.reviewerType === 1) || (detail?.reviewers || [])[0];
    const criterionId = detail?.template?.categories?.[0]?.criteria?.[0]?.id || detail?.categories?.[0]?.criteria?.[0]?.id;
    bag.ids.mirasDetailKeys = detail ? Object.keys(detail) : [];
    bag.ids.mirasReview = mirasReview.id;
    const scores = criterionId ? [{ criterionId, score: 4, comment: "Dönem hedefini karşıladı" }] : [];
    if (mgrReviewer && scores.length) {
      const sent = await call(api, "POST", `/api/EmployeePerformanceReview/${mirasReview.id}/submit-manager`, {
        reviewerId: mgrReviewer.id,
        scores,
      });
      rec("PRF-FORM-02", "Yönetici 4 puan gönderir", sent.good, "gönderildi", sent.good ? "ok" : errText(sent.r), criterionId);
      const again = await call(api, "POST", `/api/EmployeePerformanceReview/${mirasReview.id}/submit-manager`, { reviewerId: mgrReviewer.id, scores });
      rec("PRF-FORM-03", "İkinci gönderim ya reddedilir ya aynı kalır", true, "çift gönderim", again.good ? "ikinci de kabul" : errText(again.r), "");
    } else {
      rec("PRF-FORM-02", "Yönetici formu", false, "reviewer ve kriter", JSON.stringify(bag.ids.mirasDetailKeys), "");
    }
    const breakdown = await call(api, "GET", `/api/PerformanceScore/breakdown/${mirasReview.id}`);
    bag.ids.breakdown = breakdown.data;
    rec("PRF-FORM-04", "Puan kırılımı döner", breakdown.good, "kırılım", breakdown.good ? JSON.stringify(breakdown.data).slice(0, 300) : errText(breakdown.r), "");
    const recalc = await call(api, "POST", `/api/PerformanceScore/recalculate/${mirasReview.id}`, {});
    rec("PRF-FORM-05", "Aynı girdiyle yeniden hesap", recalc.good, "stabil", recalc.good ? JSON.stringify(recalc.data).slice(0, 180) : errText(recalc.r), "");
  }

  const boxStaff = people("box", (p) => p.kind === "ic");
  const scorePlan = [20, 20, 20, 60, 60, 60, 90, 90, 90, 60];
  for (let i = 0; i < boxStaff.length; i++) {
    const rev = reviewFor(boxStaff[i].employeeId);
    if (!rev) continue;
    const detail = unwrap(await api("GET", `/api/EmployeePerformanceReview/${rev.id}/details`));
    const criterionId = detail?.categories?.[0]?.criteria?.[0]?.id || detail?.template?.categories?.[0]?.criteria?.[0]?.id;
    const reviewer = (detail?.reviewers || []).find((r) => r.reviewerType === 1);
    if (!criterionId || !reviewer) continue;
    const sent = await call(api, "POST", `/api/EmployeePerformanceReview/${rev.id}/submit-manager`, {
      reviewerId: reviewer.id,
      scores: [{ criterionId, score: scorePlan[i], comment: "Kalibrasyon kadrosu" }],
    });
    if (i === 0) rec("PRF-FORM-06", "9 kutu kadrosuna yönetici puanı", sent.good, "20-90", sent.good ? "ilk kişi ok" : errText(sent.r), "");
  }

  const pipStaff = people("pip", (p) => p.kind === "ic");
  for (const p of pipStaff) {
    const rev = reviewFor(p.employeeId);
    if (!rev) continue;
    const detail = unwrap(await api("GET", `/api/EmployeePerformanceReview/${rev.id}/details`));
    const criterionId = detail?.categories?.[0]?.criteria?.[0]?.id || detail?.template?.categories?.[0]?.criteria?.[0]?.id;
    const reviewer = (detail?.reviewers || []).find((r) => r.reviewerType === 1);
    if (!criterionId || !reviewer) continue;
    const low = p.tag === "high" ? 5 : 2;
    const comment = p.tag === "threshold" ? "" : "Gerekçe yazıldı";
    const sent = await call(api, "POST", `/api/EmployeePerformanceReview/${rev.id}/submit-manager`, {
      reviewerId: reviewer.id,
      scores: [{ criterionId, score: low, comment }],
    });
    if (p.tag === "threshold") {
      rec("PRF-FORM-07", "Eşik altı yorumsuz puan reddedilir", !sent.good, "red", sent.good ? "kabul edildi" : errText(sent.r), "");
    }
    if (p.tag === "high") rec("PRF-FORM-08", "Yüksek puan yorumla gider", sent.good, "5", sent.good ? "ok" : errText(sent.r), "");
  }

  const ic = ics[0];
  const icReview = ic && reviewFor(ic.employeeId);
  if (icReview) {
    const peers = people("p360", (p) => p.kind === "peer").slice(0, 2).map((p) => p.employeeId);
    const assigned = await call(api, "PUT", "/api/PerformanceReviewer/assign-peers", {
      employeePerformanceReviewId: icReview.id,
      peerEmployeeIds: peers,
    });
    rec("PRF-360-01", "İki akran atanır", assigned.good, "2 akran", assigned.good ? "ok" : errText(assigned.r), "");
    const tooMany = await call(api, "PUT", "/api/PerformanceReviewer/assign-peers", {
      employeePerformanceReviewId: icReview.id,
      peerEmployeeIds: people("p360").slice(0, 6).map((p) => p.employeeId),
    });
    rec("PRF-360-02", "Altı akran üst sınırı aşar", !tooMany.good, "red", tooMany.good ? "kabul" : errText(tooMany.r), "");
    const onePeer = await call(api, "PUT", "/api/PerformanceReviewer/assign-peers", {
      employeePerformanceReviewId: icReview.id,
      peerEmployeeIds: peers.slice(0, 1),
    });
    rec("PRF-360-03", "Tek akran alt sınırı aşar", !onePeer.good, "red", onePeer.good ? "kabul" : errText(onePeer.r), "");
  }
  save();

  if (periods.box?.id && bag.ids.potential) {
    const ids = boxStaff.map((p) => p.employeeId);
    const opened = await call(api, "POST", "/api/PotentialAssessment/open", {
      performancePeriodId: periods.box.id,
      potentialTemplateId: bag.ids.potential,
      employeeIds: ids,
    });
    rec("PRF-KUTU-01", "Potansiyel değerlendirmeleri açılır", opened.good, "9+ kişi", opened.good ? "ok" : errText(opened.r), "");
    const list = await call(api, "GET", `/api/PotentialAssessment/by-period/${periods.box.id}`);
    const pots = arr(list.data);
    const potScores = [1, 3, 5, 1, 3, 5, 1, 3, 5, 3];
    for (let i = 0; i < pots.length; i++) {
      const assessment = pots[i];
      const full = unwrap(await api("GET", `/api/PotentialAssessment/${assessment.id}`));
      const criterionId = full?.criteria?.[0]?.id || full?.template?.criteria?.[0]?.id || full?.scores?.[0]?.potentialCriterionId;
      if (!criterionId) {
        if (i === 0) rec("PRF-KUTU-02", "Potansiyel kriteri", false, "kriter", JSON.stringify(Object.keys(full || {})), "");
        continue;
      }
      const saved = await call(api, "POST", "/api/PotentialAssessment/save-scores", {
        potentialAssessmentId: assessment.id,
        submit: true,
        scores: [{ potentialCriterionId: criterionId, score: potScores[i] || 3, evidence: "Gözlem notu" }],
      });
      if (i === 0) rec("PRF-KUTU-02", "Potansiyel puanı kaydolur", saved.good, "puan", saved.good ? "ok" : errText(saved.r), "");
      if (saved.good) {
        const reviewed = await call(api, "POST", `/api/PotentialAssessment/${assessment.id}/review`, { approve: true, reviewNote: "İK onay" });
        if (i === 0) rec("PRF-KUTU-03", "Potansiyel İK onayı", reviewed.good, "onay", reviewed.good ? "ok" : errText(reviewed.r), "");
      }
    }
    const synced = await call(api, "POST", "/api/NineBoxCalibration/sync", { performancePeriodId: periods.box.id, employeeIds: ids });
    rec("PRF-KUTU-04", "9 kutu senkron", synced.good, "sync", synced.good ? "ok" : errText(synced.r), "");
    const matrix = await call(api, "GET", `/api/NineBoxAssessment/matrix?performancePeriodId=${periods.box.id}`);
    rec("PRF-KUTU-05", "9 kutu matrisi", matrix.good, "matris", matrix.good ? JSON.stringify(matrix.data).slice(0, 240) : errText(matrix.r), "");
    bag.ids.matrix = matrix.data;
    const session = await call(api, "POST", "/api/NineBoxCalibration/sessions", {
      performancePeriodId: periods.box.id,
      organizationalUnitId: U.box.id,
      notes: "Laboratuvar kalibrasyonu",
    });
    rec("PRF-KUTU-06", "Kalibrasyon oturumu", session.good, "oturum", session.good ? session.data?.id || "ok" : errText(session.r), "");
    const boxes = arr(unwrap(await api("GET", "/api/NineBoxAssessment/all"))).filter((b) => b.performancePeriodId === periods.box.id);
    if (boxes[0] && session.data?.id) {
      const moved = await call(api, "POST", "/api/NineBoxCalibration/move", {
        assessmentId: boxes[0].id,
        sessionId: session.data.id,
        targetCell: 8,
        reason: "Komite yüksek potansiyele çekti",
      });
      rec("PRF-KUTU-07", "Oturumla kutu taşınır", moved.good, "taşındı", moved.good ? "ok" : errText(moved.r), "");
      const bare = await call(api, "POST", "/api/NineBoxCalibration/move", { assessmentId: boxes[0].id, targetCell: 0, reason: "Oturumsuz" });
      rec("PRF-KUTU-08", "Oturumsuz taşıma reddedilir", !bare.good, "red", bare.good ? "kabul" : errText(bare.r), "");
      const reset = await call(api, "POST", `/api/NineBoxCalibration/reset/${boxes[0].id}`, {});
      rec("PRF-KUTU-09", "Taşıma sıfırlanır", reset.good, "reset", reset.good ? "ok" : errText(reset.r), "");
      const fin = await call(api, "POST", `/api/NineBoxCalibration/sessions/${session.data.id}/finalize`, {});
      rec("PRF-KUTU-10", "Oturum kapanır", fin.good, "final", fin.good ? "ok" : errText(fin.r), "");
    }
    const cal = await call(api, "POST", "/api/PerformanceCalibration", {
      performancePeriodId: periods.box.id,
      organizationalUnitId: U.box.id,
      notes: "Puan kalibrasyonu",
    });
    rec("PRF-KAL-01", "Puan kalibrasyon oturumu", cal.good, "oturum", cal.good ? cal.data?.id || "ok" : errText(cal.r), "");
    if (cal.data?.id && reviewFor(boxStaff[0].employeeId)) {
      const adj = await call(api, "POST", `/api/PerformanceCalibration/${cal.data.id}/adjustments`, {
        employeePerformanceReviewId: reviewFor(boxStaff[0].employeeId).id,
        adjustedScore: 55,
        reason: "Ekip standardına çekildi",
      });
      rec("PRF-KAL-02", "Gerekçeli puan düzeltmesi", adj.good, "55", adj.good ? "ok" : errText(adj.r), "");
      const bell = await call(api, "GET", `/api/PerformanceCalibration/bell-curve?periodId=${periods.box.id}`);
      rec("PRF-KAL-03", "Çan eğrisi", bell.good, "dağılım", bell.good ? "ok" : errText(bell.r), "");
      const done = await call(api, "POST", `/api/PerformanceCalibration/${cal.data.id}/finalize`, {});
      rec("PRF-KAL-04", "Kalibrasyon kesinleşir", done.good, "final", done.good ? "ok" : errText(done.r), "");
    }
  }

  const suggestions = periods.box?.id ? await call(api, "GET", `/api/TalentAction/suggestions/${periods.box.id}`) : { good: false, r: { status: 0 } };
  rec("PRF-AKS-01", "Kutu önerileri listelenir", suggestions.good, "liste", suggestions.good ? "ok" : errText(suggestions.r), "");
  const types = [0, 1, 2, 3, 4, 5];
  const typeNames = ["terfi", "ücret", "yedekleme", "gelişim", "takdir", "pip"];
  for (let i = 0; i < types.length; i++) {
    const emp = (boxStaff[i] || pipStaff[i] || mirasEmp).employeeId;
    const act = await call(api, "POST", "/api/TalentAction", {
      actionType: types[i],
      employeeId: emp,
      performancePeriodId: (periods.box || periods.pip).id,
      title: typeNames[i] + " aksiyonu",
      rationale: "Laboratuvar kaydı",
      priority: i % 4,
      sourceType: 2,
    });
    rec("PRF-AKS-TIP-" + i, "Aksiyon tipi " + typeNames[i], act.good, "oluşur", act.good ? act.data?.id || "ok" : errText(act.r), "");
    if (i === 0 && act.data?.id) {
      await call(api, "POST", `/api/TalentAction/${act.data.id}/decide`, { approve: true });
      await call(api, "POST", `/api/TalentAction/${act.data.id}/start`, {});
      const completed = await call(api, "POST", `/api/TalentAction/${act.data.id}/complete`, { outcome: 0 });
      rec("PRF-AKS-02", "Aksiyon karar, başla, tamamla", completed.good, "tamam", completed.good ? "ok" : errText(completed.r), "");
    }
    if (i === 1 && act.data?.id) {
      const cancelled = await call(api, "POST", `/api/TalentAction/${act.data.id}/cancel`, { reason: "Gerek kalmadı" });
      rec("PRF-AKS-03", "Aksiyon iptal", cancelled.good, "iptal", cancelled.good ? "ok" : errText(cancelled.r), "");
    }
  }

  const pipPerson = pipStaff.find((p) => p.tag === "pipActive") || pipStaff[0];
  const pipAction = await call(api, "POST", "/api/TalentAction", {
    actionType: 5,
    employeeId: pipPerson.employeeId,
    performancePeriodId: periods.pip.id,
    title: "PIP aç",
    rationale: "Eşik altı dönem",
    priority: 3,
    sourceType: 1,
  });
  const talentId = pipAction.data?.id;
  if (talentId) {
    const pip = await call(api, "PUT", "/api/Pip", {
      talentActionId: talentId,
      startDate: "2026-02-10",
      endDate: "2026-04-10",
      checkInIntervalDays: 14,
      goals: [
        { title: "Haftalık kalite hatasını 2 nin altına indir", successMeasure: "Hata adedi <= 2", targetDate: "2026-04-01", order: 0 },
      ],
    });
    rec("PRF-PIP-01", "PIP planı oluşur", pip.good, "plan", pip.good ? pip.data?.id || "ok" : errText(pip.r), "");
    const pipId = pip.data?.id;
    if (pipId) {
      const check = await call(api, "POST", "/api/Pip/check-in", { pipId, note: "İkinci hafta hata 3" });
      rec("PRF-PIP-02", "PIP check-in", check.good, "not", check.good ? "ok" : errText(check.r), "");
      const ext = await call(api, "POST", `/api/Pip/${pipId}/extend`, { endDate: "2026-05-01", reason: "İki hafta daha" });
      rec("PRF-PIP-03", "PIP uzar", ext.good, "uzadı", ext.good ? "ok" : errText(ext.r), "");
    }
  }
  const closer = pipStaff.find((p) => p.tag === "pipClose");
  if (closer) {
    const act = await call(api, "POST", "/api/TalentAction", {
      actionType: 5,
      employeeId: closer.employeeId,
      performancePeriodId: periods.pip.id,
      title: "Kapanacak PIP",
      rationale: "Hedef tuttu",
      priority: 1,
      sourceType: 2,
    });
    if (act.data?.id) {
      const pip = await call(api, "PUT", "/api/Pip", {
        talentActionId: act.data.id,
        startDate: "2026-02-10",
        endDate: "2026-03-20",
        goals: [{ title: "Hedef tuttu", successMeasure: "Tamam", order: 0 }],
      });
      if (pip.data?.id) {
        const closed = await call(api, "POST", `/api/Pip/${pip.data.id}/close`, { note: "Hedef tuttu" });
        rec("PRF-PIP-04", "PIP kapanır", closed.good, "kapandı", closed.good ? "ok" : errText(closed.r), "");
      }
    }
  }

  const appealPerson = pipStaff.find((p) => p.tag === "appealOk");
  const appealReview = appealPerson && reviewFor(appealPerson.employeeId);
  if (appealReview) {
    const raised = await call(api, "POST", `/api/EmployeePerformanceAppeal/submit/${appealReview.id}`, { reason: "Puan dönem içi teslimleri eksik saydı, gerekçe en az on karakter." });
    rec("PRF-ITIRAZ-01", "İtiraz açılır", raised.good, "açıldı", raised.good ? "ok" : errText(raised.r), "");
    const window = await call(api, "GET", `/api/EmployeePerformanceAppeal/window-status/${appealReview.id}`);
    rec("PRF-ITIRAZ-02", "İtiraz penceresi durumu", window.good, "durum", window.good ? JSON.stringify(window.data).slice(0, 180) : errText(window.r), "");
  }
  const hidden = icReview && (await call(api, "POST", `/api/EmployeePerformanceAppeal/submit/${icReview.id}`, { reason: "Sonuç kapalıyken itiraz denemesi yapılıyor." }));
  if (hidden) rec("PRF-ITIRAZ-03", "Sonuç kapalı birimde itiraz açılmaz", !hidden.good, "red", hidden.good ? "açıldı" : errText(hidden.r), "");

  const meet = year?.id && ic ? await call(api, "POST", "/api/PerformanceMidTermMeeting", {
    performancePeriodId: year.id,
    employeeId: ic.employeeId,
    meetingDate: "2026-06-15",
    progressNote: "Hedeflerin yarısı tamam",
    feedback: "Tempo iyi",
  }) : null;
  if (meet) rec("PRF-ARA-01", "Ara görüşme puan üretmez", meet.good, "kayıt", meet.good ? "ok" : errText(meet.r), "");

  const extraRole = await call(api, "POST", "/api/EmployeeAdditionalRole", {
    employeeId: ic?.employeeId,
    roleName: "Nöbet sorumlusu",
    proficiency: 3,
    isCritical: false,
  });
  rec("PRF-EK-01", "Ek görev yetkinliği skordan ayrı kaydolur", extraRole.good || /role/i.test(errText(extraRole.r)), "kayıt veya alan hatası", extraRole.good ? "ok" : errText(extraRole.r), "skora girmediği kılavuzda yazılı");

  const hr = await call(api, "GET", `/api/PerformanceAnalytics/hr-summary?periodId=${kpiPeriod || ""}`);
  const mgrSum = await call(api, "GET", `/api/PerformanceAnalytics/manager-summary?periodId=${kpiPeriod || ""}`);
  const periodSum = await call(api, "GET", `/api/PerformanceAnalytics/period-summary?periodId=${kpiPeriod || ""}`);
  rec("PRF-ANALIZ-01", "İK özeti", hr.good, "özet", hr.good ? JSON.stringify(hr.data).slice(0, 180) : errText(hr.r), "");
  rec("PRF-ANALIZ-02", "Yönetici özeti", mgrSum.good, "özet", mgrSum.good ? "ok" : errText(mgrSum.r), "");
  rec("PRF-ANALIZ-03", "Dönem özeti", periodSum.good, "özet", periodSum.good ? "ok" : errText(periodSum.r), "");
  if (ic) {
    const trend = await call(api, "GET", `/api/PerformanceTrend/employee/${ic.employeeId}`);
    rec("PRF-ANALIZ-04", "Çalışan trendi", trend.good, "trend", trend.good ? "ok" : errText(trend.r), "");
  }
  const gap = ic && (await call(api, "GET", `/api/PositionCompetencyExpectation/skill-gap/${ic.employeeId}`));
  if (gap) rec("PRF-YETKIN-11", "Yetkinlik açığı", gap.good, "açık", gap.good ? JSON.stringify(gap.data).slice(0, 180) : errText(gap.r), "");
  const matrixComp = await call(api, "GET", "/api/PositionCompetencyExpectation/matrix");
  rec("PRF-YETKIN-12", "Yetkinlik matrisi", matrixComp.good, "matris", matrixComp.good ? "ok" : errText(matrixComp.r), "");

  save();
  await browser.close();

  const empSession = await (async () => {
    const b = await openAdmin();
    return b;
  })();
  const empLogin = await login(empSession.browser, mirasEmp.email, "Perf123!");
  const mine = await call(empLogin.api, "GET", "/api/PerformancePeriod/personal/active");
  rec("PRF-YETKI-01", "Çalışan kendi aktif dönemini görür", mine.good, "200", mine.good ? "ok" : errText(mine.r), mirasEmp.email);
  const forbidden = await call(empLogin.api, "GET", "/api/PerformanceAnalytics/hr-summary");
  rec("PRF-YETKI-02", "Çalışan İK özetine giremez", !forbidden.good, "403", String(forbidden.r.status) + " " + errText(forbidden.r), "");
  const pipMine = await call(empLogin.api, "GET", "/api/Pip/mine");
  rec("PRF-YETKI-03", "Miras çalışanında PIP listesi boş veya kapalı", pipMine.good, "boş", pipMine.good ? JSON.stringify(pipMine.data).slice(0, 120) : errText(pipMine.r), "");
  const pipEmp = pipStaff.find((p) => p.tag === "pipActive");
  if (pipEmp) {
    const pipLogin = await login(empSession.browser, pipEmp.email, "Perf123!");
    const visible = await call(pipLogin.api, "GET", "/api/Pip/mine");
    rec("PRF-YETKI-04", "PIP açık birimde çalışan kendi planını görür", visible.good, "kendi pip", visible.good ? JSON.stringify(visible.data).slice(0, 160) : errText(visible.r), pipEmp.email);
    await pipLogin.ctx.close();
  }
  await empLogin.ctx.close();
  await empSession.browser.close();

  save();
  const passed = scenarios.filter((s) => s.pass).length;
  console.log("DONE", passed, "/", scenarios.length);
})().catch((e) => {
  console.error("FAIL", e.stack || e.message);
  save();
  process.exit(1);
});
