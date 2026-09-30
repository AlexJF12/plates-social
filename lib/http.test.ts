import { describe, expect, it } from "vitest";
import { COLLECTIONS } from "./config";
import { isOwnRecordUri } from "./http";

const ME = "did:plc:testalice00000000000000a";
const OTHER = "did:plc:testbob000000000000000b";
const RKEY = "3mwovhkvtw723";

describe("isOwnRecordUri", () => {
  it("accepts only the viewer's own record in that collection", () => {
    expect(isOwnRecordUri(`at://${ME}/${COLLECTIONS.comment}/${RKEY}`, ME, COLLECTIONS.comment)).toBe(true);
    expect(isOwnRecordUri(`at://${OTHER}/${COLLECTIONS.comment}/${RKEY}`, ME, COLLECTIONS.comment)).toBe(false);
    expect(isOwnRecordUri(`at://${ME}/${COLLECTIONS.cook}/${RKEY}`, ME, COLLECTIONS.comment)).toBe(false);
    expect(isOwnRecordUri(`at://${ME}/${COLLECTIONS.comment}/self`, ME, COLLECTIONS.comment)).toBe(false);
    expect(isOwnRecordUri(`at://${ME}/${COLLECTIONS.comment}/${RKEY}?x=1`, ME, COLLECTIONS.comment)).toBe(false);
    expect(isOwnRecordUri("garbage", ME, COLLECTIONS.comment)).toBe(false);
    expect(isOwnRecordUri(42, ME, COLLECTIONS.comment)).toBe(false);
  });
});
