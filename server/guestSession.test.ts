import { describe, expect, it, vi, beforeEach, afterAll } from "vitest";
import { isPerBrowserGuestMode, resolveGuestUser } from "./guestSession";

const users = new Map<string, any>();
let autoId = 1;

vi.mock("./db", () => ({
  getUserByOpenId: vi.fn(async (openId: string) => users.get(openId)),
  upsertUser: vi.fn(async (user: any) => {
    if (!users.has(user.openId)) users.set(user.openId, { ...user, id: autoId++ });
  }),
}));

const makeReq = (cookie?: string) =>
  ({ headers: cookie ? { cookie } : {}, protocol: "http" }) as any;

const makeRes = () => {
  const cookies: Array<{ name: string; value: string; options: any }> = [];
  return {
    cookie: (name: string, value: string, options: any) => cookies.push({ name, value, options }),
    cookies,
  } as any;
};

describe("isPerBrowserGuestMode", () => {
  const original = { nodeEnv: process.env.NODE_ENV, mode: process.env.GUEST_SESSIONS };

  afterAll(() => {
    process.env.NODE_ENV = original.nodeEnv;
    if (original.mode === undefined) delete process.env.GUEST_SESSIONS;
    else process.env.GUEST_SESSIONS = original.mode;
  });

  it("shares one account locally and splits them once deployed", () => {
    delete process.env.GUEST_SESSIONS;
    process.env.NODE_ENV = "development";
    expect(isPerBrowserGuestMode()).toBe(false);

    process.env.NODE_ENV = "production";
    expect(isPerBrowserGuestMode()).toBe(true);
  });

  it("honours an explicit override in both directions", () => {
    process.env.NODE_ENV = "development";
    process.env.GUEST_SESSIONS = "per-browser";
    expect(isPerBrowserGuestMode()).toBe(true);

    process.env.NODE_ENV = "production";
    process.env.GUEST_SESSIONS = "shared";
    expect(isPerBrowserGuestMode()).toBe(false);
  });
});

describe("resolveGuestUser", () => {
  beforeEach(() => {
    users.clear();
    autoId = 1;
  });

  it("issues a cookie and an account on the first visit", async () => {
    const res = makeRes();
    const user = await resolveGuestUser(makeReq(), res);

    expect(user).toBeTruthy();
    expect(user!.role).toBe("user"); // never admin
    expect(res.cookies).toHaveLength(1);
    expect(res.cookies[0].name).toBe("bp_guest_id");
    expect(res.cookies[0].options.httpOnly).toBe(true);
    expect(res.cookies[0].options.sameSite).toBe("lax");
  });

  it("reuses the account on the next request from the same browser", async () => {
    const first = makeRes();
    const created = await resolveGuestUser(makeReq(), first);
    const id = first.cookies[0].value;

    const second = makeRes();
    const returning = await resolveGuestUser(makeReq(`bp_guest_id=${id}`), second);

    expect(returning!.id).toBe(created!.id);
    expect(second.cookies).toHaveLength(0); // no need to re-issue
  });

  it("keeps two browsers on separate accounts", async () => {
    const a = makeRes();
    const b = makeRes();
    const userA = await resolveGuestUser(makeReq(), a);
    const userB = await resolveGuestUser(makeReq(), b);

    expect(a.cookies[0].value).not.toBe(b.cookies[0].value);
    expect(userA!.id).not.toBe(userB!.id);
  });

  it("replaces a forged or malformed cookie with a fresh id", async () => {
    const res = makeRes();
    await resolveGuestUser(makeReq("bp_guest_id=../../etc/passwd"), res);

    expect(res.cookies).toHaveLength(1);
    expect(res.cookies[0].value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it("marks the cookie Secure behind an https proxy", async () => {
    const res = makeRes();
    const req = { headers: { "x-forwarded-proto": "https" }, protocol: "http" } as any;
    await resolveGuestUser(req, res);

    expect(res.cookies[0].options.secure).toBe(true);
  });
});
