import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COLLECTIONS, SCOPE } from "@/lib/config";
import { getDb } from "@/lib/db";

// /api/visit against a fake PDS: the OAuth session is replaced by an object
// with the same shape the lex Client uses (`did` + `fetchHandler`), so the
// route's real Client calls (createRecord, getRecord, deleteRecord) land in
// `pds` below. The index writes go to the local Postgres for a test DID and
// are removed after each test.
if (!process.env.DATABASE_URL) process.loadEnvFile(".env.local");

const ME = "did:plc:testvisitroute0000000000";
const RKEY = "3mwovhkvtw723";
const URI = `at://${ME}/${COLLECTIONS.visit}/${RKEY}`;
const BLOB_CID = "bafkreibme22gw2h7y2h7tg2fhqotaqjucnbc24deqo72b6mkl2egezxhvy";
const RECORD_CID = "bafyreihmsoquhgytsqbyiegd2sytontm55s765olkl5nzdoabvhud46kia";

type Call = { nsid: string; body: Record<string, unknown> | null; query: URLSearchParams };
let pds: {
  records: Map<string, unknown>;
  calls: Call[];
  failCreate: "no" | "before" | "after";
  scope: string;
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const fakeSession = () => ({
  did: ME,
  getTokenInfo: async () => ({ scope: pds.scope }),
  fetchHandler: async (path: string, init: RequestInit) => {
    const url = new URL(path, "https://pds.test");
    const nsid = url.pathname.replace("/xrpc/", "");
    const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
    pds.calls.push({ nsid, body, query: url.searchParams });
    if (nsid === "com.atproto.repo.createRecord") {
      if (pds.failCreate === "after") pds.records.set(body.rkey, body.record);
      if (pds.failCreate !== "no") return json(500, { error: "InternalServerError" });
      pds.records.set(body.rkey, body.record);
      return json(200, { uri: `at://${ME}/${body.collection}/${body.rkey}`, cid: RECORD_CID });
    }
    if (nsid === "com.atproto.repo.getRecord") {
      const rkey = url.searchParams.get("rkey")!;
      const value = pds.records.get(rkey);
      if (!value) return json(400, { error: "RecordNotFound", message: "Could not locate record" });
      return json(200, { uri: `at://${ME}/${url.searchParams.get("collection")}/${rkey}`, cid: RECORD_CID, value });
    }
    if (nsid === "com.atproto.repo.deleteRecord") {
      pds.records.delete(body.rkey);
      return json(200, {});
    }
    return json(400, { error: "MethodNotImplemented" });
  },
});

let session: ReturnType<typeof fakeSession> | null;
vi.mock("@/lib/auth/session", () => ({ getSession: async () => session }));

const { DELETE, POST } = await import("./route");

const req = (method: string, body: unknown) =>
  new NextRequest("http://127.0.0.1:3000/api/visit", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const valid = (overrides: object = {}) => ({
  rkey: RKEY,
  restaurantName: " Lilia ",
  restaurantArea: "Brooklyn",
  rating: 4,
  review: "Agnolotti.",
  mealType: "dinner",
  visitedAt: "2026-10-14T20:15:00-04:00",
  images: [{ blob: { $type: "blob", ref: { $link: BLOB_CID }, mimeType: "image/jpeg", size: 1234 }, alt: "Pasta", width: 3, height: 4 }],
  ...overrides,
});

const row = () => getDb().selectFrom("visit").selectAll().where("uri", "=", URI).executeTakeFirst();

beforeEach(() => {
  pds = { records: new Map(), calls: [], failCreate: "no", scope: SCOPE };
  session = fakeSession();
});

afterEach(async () => {
  await getDb().deleteFrom("visit").where("authorDid", "=", ME).execute();
  await getDb().deleteFrom("account").where("did", "=", ME).execute();
});

afterAll(() => getDb().destroy());

describe("POST /api/visit", () => {
  it("writes the record to the PDS and indexes it straight away", async () => {
    const res = await POST(req("POST", valid()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ uri: URI, cid: RECORD_CID });

    const create = pds.calls.find((c) => c.nsid === "com.atproto.repo.createRecord")!;
    expect(create.body).toMatchObject({ repo: ME, collection: COLLECTIONS.visit, rkey: RKEY });
    expect(create.body!.record).toMatchObject({
      $type: COLLECTIONS.visit,
      restaurant: { name: "Lilia", area: "Brooklyn" },
      rating: 4,
      review: "Agnolotti.",
      mealType: "dinner",
      visitedAt: "2026-10-14T20:15:00-04:00",
      images: [{ image: { $type: "blob", ref: { $link: BLOB_CID }, mimeType: "image/jpeg", size: 1234 }, alt: "Pasta", aspectRatio: { width: 3, height: 4 } }],
    });

    expect(await row()).toMatchObject({
      cid: RECORD_CID,
      authorDid: ME,
      restaurantName: "Lilia",
      restaurantArea: "Brooklyn",
      rating: 4,
      visitedLocalDate: "2026-10-14",
    });
  });

  it("leaves out an empty area and review instead of writing empty strings", async () => {
    await POST(req("POST", valid({ restaurantArea: "  ", review: "" })));
    const record = pds.records.get(RKEY) as Record<string, unknown>;
    expect(record.restaurant).toEqual({ name: "Lilia" });
    expect(record).not.toHaveProperty("review");
    expect(await row()).toMatchObject({ restaurantArea: null, review: null });
  });

  it("a retry after a lost response finds the record instead of posting twice", async () => {
    pds.failCreate = "after"; // it landed, but the PDS answer was an error
    const res = await POST(req("POST", valid()));
    expect(res.status).toBe(200);
    expect(pds.records.size).toBe(1);
    expect(await row()).toBeTruthy();
  });

  it("a real PDS failure is a 502 and indexes nothing", async () => {
    pds.failCreate = "before";
    const res = await POST(req("POST", valid()));
    expect(res.status).toBe(502);
    expect(await row()).toBeUndefined();
  });

  it.each([
    ["rating 0", { rating: 0 }],
    ["rating 6", { rating: 6 }],
    ["rating as a string", { rating: "4" }],
    ["no rating", { rating: undefined }],
    ["no restaurant name", { restaurantName: "  " }],
    ["101-grapheme name", { restaurantName: "a".repeat(101) }],
    ["1001-grapheme review", { review: "a".repeat(1001) }],
    ["no photos", { images: [] }],
    ["5 photos", { images: Array(5).fill(valid().images[0]) }],
    ["visitedAt without an offset", { visitedAt: "2026-10-14T20:15" }],
    ["unknown meal type", { mealType: "brunch" }],
    ["bad rkey", { rkey: "hello" }],
  ])("rejects %s with 400 before touching the PDS", async (_, overrides) => {
    const res = await POST(req("POST", valid(overrides)));
    expect(res.status).toBe(400);
    expect(pds.calls).toEqual([]);
  });

  it("accepts drinks", async () => {
    expect((await POST(req("POST", valid({ mealType: "drinks" })))).status).toBe(200);
  });

  it("a session without the visit scope gets 403 reauth and writes nothing", async () => {
    pds.scope = SCOPE.split(" ").filter((s) => !s.includes(".visit")).join(" ");
    const res = await POST(req("POST", valid()));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ reauth: true });
    expect(pds.calls).toEqual([]);
  });

  it("signed out is a 401", async () => {
    session = null;
    expect((await POST(req("POST", valid()))).status).toBe(401);
  });
});

describe("DELETE /api/visit", () => {
  it("deletes the record and the row, and a retry still succeeds", async () => {
    await POST(req("POST", valid()));
    const res = await DELETE(req("DELETE", { rkey: RKEY }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: URI });
    const del = pds.calls.find((c) => c.nsid === "com.atproto.repo.deleteRecord")!;
    expect(del.body).toMatchObject({ repo: ME, collection: COLLECTIONS.visit, rkey: RKEY });
    expect(pds.records.size).toBe(0);
    expect(await row()).toBeUndefined();
    expect((await DELETE(req("DELETE", { rkey: RKEY }))).status).toBe(200);
  });

  it("needs the visit scope, a TID and a session", async () => {
    expect((await DELETE(req("DELETE", { rkey: "nope" }))).status).toBe(400);
    pds.scope = "atproto";
    expect((await DELETE(req("DELETE", { rkey: RKEY }))).status).toBe(403);
    session = null;
    expect((await DELETE(req("DELETE", { rkey: RKEY }))).status).toBe(401);
    expect(pds.calls).toEqual([]);
  });
});
