import { describe, expect, it } from "vitest";
import { decodeSessionCookie, encodeSessionCookie } from "./cookie";

const SECRET = "a".repeat(64);
const DID = "did:plc:ewvi7nxzyoun6zhxrhs64oiz";

describe("session cookie", () => {
  it("round-trips a DID", () => {
    expect(decodeSessionCookie(encodeSessionCookie(DID, SECRET), SECRET)).toBe(
      DID,
    );
  });

  it("round-trips a did:web containing dots and colons", () => {
    const did = "did:web:example.com%3A8080";
    expect(decodeSessionCookie(encodeSessionCookie(did, SECRET), SECRET)).toBe(
      did,
    );
  });

  it("rejects a bare DID (the forgeable Statusphere format)", () => {
    expect(decodeSessionCookie(DID, SECRET)).toBeNull();
  });

  it("rejects a DID swapped under someone else's signature", () => {
    const [, sig] = encodeSessionCookie(DID, SECRET).split(/\.(?=[^.]*$)/);
    expect(decodeSessionCookie(`did:plc:attacker.${sig}`, SECRET)).toBeNull();
  });

  it("rejects a cookie signed with a different secret", () => {
    const cookie = encodeSessionCookie(DID, "b".repeat(64));
    expect(decodeSessionCookie(cookie, SECRET)).toBeNull();
  });

  it("rejects missing and malformed values", () => {
    expect(decodeSessionCookie(undefined, SECRET)).toBeNull();
    expect(decodeSessionCookie("", SECRET)).toBeNull();
    expect(decodeSessionCookie(".abc", SECRET)).toBeNull();
    expect(decodeSessionCookie("notadid.abc", SECRET)).toBeNull();
  });
});
