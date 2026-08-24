import { Request, Response } from "express";
import { sdk } from "../_core/sdk";
import { insertDesktopActivities } from "../db";

export async function uploadDesktopActivitiesHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { activities } = req.body;
    if (!Array.isArray(activities) || activities.length === 0) {
      return res.status(400).json({ error: "Invalid activities payload" });
    }

    const now = new Date();
    const mapped = activities.map((act: any) => ({
      userId: user.id,
      windowTitle: act.windowTitle || "Unknown Window",
      processName: act.processName || "unknown",
      duration: Number(act.duration) || 0,
      activityType: act.activityType || "unknown",
      createdAt: act.createdAt ? new Date(act.createdAt) : now,
    }));

    await insertDesktopActivities(mapped);
    console.log(`[Desktop Ingestion] Successfully ingested ${mapped.length} activities for user ID ${user.id}.`);
    
    return res.json({ success: true, count: mapped.length });
  } catch (error: any) {
    console.error("[Desktop Ingestion Error]:", error);
    return res.status(500).json({ error: error.message });
  }
}
