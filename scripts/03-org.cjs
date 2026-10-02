const fs = require("fs");
const path = require("path");
const { openAdmin, unwrap, arr, ok, errText, sleep, writeJson } = require("./dhr.cjs");

const ROOT = "d93d6660-892d-4dcf-8fc2-36bed171017a";
const PASS = "Perf123!";
const ABS = {
  my: "891c1d92-85b9-4e89-9954-0529117c695a",
  mgmt: "12e994f0-107e-41fb-a379-c6010c9148e6",
  pip: "c98a2edb-0c2c-4806-85bc-4fb391eece4b",
  empPerf: "73925e7a-8581-469d-8166-0884923fb8f5",
};

const NAMES = [
  ["Selin", "Aydin"], ["Kerem", "Yilmaz"], ["Elif", "Demir"],
  ["Ada", "Korkmaz"], ["Berk", "Yalcin"], ["Canan", "Aslan"],
  ["Defne", "Koc"], ["Efe", "Sahin"], ["Feride", "Aksoy"],
  ["Gokce", "Arslan"], ["Hakan", "Boz"], ["Isik", "Demirci"],
  ["Jale", "Kaya"], ["Nazli", "Er"], ["Oya", "Polat"],
  ["Murat", "Koc"], ["Pinar", "Celik"], ["Ruya", "Tan"],
  ["Seda", "Nur"], ["Tolga", "Ergin"], ["Umut", "Acar"],
  ["Vildan", "Tas"], ["Deniz", "Sahin"], ["Yusuf", "Kilic"],
  ["Zehra", "Ucar"], ["Ali", "Cetin"], ["Berna", "Dogan"],
  ["Cem", "Aydin"], ["Derya", "Kurt"], ["Emre", "Ozkan"],
  ["Funda", "Yildiz"], ["Gizem", "Akar"], ["Harun", "Sari"],
  ["Irem", "Bal"], ["Burcu", "Eren"], ["Kaan", "Oz"],
  ["Leman", "Su"], ["Mert", "Acar"], ["Nihan", "Gunes"],
  ["Onur", "Tekin"], ["Pelin", "Aydin"], ["Serkan", "Usta"],
  ["Can", "Polat"], ["Melis", "Akin"], ["Baran", "Efe"],
];

function mail(first, last) {
  return (first + last).toLowerCase().replace(/[^a-z]/g, "") + "@perf.com";
}

function buildRoster() {
  const rows = [];
  let i = 0;
  let sicil = 7101;
  const take = (unit, kind, title, extra = {}) => {
    const [firstName, lastName] = NAMES[i++];
    const row = {
      sicil: String(sicil++),
      firstName,
      lastName,
      email: mail(firstName, lastName),
      gender: i % 2 ? "Female" : "Male",
      title,
      unit,
      kind,
      hire: extra.hire || "2024-03-04",
      ...extra,
    };
    rows.push(row);
    return row;
  };
  const selin = take("p360", "director", "Performans Müdürü");
  const kerem = take("p360", "lead", "Takım Lideri", { manager: selin.sicil });
  const elif = take("p360", "lead", "Takım Lideri", { manager: selin.sicil });
  for (let n = 0; n < 3; n++) take("p360", "ic", "Uzman", { manager: kerem.sicil });
  for (let n = 0; n < 3; n++) take("p360", "ic", "Uzman", { manager: elif.sicil });
  for (let n = 0; n < 3; n++) take("p360", "peer", "Kıdemli Uzman", { manager: selin.sicil });
  take("p360", "joiner", "Yeni Uzman", { manager: kerem.sicil, hire: "2026-06-15" });
  take("p360", "excluded", "Kapsam Dışı Uzman", { manager: elif.sicil });
  const murat = take("kpi", "director", "KPI Müdürü");
  for (let n = 0; n < 6; n++) take("kpi", "ic", "Uzman", { manager: murat.sicil });
  const deniz = take("box", "director", "Yetenek Müdürü");
  for (let n = 0; n < 10; n++) take("box", "ic", "Uzman", { manager: deniz.sicil, cell: n < 9 ? n : "move" });
  const burcu = take("pip", "director", "Gelişim Müdürü");
  const pipKinds = ["high", "threshold", "appealOk", "appealNo", "pipActive", "pipClose", "actionCancel"];
  pipKinds.forEach((tag) => take("pip", "ic", "Uzman", { manager: burcu.sicil, tag }));
  const can = take("miras", "director", "Miras Müdürü");
  take("miras", "ic", "Uzman", { manager: can.sicil });
  take("miras", "ic", "Uzman", { manager: can.sicil });
  if (i !== 43) throw new Error("roster size " + i);
  return rows;
}

