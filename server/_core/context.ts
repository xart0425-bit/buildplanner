import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { isPerBrowserGuestMode, resolveGuestUser } from "../guestSession";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    // Hosted instances give each browser its own anonymous account so visitors do not
    // share one history; a local run keeps the single shared account.
    if (isPerBrowserGuestMode()) {
      user = await resolveGuestUser(opts.req, opts.res);
    }
    if (!user) {
      user = await sdk.authenticateRequest(opts.req);
    }
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
