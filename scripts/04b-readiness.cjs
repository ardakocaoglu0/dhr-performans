const { openAdmin, unwrap, writeJson } = require("./dhr.cjs");
const ids = require("../data/lab-ids.json");
(async () => {
  const { browser, api } = await openAdmin();
  const out = {};
  for (const [k, id] of Object.entries(ids.periods)) {
    const r = await api("GET", `/api/PerformancePeriod/${id}/readiness`);
    const data = unwrap(r);
    out[k] = (data?.issues || []).map((i) => ({ code: i.code, blocking: i.isBlocking, message: i.message }));
    console.log("\n==", k, "can", data?.canStart, "employees", data?.employeeCount);
    for (const i of out[k]) console.log(i.blocking ? "BLOCK" : "warn", i.code, i.message);
  }
  writeJson("data/readiness.json", out);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