(async () => {
  const roster = buildRoster();
  const { browser, api } = await openAdmin();
  const units = arr(unwrap(await api("GET", "/api/OrganizationalUnit/filteredByUnitAbilities")));
  const location = units.find((u) => u.location)?.location || "İstanbul";
  const hours = arr(unwrap(await api("GET", "/api/WorkingHourType/all")));
  const wh = hours.find((h) => /09:00/.test(h.name || "")) || hours[0];
  const rootRoles = arr(unwrap(await api("GET", `/api/OrganizationalUnit/${ROOT}/roles`)));
  const cal = rootRoles.find((r) => r.name === "Çalışan");
  const calIds = (cal?.roleAbilities || []).map((a) => a.abilityId).filter(Boolean);
  const employeeAbs = [...new Set([...calIds, ABS.my, ABS.pip])].filter((id) => id !== ABS.mgmt);
  const managerAbs = [...new Set([...employeeAbs, ABS.mgmt, ABS.empPerf])];

  async function ensureUnit(name, parentId) {
    const hit = units.find((u) => u.name === name && (u.parentId || null) === parentId);
    if (hit) return hit;
    const r = await api("POST", "/api/OrganizationalUnit", { name, parentId, location });
    if (!ok(r)) throw new Error("unit " + name + " " + errText(r));
    const created = unwrap(r);
    units.push(created);
    console.log("UNIT", name, created.id);
    return created;
  }

  const parent = await ensureUnit("Performans Test", ROOT);
  const children = {
    miras: await ensureUnit("Perf Miras", parent.id),
    p360: await ensureUnit("Perf 360", parent.id),
    kpi: await ensureUnit("Perf KPI", parent.id),
    box: await ensureUnit("Perf 9Box", parent.id),
    pip: await ensureUnit("Perf PIP", parent.id),
  };

  const roleIds = {};
  for (const [key, ou] of Object.entries({ parent, ...children })) {
    let roles = arr(unwrap(await api("GET", `/api/OrganizationalUnit/${ou.id}/roles`)));
    for (const name of ["Perf Çalışan", "Perf Yönetici"]) {
      if (!roles.find((r) => r.name === name)) {
        const r = await api("POST", "/api/Role", { name, organizationalUnitId: ou.id });
        console.log("ROLE", ou.name, name, r.status, ok(r) ? "ok" : errText(r));
      }
    }
    roles = arr(unwrap(await api("GET", `/api/OrganizationalUnit/${ou.id}/roles`)));
    const empRole = roles.find((r) => r.name === "Perf Çalışan");
    const mgrRole = roles.find((r) => r.name === "Perf Yönetici");
    await api("POST", "/api/RoleAbility/bulk-update", { roleId: empRole.id, abilityIds: employeeAbs });
    await api("POST", "/api/RoleAbility/bulk-update", { roleId: mgrRole.id, abilityIds: managerAbs });
    roleIds[ou.id] = { employee: empRole.id, manager: mgrRole.id };
  }

  const emps = arr(unwrap(await api("GET", "/api/Employee/filteredByUnitAbilities")));
  let positions = arr(unwrap(await api("GET", "/api/OrganizationalUnitPosition/filteredByUnitAbilities")));
  const users = arr(unwrap(await api("GET", "/api/User/all")));
  const bySicil = {};

  async function ensurePerson(p) {
    const ou = children[p.unit];
    const isMgr = p.kind === "director" || p.kind === "lead";
    const roleId = isMgr ? roleIds[ou.id].manager : roleIds[ou.id].employee;
    let emp = emps.find((e) => String(e.employeeNumber) === p.sicil);
    if (!emp) {
      const r = await api("POST", "/api/Employee", {
        employeeNumber: p.sicil,
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email,
        gender: p.gender,
        phoneNumber: `+90555${p.sicil.slice(-7).padStart(7, "0")}`,
        birthDate: `1990-04-${String((Number(p.sicil) % 27) + 1).padStart(2, "0")}T00:00:00`,
      });
      if (!ok(r)) throw new Error("emp " + p.sicil + " " + errText(r));
      emp = unwrap(r);
      emps.push(emp);
    }
    let pos = positions.find((x) => x.employeeId === emp.id && x.organizationalUnitId === ou.id);
    const mgr = p.manager ? bySicil[p.manager] : null;
    if (!pos) {
      const body = {
        title: p.title,
        organizationalUnitId: ou.id,
        employeeId: emp.id,
        roleId,
        workingHourTypeId: wh?.id ? JSON.stringify([wh.id]) : undefined,
        employmentType: "Full-time",
        directManagerPositionId: mgr?.positionId || null,
        hrManagerPositionId: mgr?.positionId || null,
        startDate: p.hire,
        reminderEnabled: false,
        isTerminated: false,
      };
      let r = await api("POST", "/api/OrganizationalUnitPosition", body);
      if (!ok(r)) {
        body.workingHourTypeId = wh?.id;
        r = await api("POST", "/api/OrganizationalUnitPosition", body);
      }
      if (!ok(r)) throw new Error("pos " + p.sicil + " " + errText(r));
      pos = unwrap(r);
      positions.push(pos);
    }
    const user = await api("POST", "/api/User/create-user-with-password", {
      email: p.email,
      employeeId: emp.id,
      password: PASS,
    });
    if (!ok(user) && !/already|mevcut|exist|kayıt|kayit/i.test(user.text || "")) {
      console.log("USER", p.email, user.status, errText(user));
    }
    const userRow = users.find((u) => String(u.email || "").toLowerCase() === p.email) || unwrap(user);
    const userId = userRow?.id || unwrap(user)?.id;
    if (userId) {
      await api("PUT", `/api/Auth/${userId}`, { email: p.email, roleId });
    }
    bySicil[p.sicil] = {
      ...p,
      employeeId: emp.id,
      positionId: pos.id,
      userId: userId || null,
      unitId: ou.id,
      roleId,
    };
    if (mgr?.positionId) {
      await api("POST", "/api/UnitPositionPerformanceFlowStep", {
        step: 1,
        approvalUnitPositionId: mgr.positionId,
        ownerUnitPositionId: pos.id,
      });
    }
    console.log("PERSON", p.sicil, p.email, p.unit, p.kind);
    await sleep(80);
  }

  for (const p of roster.filter((x) => !x.manager)) await ensurePerson(p);
  for (const p of roster.filter((x) => x.manager && (x.kind === "lead"))) await ensurePerson(p);
  for (const p of roster.filter((x) => x.manager && x.kind !== "lead")) await ensurePerson(p);

  const state = {
    at: new Date().toISOString(),
    password: PASS,
    rootId: ROOT,
    parent: { id: parent.id, name: parent.name },
    units: Object.fromEntries(Object.entries(children).map(([k, u]) => [k, { id: u.id, name: u.name }])),
    roleIds,
    employeeAbilityCount: employeeAbs.length,
    managerAbilityCount: managerAbs.length,
    workingHour: { id: wh?.id, name: wh?.name },
    people: bySicil,
  };
  writeJson("data/state.json", state);
  writeJson("data/roster-public.json", roster.map((p) => ({ sicil: p.sicil, name: p.firstName + " " + p.lastName, email: p.email, unit: p.unit, title: p.title, kind: p.kind, tag: p.tag || p.cell || null })));
  console.log("PEOPLE", Object.keys(bySicil).length);
  await browser.close();
})().catch((e) => {
  console.error("FAIL", e.stack || e.message);
  process.exit(1);
});
