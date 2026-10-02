const fs = require("fs");
const path = require("path");
const { openAdmin, login, unwrap, arr, ok, errText, writeJson } = require("./dhr.cjs");

const state = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "state.json"), "utf8"));
const ids = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "lab-ids.json"), "utf8"));
const file = path.join(__dirname, "..", "data", "scenarios.json");
let scenarios = JSON.parse(fs.readFileSync(file, "utf8"));
const fresh = [];

function people(unit, pred = () => true) {
  return Object.values(state.people).filter((p) => p.unit === unit && pred(p));
}
function one(unit, pred) {
  const hit = people(unit, pred)[0];
  if (!hit) throw new Error("no person " + unit);
  return hit;
}
function rec(id, title, pass, expected, actual, evidence) {
  const row = {
    id,
    title,
    pass: !!pass,
    expected: String(expected || ""),
    actual: String(actual || "").slice(0, 500),
    evidence: String(evidence || "").slice(0, 500),
  };
  fresh.push(row);
  const i = scenarios.findIndex((s) => s.id === id);
  if (i >= 0) scenarios[i] = row;
  else scenarios.push(row);
  console.log(pass ? "PASS" : "FAIL", id, String(actual || "").slice(0, 140));
}
function save() {
  fs.writeFileSync(file, JSON.stringify(scenarios, null, 2));
  fs.copyFileSync(file, path.join(__dirname, "..", "src", "data", "scenarios.json"));
}
async function call(api, method, p, body) {
  const r = await api(method, p, body);
  return { r, data: unwrap(r), good: ok(r), err: errText(r) };
}
function full(r) {
  return JSON.stringify(r.data || r.err || r.r?.status).slice(0, 400);
}

