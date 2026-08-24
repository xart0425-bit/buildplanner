/**
 * Per-browser guest sessions.
 *
 * `sdk.authenticateRequest` resolves every caller to one shared "local-user" account,
 * which is what you want for a tool running on your own machine. On a hosted instance it
 * means every visitor shares one history. This module gives each browser its own
 * anonymous account instead, keyed by a random id in a cookie.
 *
 * It is not authentication — there is no login and no identity to prove. It only keeps
 * strangers' research separated. Real auth still has to replace the OAuth bypass before
 * anything private is stored here.
 */
import { randomUUID } from "crypto";
import { parse as parseCookie } from "cookie";
import type { Request, Response } from "express";
import type { User } from "../drizzle/schema";
import { getUserByOpenId, upsertUser } from "./db";

const GUEST_COOKIE = "bp_guest_id";
const GUEST_COOKIE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 180; // 180일
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Shared account locally (one person, one machine), separate accounts once deployed.
 * `GUEST_SESSIONS` overrides the default in either direction.
 */
export function isPerBrowserGuestMode(): boolean {
  if (process.env.GUEST_SESSIONS === "per-browser") return true;
  if (process.env.GUEST_SESSIONS === "shared") return false;
  return process.env.NODE_ENV === "production";
}

function isSecureRequest(req: Request): boolean {
  if (req.protocol === "https") return true;
  const forwarded = req.headers["x-forwarded-proto"];
  if (!forwarded) return false;
  const protocols = Array.isArray(forwarded) ? forwarded : forwarded.split(",");
  return protocols.some((p) => p.trim().toLowerCase() === "https");
}

/**
 * Returns the guest account for this browser, creating one (and its cookie) on first
 * visit. Returns null if the account could not be stored, so the caller can fall back.
 */
export async function resolveGuestUser(req: Request, res: Response): Promise<User | null> {
  const cookies = parseCookie(req.headers.cookie ?? "");
  const existing = cookies[GUEST_COOKIE];
  const guestId = existing && UUID_PATTERN.test(existing) ? existing : randomUUID();

  if (guestId !== existing) {
    // `sameSite: "lax"` rather than "none": this is a first-party cookie, and "none"
    // without Secure is rejected outright on plain http (local runs).
    res.cookie(GUEST_COOKIE, guestId, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: isSecureRequest(req),
      maxAge: GUEST_COOKIE_MAX_AGE_MS,
    });
  }

  const openId = `guest-${guestId}`;
  let user = await getUserByOpenId(openId);
  if (!user) {
    try {
      await upsertUser({
        openId,
        name: "게스트",
        email: null,
        loginMethod: "guest",
        // Deliberately not "admin": a stranger's browser must not reach admin procedures.
        role: "user",
        lastSignedIn: new Date(),
      });
      user = await getUserByOpenId(openId);
    } catch (error) {
      console.error("[GuestSession] Failed to create guest user:", error);
      return null;
    }
  }

  return user ?? null;
}
