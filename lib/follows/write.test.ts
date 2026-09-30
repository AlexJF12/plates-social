import type { Client } from "@atproto/lex";
import { afterAll, describe, expect, it } from "vitest";
import { COLLECTIONS } from "../config";
import { getDb } from "../db";
import { inRollback } from "../db/testing";
import { followMany, IMPORT_BATCH } from "./write";

afterAll(() => getDb().destroy());

const ME = "did:plc:testme000000000000000000";
const did = (i: number) => `did:plc:follow${String(i).padStart(19, "0")}`;

type Op = { $type: string; collection: string; rkey: string; value: { subject: string } };

// Records each applyWrites batch; fails the batch numbered `failOn`.
function fakeClient(failOn?: number) {
  const batches: Op[][] = [];
  const client = {
    async applyWrites(factory: (op: unknown) => Iterable<Op>) {
      const op = {
        create: (ns: { $type: string }, value: Op["value"], { rkey }: { rkey: string }) => ({
          $type: "com.atproto.repo.applyWrites#create",
          collection: ns.$type,
          rkey,
          value,
        }),
      };
      const ops = [...factory(op)];
      if (batches.length === failOn) throw new Error("PDS said no");
      batches.push(ops);
      return { body: {} };
    },
  };
  return { client: client as unknown as Client, batches };
}

describe("followMany", () => {
  it("writes ≤100 follows per applyWrites and indexes each one", async () => {
    await inRollback(async (db) => {
      const subjects = Array.from({ length: 250 }, (_, i) => did(i));
      const { client, batches } = fakeClient();
      expect(await followMany(client, db, ME, subjects)).toEqual({ followed: 250 });

      expect(batches.map((b) => b.length)).toEqual([IMPORT_BATCH, IMPORT_BATCH, 50]);
      const ops = batches.flat();
      expect(ops.every((o) => o.collection === COLLECTIONS.follow)).toBe(true);
      expect(ops.map((o) => o.value.subject)).toEqual(subjects);
      expect(new Set(ops.map((o) => o.rkey)).size).toBe(250);

      const rows = await db.selectFrom("follow").selectAll().where("authorDid", "=", ME).execute();
      expect(rows).toHaveLength(250);
      const byUri = new Map(rows.map((r) => [r.uri, r.subjectDid]));
      for (const o of ops) expect(byUri.get(`at://${ME}/${COLLECTIONS.follow}/${o.rkey}`)).toBe(o.value.subject);
    });
  });

  it("stops at a failed batch and keeps the batches that landed", async () => {
    await inRollback(async (db) => {
      const subjects = Array.from({ length: 250 }, (_, i) => did(i));
      const { client } = fakeClient(1);
      const result = await followMany(client, db, ME, subjects);
      expect(result.followed).toBe(IMPORT_BATCH);
      expect(result.error).toBeInstanceOf(Error);
      const rows = await db.selectFrom("follow").select("subjectDid").where("authorDid", "=", ME).execute();
      expect(rows.map((r) => r.subjectDid).sort()).toEqual(subjects.slice(0, IMPORT_BATCH));
    });
  });
});