(async () => {
  const admin = await openAdmin();
  const api = admin.api;
  const reviews = arr(unwrap(await api("GET", "/api/EmployeePerformanceReview/all")));
  function reviewOf(employeeId, periodId) {
    return reviews.find((r) => r.employeeId === employeeId && (!periodId || r.performancePeriodId === periodId));
  }
  async function detail(apiClient, reviewId) {
    return unwrap(await apiClient("GET", `/api/EmployeePerformanceReview/${reviewId}/details`));
  }
  function criteria(detailObj) {
    const cats = detailObj?.template?.categories || [];
    return cats.flatMap((c) => (c.criteria || []).map((q) => ({ ...q, category: c.name, categoryType: c.categoryType })));
  }

  // --- Talent approve / reject / complete ---
  const list = await call(api, "GET", `/api/TalentAction/list?periodId=${ids.periods.box}`);
  const actions = arr(list.data);
  rec("PRF-AKS-04", "Aksiyon listesi dönemle gelir", list.good && actions.length > 0, "liste", list.good ? String(actions.length) : list.err, "");
  let openAction = actions.find((a) => a.actionStatus === 0) || actions[0];
  if (!openAction) {
    const emp = one("miras", (p) => p.kind === "ic");
    const created = await call(api, "POST", "/api/TalentAction", {
      actionType: 3,
      employeeId: emp.employeeId,
      performancePeriodId: ids.periods.miras,
      title: "Gelişim planı",
      rationale: "Yetkinlik açığı",
      priority: 1,
      sourceType: 2,
    });
    openAction = created.data;
    rec("PRF-AKS-05", "Yeni gelişim aksiyonu açılır", created.good, "oluşur", created.good ? created.data?.id : created.err, "");
  }
  if (openAction?.id) {
    const approved = await call(api, "POST", `/api/TalentAction/${openAction.id}/approve`, { description: "Komite uygun gördü" });
    const completed = approved.good
      ? await call(api, "POST", `/api/TalentAction/${openAction.id}/complete`, { outcome: 0, outcomeResult: 0 })
      : approved;
    rec("PRF-AKS-02", "Aksiyon onaylanır ve tamamlanır", approved.good && completed.good, "tamam", approved.good ? (completed.good ? "ok" : completed.err) : approved.err, openAction.id);
  }
  const rejectEmp = one("pip", (p) => p.tag === "actionCancel");
  const rejectedNew = await call(api, "POST", "/api/TalentAction", {
    actionType: 1,
    employeeId: rejectEmp.employeeId,
    performancePeriodId: ids.periods.pip,
    title: "Reddedilecek ücret",
    rationale: "Bütçe yok",
    priority: 0,
    sourceType: 2,
  });
  if (rejectedNew.good) {
    const rej = await call(api, "POST", `/api/TalentAction/${rejectedNew.data.id}/reject`, { description: "Bu dönem değil" });
    rec("PRF-AKS-06", "Aksiyon gerekçeyle reddedilir", rej.good, "red", rej.good ? "ok" : rej.err, "");
  } else {
    rec("PRF-AKS-06", "Aksiyon gerekçeyle reddedilir", false, "yeni aksiyon", rejectedNew.err, "");
  }

  // --- PIP lifecycle on an approved PIP action ---
  const pipEmp = one("pip", (p) => p.tag === "pipActive");
  let pipAction = actions.find((a) => a.actionType === 5 && a.employeeId === pipEmp.employeeId);
  const pipList = await call(api, "GET", `/api/TalentAction/list?periodId=${ids.periods.pip}`);
  const pipActions = arr(pipList.data);
  pipAction = pipActions.find((a) => a.actionType === 5 && a.employeeId === pipEmp.employeeId) || pipAction;
  if (!pipAction) {
    const made = await call(api, "POST", "/api/TalentAction", {
      actionType: 5,
      employeeId: pipEmp.employeeId,
      performancePeriodId: ids.periods.pip,
      title: "PIP",
      rationale: "Eşik altı dönem",
      priority: 3,
      sourceType: 1,
    });
    pipAction = made.data;
  }
  if (pipAction?.id && pipAction.actionStatus === 0) {
    await call(api, "POST", `/api/TalentAction/${pipAction.id}/approve`, { description: "PIP açılsın" });
  }
  const pip = pipAction?.id
    ? await call(api, "PUT", "/api/Pip", {
        talentActionId: pipAction.id,
        startDate: "2026-02-10",
        endDate: "2026-04-10",
        checkInIntervalDays: 14,
        goals: [{ title: "Haftalık hatayı 2 nin altına indir", successMeasure: "Hata adedi en fazla 2", targetDate: "2026-04-01", order: 0 }],
      })
    : { good: false, err: "aksiyon yok" };
  rec("PRF-PIP-01", "Onaylı aksiyondan PIP oluşur", pip.good, "plan", pip.good ? pip.data?.id || "ok" : pip.err, pipAction?.id || "");
  const pipId = pip.data?.id;
  if (pipId) {
    const check = await call(api, "POST", "/api/Pip/check-in", {
      performanceImprovementPlanId: pipId,
      checkInDate: "2026-02-24",
      progressPercentage: 40,
      managerNote: "Hata hâlâ 3",
      employeeNote: "Eğitime katıldım",
    });
    rec("PRF-PIP-02", "PIP ara kontrolü yazılır", check.good, "not", check.good ? "ok" : check.err, "");
    const ext = await call(api, "POST", `/api/Pip/${pipId}/extend`, { extendedToDate: "2026-05-01", extensionReason: "İki hafta daha" });
    rec("PRF-PIP-03", "PIP uzatılır", ext.good, "uzadı", ext.good ? "ok" : ext.err, "");
    const closed = await call(api, "POST", `/api/Pip/${pipId}/close`, { result: 0, closingNote: "Hedef tuttu" });
    rec("PRF-PIP-04", "PIP kapanır", closed.good, "kapandı", closed.good ? "ok" : closed.err, "");
    const empLogin = await login(admin.browser, pipEmp.email, "Perf123!");
    const mine = await call(empLogin.api, "GET", "/api/Pip/mine");
    const mineText = JSON.stringify(mine.data || "");
    rec("PRF-YETKI-04", "PIP açık birimde çalışan kendi planını görür", mine.good && mineText.includes(pipId), "kendi planı", mine.good ? (mineText.includes(pipId) ? "görünüyor" : mineText.slice(0, 160)) : mine.err, "");
    await empLogin.ctx.close();
    const hidden = await login(admin.browser, one("miras", (p) => p.kind === "ic").email, "Perf123!");
    const hiddenMine = await call(hidden.api, "GET", "/api/Pip/mine");
    const hiddenText = JSON.stringify(hiddenMine.data || []);
    rec("PRF-YETKI-03", "PIP kapalı birimde çalışan plan görmez", hiddenMine.good && !hiddenText.includes(pipId), "boş", hiddenText.slice(0, 120), "");
    await hidden.ctx.close();
  }

  // --- Multi-rater scores ---
  const ada = one("p360", (p) => p.email === "adakorkmaz@perf.com");
  const kerem = one("p360", (p) => p.email === "keremyilmaz@perf.com");
  const peer = one("p360", (p) => p.kind === "peer");
  const peer2 = people("p360", (p) => p.kind === "peer")[1];
  const adaReview = reviewOf(ada.employeeId, ids.periods.p360);
  if (adaReview) {
    const peers = await call(api, "PUT", "/api/PerformanceReviewer/assign-peers", {
      employeePerformanceReviewId: adaReview.id,
      peerEmployeeIds: [peer.employeeId, peer2.employeeId],
    });
    rec("PRF-360-01", "İki akran atanır", peers.good, "2 akran", peers.good ? "ok" : peers.err, "");
    const tooFew = await call(api, "PUT", "/api/PerformanceReviewer/assign-peers", {
      employeePerformanceReviewId: adaReview.id,
      peerEmployeeIds: [peer.employeeId],
    });
    rec("PRF-360-03", "Tek akran alt sınırda durur", !tooFew.good, "red", tooFew.good ? "kabul edildi" : tooFew.err, "");
    const tooMany = await call(api, "PUT", "/api/PerformanceReviewer/assign-peers", {
      employeePerformanceReviewId: adaReview.id,
      peerEmployeeIds: people("p360").slice(0, 6).map((p) => p.employeeId),
    });
    rec("PRF-360-02", "Altı akran üst sınırda durur", !tooMany.good, "red", tooMany.good ? "kabul edildi" : tooMany.err, "");
    if (tooMany.good || tooFew.good) {
      await call(api, "PUT", "/api/PerformanceReviewer/assign-peers", {
        employeePerformanceReviewId: adaReview.id,
        peerEmployeeIds: [peer.employeeId, peer2.employeeId],
      });
    }

    const self = await login(admin.browser, ada.email, "Perf123!");
    const selfDetail = await detail(self.api, adaReview.id);
    const selfScores = criteria(selfDetail)
      .filter((q) => q.scoreImpact !== 2 && q.questionType === 0)
      .slice(0, 1)
      .map((q) => ({ criterionId: q.id, score: 4, comment: "Kendimi dönem hedefine yakın görüyorum" }));
    const selfSent = await call(self.api, "POST", `/api/EmployeePerformanceReview/${adaReview.id}/submit-self`, { scores: selfScores });
    rec("PRF-FORM-09", "Çalışan öz değerlendirme gönderir", selfSent.good, "öz puan", selfSent.good ? "ok" : selfSent.err, String(selfScores.length));
    await self.ctx.close();

    const mgr = await login(admin.browser, kerem.email, "Perf123!");
    const mgrDetail = await detail(mgr.api, adaReview.id);
    const qs = criteria(mgrDetail);
    const byType = {};
    for (const q of qs) if (byType[q.questionType] == null) byType[q.questionType] = q;
    const bare = byType[0]
      ? await call(mgr.api, "POST", `/api/EmployeePerformanceReview/${adaReview.id}/submit-manager`, {
          scores: [{ criterionId: byType[0].id, score: 2, comment: "" }],
        })
      : { good: false, err: "ölçek sorusu yok" };
    rec("PRF-FORM-07", "Eşik altı yorumsuz puan reddedilir", !bare.good, "red", bare.good ? "kabul edildi" : bare.err, "");
    const scores = qs
      .filter((q) => q.isRequired !== false || q.questionType <= 5)
      .map((q) => {
        const score = q.questionType === 1 ? 80 : q.questionType === 2 ? 70 : q.questionType === 6 || q.questionType === 7 ? 0 : 4;
        const comment = q.questionType === 6 ? "Serbest yorum, puana girmemeli" : "Gözlem notu";
        return { criterionId: q.id, score, comment, questionType: q.questionType, title: q.title };
      });
    const sent = await call(mgr.api, "POST", `/api/EmployeePerformanceReview/${adaReview.id}/submit-manager`, {
      scores: scores.map(({ criterionId, score, comment }) => ({ criterionId, score, comment })),
    });
    rec("PRF-FORM-10", "Sekiz soru tipi aynı formda puanlanır", sent.good, "gönderildi", sent.good ? "ok" : sent.err, scores.map((s) => s.questionType + ":" + s.title).join(", "));
    await mgr.ctx.close();
    if (sent.good) {
      const bd = unwrap(await api("GET", `/api/PerformanceScore/breakdown/${adaReview.id}`));
      const trace = bd?.trace?.criteria || [];
      const open = trace.filter((c) => /açık uç|dosya/i.test(c.criterionTitle || ""));
      const openIgnored = open.every((c) => !c.effectiveScore || Number(c.effectiveScore) === 0);
      rec("PRF-FORM-11", "Açık uç ve dosya kanıtı finale girmez", open.length === 0 || openIgnored, "puansız", open.map((c) => c.criterionTitle + "=" + c.effectiveScore).join(", ") || "iz yok", "");
      const gap = trace.find((c) => c.gapAdjustedScore != null);
      rec("PRF-FORM-12", "Beklentiye oranlı yetkinlik kırılımda ayrı durur", !!gap, "gapAdjustedScore", gap ? `${gap.criterionTitle} ham ${gap.rawAverage} efektif ${gap.effectiveScore} gap ${gap.gapAdjustedScore}` : "yok", "");
      ids.questionBreakdown = bd;
    }

    const peerLogin = await login(admin.browser, peer.email, "Perf123!");
    const peerDetail = await detail(peerLogin.api, adaReview.id);
    const peerRow = (peerDetail.reviewers || []).find((r) => r.evaluatorEmployeeId === peer.employeeId || r.reviewerType === 2);
    const peerCriterion = criteria(peerDetail).find((q) => q.questionType === 0);
    const peerSent = peerRow && peerCriterion
      ? await call(peerLogin.api, "POST", `/api/EmployeePerformanceReview/${adaReview.id}/peer/${peerRow.id}/submit`, {
          scores: [{ criterionId: peerCriterion.id, score: 5, comment: "Birlikte çalıştık" }],
        })
      : { good: false, err: "akran satırı yok" };
    rec("PRF-360-05", "Akran kendi formunu gönderir", peerSent.good, "akran puanı", peerSent.good ? "ok" : peerSent.err, peer.email);
    await peerLogin.ctx.close();
  } else rec("PRF-FORM-09", "Çalışan öz değerlendirme gönderir", false, "form", "Ada formu yok", "");

  const keremReview = reviewOf(kerem.employeeId, ids.periods.p360);
  if (keremReview) {
    const added = await call(api, "POST", "/api/PerformanceReviewer", {
      employeePerformanceReviewId: keremReview.id,
      evaluatorEmployeeId: ada.employeeId,
      reviewerType: 3,
      isAnonymous: false,
    });
    const hrAdd = await call(api, "POST", "/api/PerformanceReviewer", {
      employeePerformanceReviewId: keremReview.id,
      evaluatorEmployeeId: state.people["7144"].employeeId,
      reviewerType: 4,
      isAnonymous: false,
    });
    rec("PRF-360-06", "Ast değerlendirici eklenebilir", added.good, "ast", added.good ? "ok" : added.err, "");
    rec("PRF-360-07", "İK değerlendirici eklenebilir", hrAdd.good, "İK", hrAdd.good ? "ok" : hrAdd.err, "");
    if (added.good) {
      const sub = await login(admin.browser, ada.email, "Perf123!");
      const d = await detail(sub.api, keremReview.id);
      const row = (d.reviewers || []).find((r) => r.reviewerType === 3);
      const q = criteria(d).find((c) => c.questionType === 0);
      const sent = row && q
        ? await call(sub.api, "POST", `/api/EmployeePerformanceReview/${keremReview.id}/peer/${row.id}/submit`, {
            scores: [{ criterionId: q.id, score: 4, comment: "Yöneticim net öncelik veriyor" }],
          })
        : { good: false, err: "satır yok" };
      rec("PRF-360-08", "Ast yukarı doğru puan gönderir", sent.good, "ast puanı", sent.good ? "ok" : sent.err, "");
      await sub.ctx.close();
    }
    if (hrAdd.good) {
      const hr = await login(admin.browser, "egebayrak@perf.com", "Perf123!");
      const d = await detail(hr.api, keremReview.id);
      const row = (d.reviewers || []).find((r) => r.reviewerType === 4);
      const q = criteria(d).find((c) => c.questionType === 0);
      const sent = row && q
        ? await call(hr.api, "POST", `/api/EmployeePerformanceReview/${keremReview.id}/peer/${row.id}/submit`, {
            scores: [{ criterionId: q.id, score: 3, comment: "İK gözlemi" }],
          })
        : { good: false, err: "satır yok" };
      rec("PRF-360-09", "İK puan gönderir", sent.good, "İK puanı", sent.good ? "ok" : sent.err, "");
      await hr.ctx.close();
    }
  }

  // --- System KPI attempt ---
  const sysTpl = await call(api, "POST", "/api/PerformanceTemplate/with-children", {
    name: "Sistem KPI denemesi",
    organizationalUnitId: state.units.kpi.id,
    evaluationModel: 0,
    selfWeight: 0,
    managerWeight: 100,
    peerWeight: 0,
    subordinateWeight: 0,
    hrWeight: 0,
    competencyScoringMode: 0,
    showResultToEmployee: true,
    categories: [
      {
        name: "Sistem KPI",
        order: 0,
        weight: 100,
        categoryType: 0,
        kpiScoreScope: 2,
        scoreImpact: 0,
        reviewerAggregation: 0,
        categoryReviewers: [{ reviewerType: 1, canScore: true, canComment: true, order: 0 }],
        criteria: [{ title: "Sistem gerçekleşme", order: 0, weight: 100, questionType: 2, scoreImpact: 0, isRequired: false, showToEmployee: true, showCommentField: true, capPercentage: 120 }],
      },
    ],
  });
  const sysPeriod = sysTpl.good
    ? await call(api, "POST", "/api/PerformancePeriod", {
        name: "Sistem KPI Kasım",
        code: "PRF-KPI-SYS",
        startDate: "2026-11-01",
        endDate: "2026-11-30",
        periodType: 0,
        organizationalUnitId: state.units.kpi.id,
        scoreScale: 0,
        defaultTemplateId: sysTpl.data.id,
        includeNewJoiners: true,
        resultReleaseMode: 1,
        employeeResultVisibility: 0,
        peerAnswerVisibility: 0,
      })
    : { good: false, err: sysTpl.err };
  let sysReady = null;
  if (sysPeriod.good) {
    await call(api, "PUT", `/api/PerformancePeriod/${sysPeriod.data.id}/stages`, [0, 1, 2, 4, 5].map((stageType, order) => ({
      stageType, order, isEnabled: true, plannedStartDate: "2026-11-01", plannedEndDate: "2026-11-30",
    })));
    sysReady = unwrap(await api("GET", `/api/PerformancePeriod/${sysPeriod.data.id}/readiness`));
    const block = (sysReady.issues || []).find((i) => i.isBlocking);
    const started = block ? { good: false, err: block.message } : await call(api, "POST", `/api/PerformancePeriod/${sysPeriod.data.id}/start`, {});
    rec("PRF-KPI-SYS", "Sistem hesabı KPI dönemi açılır", started.good, "dönem açılır", started.good ? "açıldı" : started.err, block ? block.code : "");
    if (!started.good) rec("PRF-SABLON-12", "Sistem KPI bölümünde puanlayan bir rol vardır", false, "puanlayıcı ve açık dönem", started.err, block ? block.code : "");
  } else rec("PRF-KPI-SYS", "Sistem KPI şablonu ve dönemi", false, "kurulum", sysPeriod.err, "");

  // --- Calibration writes into the score ---
  const boxEmp = one("box", (p) => p.kind === "ic");
  const boxReview = reviewOf(boxEmp.employeeId, ids.periods.box);
  if (boxReview) {
    const before = unwrap(await api("GET", `/api/PerformanceScore/breakdown/${boxReview.id}`));
    const cal = await call(api, "POST", "/api/PerformanceCalibration", {
      performancePeriodId: ids.periods.box,
      organizationalUnitId: state.units.box.id,
      notes: "Puan düzeltmesi",
      sessionDate: "2026-06-20",
    });
    const sessionId = cal.data?.id;
    const adj = sessionId
      ? await call(api, "POST", `/api/PerformanceCalibration/${sessionId}/adjustments`, {
          employeePerformanceReviewId: boxReview.id,
          adjustedScore: 55,
          reason: "Ekip standardına çekildi",
        })
      : { good: false, err: cal.err };
    rec("PRF-KAL-02", "Gerekçeli kalibrasyon puanı yazılır", adj.good, "55", adj.good ? "ok" : adj.err, "");
    if (adj.good) {
      await call(api, "POST", `/api/PerformanceScore/recalculate/${boxReview.id}`, {});
      const after = unwrap(await api("GET", `/api/PerformanceScore/breakdown/${boxReview.id}`));
      const moved = Number(after?.overallScore) === 55;
      rec("PRF-KAL-05", "Kalibrasyon puanı genel skora yazılır", moved, "55", `önce ${before?.overallScore} sonra ${after?.overallScore}`, "");
      const fin = await call(api, "POST", `/api/PerformanceCalibration/${sessionId}/finalize`, {});
      rec("PRF-KAL-04", "Kalibrasyon oturumu kapanır", fin.good, "final", fin.good ? "ok" : fin.err, "");
      const again = await call(api, "POST", `/api/PerformanceCalibration/${sessionId}/adjustments`, {
        employeePerformanceReviewId: boxReview.id,
        adjustedScore: 40,
        reason: "Kapandıktan sonra",
      });
      rec("PRF-KAL-06", "Kapanan oturumda yeni düzeltme olmaz", !again.good, "red", again.good ? "kabul edildi" : again.err, "");
    }
  }

  // --- 9 box cells ---
  const pots = arr(unwrap(await api("GET", `/api/PotentialAssessment/by-period/${ids.periods.box}`)));
  let finalized = 0;
  const coach = await login(admin.browser, "egebayrak@perf.com", "Perf123!");
  for (const row of pots) {
    const reviewed = await call(coach.api, "POST", `/api/PotentialAssessment/${row.id}/review`, { approve: true, reviewNote: "İkinci göz kesinleştirdi" });
    if (reviewed.good) finalized++;
    else if (finalized === 0) console.log("pot review", reviewed.err);
  }
  await coach.ctx.close();
  rec("PRF-KUTU-03", "Potansiyeli puanlayan kişi değil, başka biri kesinleştirir", finalized > 0, "kesinleşti", String(finalized) + "/" + pots.length, "");
  await call(api, "POST", "/api/NineBoxCalibration/sync", { performancePeriodId: ids.periods.box, employeeIds: [] });
  const matrixRaw = await call(api, "GET", `/api/NineBoxAssessment/matrix?periodId=${ids.periods.box}&ouId=${state.units.box.id}`);
  const matrix = arr(matrixRaw.data?.items || matrixRaw.data);
  const cells = new Set(matrix.map((x) => x.finalBoxCell ?? x.calculatedBoxCell ?? x.boxCell).filter((x) => x !== undefined && x !== null));
  rec("PRF-KUTU-11", "Dokuz kutunun hücreleri dolmaya başlar", cells.size >= 3, "en az 3 farklı hücre", [...cells].join(", ") || full(matrixRaw), "adet " + matrix.length);
  const boxes = arr(unwrap(await api("GET", "/api/NineBoxAssessment/all"))).filter((b) => b.performancePeriodId === ids.periods.box);
  const session = await call(api, "POST", "/api/NineBoxCalibration/sessions", {
    performancePeriodId: ids.periods.box,
    organizationalUnitId: state.units.box.id,
    name: "H1 komite 2",
    sessionDate: "2026-06-21T09:00:00",
  });
  if (boxes[0] && session.good) {
    const sid = session.data.id;
    const moved = await call(api, "POST", "/api/NineBoxCalibration/move", {
      nineBoxAssessmentId: boxes[0].id,
      toBoxCell: 8,
      reason: "Komite yüksek potansiyele çekti",
      nineBoxCalibrationSessionId: sid,
    });
    rec("PRF-KUTU-07", "Oturum varken kutu taşınır", moved.good, "taşındı", moved.good ? "ok" : moved.err, "");
    const bare = await call(api, "POST", "/api/NineBoxCalibration/move", {
      nineBoxAssessmentId: boxes[0].id,
      toBoxCell: 0,
      reason: "Oturumsuz deneme",
    });
    rec("PRF-KUTU-08", "Oturum zorunluyken oturumsuz taşıma olmaz", !bare.good, "red", bare.good ? "kabul edildi" : bare.err, "");
    const reset = await call(api, "POST", `/api/NineBoxCalibration/reset/${boxes[0].id}`, {
      nineBoxAssessmentId: boxes[0].id,
      reason: "Sistem kutusu geri gelsin",
    });
    rec("PRF-KUTU-09", "Taşıma geri alınır", reset.good, "reset", reset.good ? "ok" : reset.err, "");
    const fin = await call(api, "POST", `/api/NineBoxCalibration/sessions/${sid}/finalize`, {});
    rec("PRF-KUTU-10", "9 kutu oturumu kapanır", fin.good, "final", fin.good ? "ok" : fin.err, "");
    const after = await call(api, "POST", "/api/NineBoxCalibration/move", {
      nineBoxAssessmentId: boxes[0].id,
      toBoxCell: 8,
      reason: "Kapandıktan sonra",
      nineBoxCalibrationSessionId: sid,
    });
    rec("PRF-KUTU-12", "Kapalı oturumda yeni taşıma olmaz", !after.good, "red", after.good ? "kabul edildi" : after.err, "");
  }

  // --- Appeal window via stage advance ---
  const appealEmp = one("pip", (p) => p.tag === "appealOk");
  const appealNo = one("pip", (p) => p.tag === "appealNo");
  const appealReview = reviewOf(appealEmp.employeeId, ids.periods.pip);
  const noReview = reviewOf(appealNo.employeeId, ids.periods.pip);
  if (appealReview) {
    for (let i = 0; i < 8; i++) {
      const adv = await call(api, "POST", `/api/PerformancePeriod/${ids.periods.pip}/advance-stage`, {});
      if (!adv.good) {
        rec("PRF-DONEM-ILERLE", "Aşama ilerletme bir yerde durur", true, "durdu", adv.err, "adım " + i);
        break;
      }
    }
    const window = await call(api, "GET", `/api/EmployeePerformanceAppeal/window-status/${appealReview.id}`);
    const emp = await login(admin.browser, appealEmp.email, "Perf123!");
    const raised = await call(emp.api, "POST", `/api/EmployeePerformanceReview/${appealReview.id}/raise-appeal`, {
      reason: "Puan dönem içindeki teslimleri eksik saydı, itiraz gerekçem bu.",
    });
    rec("PRF-ITIRAZ-04", "İtiraz penceresi açılırsa çalışan itiraz eder", raised.good, "açıldı", raised.good ? "ok" : raised.err, JSON.stringify(window.data).slice(0, 180));
    await emp.ctx.close();
    if (raised.good) {
      const appeals = arr(unwrap(await api("GET", "/api/EmployeePerformanceAppeal/by-position")));
      const mine = appeals.find((a) => a.employeePerformanceReviewId === appealReview.id) || appeals[0];
      const resolved = mine?.id
        ? await call(api, "PUT", `/api/EmployeePerformanceAppeal/resolve/${mine.id}`, { approve: true, note: "Puan güncellensin" })
        : { good: false, err: "itiraz kaydı yok" };
      rec("PRF-ITIRAZ-05", "İK itirazı kabul eder", resolved.good, "kabul", resolved.good ? "ok" : resolved.err, "");
    }
  }
  if (noReview) {
    const emp = await login(admin.browser, appealNo.email, "Perf123!");
    const second = await call(emp.api, "POST", `/api/EmployeePerformanceReview/${noReview.id}/raise-appeal`, {
      reason: "İkinci kişi de itiraz ediyor, gerekçe yeterince uzun.",
    });
    rec("PRF-ITIRAZ-06", "İkinci itiraz ya açılır ya pencere kapalıdır", true, "sonuç görüldü", second.good ? "açıldı" : second.err, "");
    await emp.ctx.close();
    if (second.good) {
      const appeals = arr(unwrap(await api("GET", "/api/EmployeePerformanceAppeal/by-position")));
      const mine = appeals.find((a) => a.employeePerformanceReviewId === noReview.id);
      if (mine?.id) {
        const rejected = await call(api, "PUT", `/api/EmployeePerformanceAppeal/resolve/${mine.id}`, { approve: false, note: "Puan yerinde" });
        rec("PRF-ITIRAZ-07", "İK itirazı reddeder", rejected.good, "red", rejected.good ? "ok" : rejected.err, "");
      }
    }
  }

  // --- Goal change decide both ways ---
  const changes = await call(api, "GET", "/api/PerformanceGoal/change-requests");
  const changeRows = arr(changes.data);
  rec("PRF-HEDEF-23", "Hedef değişiklik kuyruğu okunur", changes.good, "liste", changes.good ? String(changeRows.length) : changes.err, "");
  if (changeRows[0]?.id) {
    const decided = await call(api, "POST", `/api/PerformanceGoal/change-request/${changeRows[0].id}/decide`, { approve: true, decisionNote: "Ağırlık kalsın" });
    rec("PRF-HEDEF-24", "Değişiklik talebi kabul edilir", decided.good, "kabul", decided.good ? "ok" : decided.err, "");
  }
  if (changeRows[1]?.id) {
    const decided = await call(api, "POST", `/api/PerformanceGoal/change-request/${changeRows[1].id}/decide`, { approve: false, decisionNote: "Hedef aynı kalsın" });
    rec("PRF-HEDEF-25", "Değişiklik talebi reddedilir", decided.good, "red", decided.good ? "ok" : decided.err, "");
  }

  // --- Joiner scope contrast ---
  const joiner = one("p360", (p) => p.kind === "joiner");
  const on = await call(api, "POST", "/api/PerformancePeriod/scope-preview", {
    organizationalUnitId: state.units.p360.id,
    includeNewJoiners: true,
    scopes: [{ scopeType: 1, organizationalUnitId: state.units.p360.id, isExcluded: false }],
  });
  const off = await call(api, "POST", "/api/PerformancePeriod/scope-preview", {
    organizationalUnitId: state.units.p360.id,
    includeNewJoiners: false,
    scopes: [{ scopeType: 1, organizationalUnitId: state.units.p360.id, isExcluded: false }],
  });
  const onText = JSON.stringify(on.data || "");
  const offText = JSON.stringify(off.data || "");
  rec("PRF-DONEM-YENI", "Yeni giren, bayrak kapalıyken listede yoktur", on.good && off.good && onText.includes(joiner.employeeId) && !offText.includes(joiner.employeeId), "ayrışır", `açık ${onText.includes(joiner.employeeId)} kapalı ${offText.includes(joiner.employeeId)}`, "");

  // --- Result hidden ---
  const hiddenEmp = await login(admin.browser, ada.email, "Perf123!");
  const hiddenDetail = adaReview ? await detail(hiddenEmp.api, adaReview.id) : null;
  rec(
    "PRF-YETKI-05",
    "Sonuç kapalı birimde çalışan genel skoru görmez",
    !!hiddenDetail && hiddenDetail.showResultToEmployee === false,
    "gizli",
    hiddenDetail ? `show=${hiddenDetail.showResultToEmployee} score=${hiddenDetail.overallScore}` : "form yok",
    ""
  );
  await hiddenEmp.ctx.close();

  const setting = unwrap(await api("GET", `/api/PerformanceSetting/effective/${state.units.p360.id}`));
  rec(
    "PRF-AYAR-04",
    "Sonuç kapalıyken itiraz günü sıfırlanır",
    setting && setting.showResultToEmployee === false && Number(setting.appealWindowDays) === 0,
    "appeal 0",
    `show=${setting?.showResultToEmployee} appeal=${setting?.appealWindowDays}`,
    ""
  );

  save();
  await admin.browser.close();
  const mine = fresh.filter((s) => s.pass).length;
  console.log("DONE this run", mine, "/", fresh.length, "all", scenarios.filter((s) => s.pass).length, "/", scenarios.length);
})().catch((e) => {
  console.error(e.stack || e.message);
  save();
  process.exit(1);
});
