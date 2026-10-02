const { openAdmin, unwrap, arr } = require("./dhr.cjs");
const ids = require("../data/lab-ids.json");
(async () => {
  const { browser, api } = await openAdmin();
  const reviews = arr(unwrap(await api("GET", "/api/EmployeePerformanceReview/all")));
  const rev = reviews.find((r) => r.performancePeriodId === ids.periods.miras) || reviews[0];
  const detail = unwrap(await api("GET", `/api/EmployeePerformanceReview/${rev.id}/details`));
  console.log("keys", Object.keys(detail || {}));
  console.log(JSON.stringify(detail, null, 2).slice(0, 2500));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
