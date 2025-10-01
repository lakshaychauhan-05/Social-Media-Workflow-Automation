import { WebClient } from "@slack/web-api";
import crypto from "crypto";

export const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);
export const pendingApprovals = new Map();

export function verifySlackSignature(req) {
  try {
    const signingSecret = process.env.SLACK_SIGNING_SECRET;
    const timestamp = req.headers["x-slack-request-timestamp"];
    const sigHeader = req.headers["x-slack-signature"];
    if (!signingSecret || !timestamp || !sigHeader) return false;

    const time = Math.floor(Date.now() / 1000);
    if (Math.abs(time - Number(timestamp)) > 60 * 5) return false;

    const sigBasestring = `v0:${timestamp}:${req.rawBody.toString()}`;
    const hmac = crypto.createHmac("sha256", signingSecret);
    hmac.update(sigBasestring);
    const mySig = `v0=${hmac.digest("hex")}`;

    return crypto.timingSafeEqual(Buffer.from(mySig, "utf8"), Buffer.from(sigHeader, "utf8"));
  } catch {
    return false;
  }
}
