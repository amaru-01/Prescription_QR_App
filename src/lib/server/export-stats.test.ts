import { beforeEach, describe, expect, it, vi } from "vitest";

type Doc = { id: string; data: Record<string, unknown> };

/** Fake prescriptions collection supporting the query shapes the export and stats code use. */
const { store } = vi.hoisted(() => ({
  store: { docs: [] as Doc[], counts: 0, pages: [] as number[] },
}));

vi.mock("./firebase", () => {
  const snapshot = (doc: Doc) => ({ id: doc.id, data: () => doc.data, get: (f: string) => doc.data[f] });

  const query = (docs: () => Doc[], after?: string, size = 1_000_000) => ({
    orderBy: () => query(docs, after, size),
    select: () => query(docs, after, size),
    limit: (n: number) => query(docs, after, n),
    startAfter: (last: { id: string }) => query(docs, last.id, size),
    where: () => query(docs, after, size),
    count: () => ({
      get: async () => {
        store.counts += 1;
        return { data: () => ({ count: docs().length }) };
      },
    }),
    get: async () => {
      const all = docs();
      const start = after ? all.findIndex((d) => d.id === after) + 1 : 0;
      const page = all.slice(start, start + size);
      store.pages.push(page.length);
      return { docs: page.map(snapshot), size: page.length, empty: page.length === 0 };
    },
  });

  return {
    getDb: () => ({
      collection: () => ({ doc: () => ({ collection: () => query(() => store.docs) }) }),
    }),
  };
});

const { EXPORT_ROW_LIMIT, exportPrescriptionsStream, getPrescriptionStats } = await import("./prescriptions");

const makeDocs = (n: number, med = (i: number) => `Drug ${i}`): Doc[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `id${String(i).padStart(5, "0")}`,
    data: { med: med(i), dose: "5mg", duration: "7 days", status: "active", source: "scan", notes: null },
  }));

const read = (stream: ReadableStream<Uint8Array>) => new Response(stream).text();

beforeEach(() => {
  store.docs = [];
  store.counts = 0;
  store.pages = [];
});

describe("exportPrescriptionsStream", () => {
  it("writes only the header for an account with no records", async () => {
    const csv = await read(exportPrescriptionsStream("u1"));
    expect(csv).toBe('"ID","Medication","Dosage","Duration","Status","Source","Notes","Created At"');
  });

  it("exports every record, not just the first 500", async () => {
    store.docs = makeDocs(1_200);
    const lines = (await read(exportPrescriptionsStream("u1"))).split("\r\n");
    expect(lines).toHaveLength(1 + 1_200);
    expect(lines[1]).toContain("Drug 0");
    expect(lines[1_200]).toContain("Drug 1199");
  });

  it("reads in pages rather than loading everything at once", async () => {
    store.docs = makeDocs(450);
    await read(exportPrescriptionsStream("u1"));
    expect(Math.max(...store.pages)).toBeLessThanOrEqual(200);
  });

  it("stops at the row limit and says the export is incomplete", async () => {
    store.docs = makeDocs(12);
    const lines = (await read(exportPrescriptionsStream("u1", 5))).split("\r\n");
    expect(lines).toHaveLength(1 + 5 + 1);
    expect(lines[6]).toBe('"Export limited to the newest 5 records."');
  });

  it("does not add the note when the records fit exactly", async () => {
    store.docs = makeDocs(5);
    const csv = await read(exportPrescriptionsStream("u1", 5));
    expect(csv).not.toContain("Export limited");
    expect(csv.split("\r\n")).toHaveLength(6);
  });

  it("neutralises spreadsheet formulas in streamed rows", async () => {
    store.docs = makeDocs(1, () => "=HYPERLINK(\"http://evil\")");
    expect(await read(exportPrescriptionsStream("u1"))).toContain(`"'=HYPERLINK`);
  });

  it("has a generous default limit", () => {
    expect(EXPORT_ROW_LIMIT).toBe(20_000);
  });
});

describe("getPrescriptionStats", () => {
  it("counts distinct medications across all records, ignoring case and spacing", async () => {
    // 2,500 records (three scan pages) cycling through 700 distinct names, with case/space noise.
    store.docs = makeDocs(2_500, (i) => (i % 2 ? ` DRUG ${i % 700} ` : `drug ${i % 700}`));
    const stats = await getPrescriptionStats("stats-all");
    expect(stats.uniqueMeds).toBe(700);
    expect(stats.total).toBe(2_500);
  });

  it("serves repeat requests from a short-lived cache", async () => {
    store.docs = makeDocs(10);
    await getPrescriptionStats("stats-cache");
    const afterFirst = store.counts;
    await getPrescriptionStats("stats-cache");
    expect(store.counts).toBe(afterFirst);
  });

  it("keeps separate caches per user", async () => {
    store.docs = makeDocs(3);
    await getPrescriptionStats("stats-a");
    const afterFirst = store.counts;
    await getPrescriptionStats("stats-b");
    expect(store.counts).toBeGreaterThan(afterFirst);
  });
});
