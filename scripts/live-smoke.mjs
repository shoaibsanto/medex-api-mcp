/**
 * Live smoke test: runs the LiveProvider against the real medex.com.bd.
 *
 * Usage:  npm run build && node scripts/live-smoke.mjs
 *
 * This performs a handful of real navigations (polite delay applies) and
 * prints what was extracted plus the source URL of each record, so a human
 * can verify the data came from live pages. It asserts only structural
 * invariants (non-empty names, live source attribution, real prices) — never
 * hard-coded expected values, because the site's content changes.
 */
import { LiveProvider } from "../dist/provider/live-provider.js";

const provider = new LiveProvider();
let failures = 0;

function check(label, ok, detail) {
  const mark = ok ? "PASS" : "FAIL";
  if (!ok) failures++;
  console.log(`  [${mark}] ${label}${detail ? ` — ${detail}` : ""}`);
}

try {
  console.log("1) search_medicines(q='napa')");
  const search = await provider.searchMedicines({ q: "napa", limit: 5 });
  check("returns at least 3 brands", search.data.length >= 3, `${search.data.length} rows`);
  check("every row has a live source URL", search.data.every((m) => m.source.kind === "live" && !!m.source.sourceUrl));
  check("no fabricated prices on search rows", search.data.every((m) => m.priceBdt === null));
  const first = search.data[0];
  console.log(`     first: ${first.id} | ${first.name} | ${first.strength ?? "-"} | ${first.generic} | ${first.manufacturerName ?? "-"}`);

  console.log("2) get_medicine_details(id=<from search>)");
  const med = await provider.getMedicine(first.id);
  check("record found", !!med);
  check("name is non-empty", !!med?.data.name, med?.data.name);
  check("price is a real number (or null if page hides it)", med?.data.priceBdt === null || med?.data.priceBdt > 0, `price=${med?.data.priceBdt}`);
  check("generic is non-empty", !!med?.data.generic, med?.data.generic);
  check("source URL points at the brand page", (med?.source.sourceUrl ?? "").includes(`/brands/${first.id}`), med?.source.sourceUrl);
  console.log(`     detail: ${med?.data.name} ${med?.data.strength ?? ""} | ${med?.data.dosageForm} | ৳${med?.data.priceBdt} | ${med?.data.package ?? "-"} | class: ${med?.data.categories.join(", ") || "-"}`);

  console.log("3) get_medicine_details(id='999999999') — must be not-found, not fabricated");
  const missing = await provider.getMedicine("999999999");
  check("returns null for unknown id", missing === null);

  console.log("4) search_generics(q='paracetamol')");
  const generics = await provider.searchGenerics({ q: "paracetamol", limit: 5 });
  check("returns at least 1 generic", generics.data.length >= 1, `${generics.data.length} rows`);
  check("generic names non-empty", generics.data.every((g) => !!g.name), generics.data[0]?.name);

  console.log("5) get_generic_details(id=<from search>)");
  const gen = await provider.getGeneric(generics.data[0].id);
  check("record found", !!gen);
  check("brandCount is a positive number", (gen?.data.brandCount ?? 0) > 0, `brandCount=${gen?.data.brandCount}`);

  console.log("6) list_manufacturers(limit=5)");
  const makers = await provider.listManufacturers({ limit: 5 });
  check("returns companies", makers.data.length >= 3, `${makers.data.length} rows`);
  check("productCounts are published numbers", makers.data.some((m) => (m.productCount ?? 0) > 0));
  const maker = makers.data.find((m) => (m.productCount ?? 0) > 0) ?? makers.data[0];
  console.log(`     company: ${maker.id} | ${maker.name} | ${maker.productCount} brand names`);

  console.log("7) list_manufacturer_medicines(id=<company>)");
  const makerMeds = await provider.listManufacturerMedicines(maker.id, { limit: 5 });
  check("returns that company's brands", makerMeds.data.length >= 1, `${makerMeds.data.length} rows`);
  check("all rows carry manufacturerId", makerMeds.data.every((m) => m.manufacturerId === maker.id));
  console.log(`     brand: ${makerMeds.data[0]?.name} ${makerMeds.data[0]?.strength ?? ""} (${makerMeds.data[0]?.dosageForm})`);

  console.log("8) list_medicine_categories(limit=5)");
  const cats = await provider.listCategories({ limit: 5 });
  check("returns drug classes", cats.data.length >= 3, `${cats.data.length} rows`);

  console.log("9) list_category_medicines(id=<first class>)");
  const catMeds = await provider.listCategoryMedicines(cats.data[0].id, { limit: 5 });
  check("call completes without error", true, `note: ${catMeds.meta.note ?? "-"}`);
  if (catMeds.data.length > 0) {
    check("category brands have live sources", catMeds.data.every((m) => m.source.kind === "live"));
    console.log(`     brand: ${catMeds.data[0].name} ${catMeds.data[0].strength ?? ""} | class: ${catMeds.data[0].categories.join(",")}`);
  }
} catch (err) {
  failures++;
  console.error("UNEXPECTED ERROR:", err);
} finally {
  await provider.close();
}

console.log(failures === 0 ? "\nSMOKE TEST: all checks passed." : `\nSMOKE TEST: ${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
