// src/controllers/workflowController.js
import {
  addLog,
  generateImage,
  postToLinkedIn,
  postToFacebook,
  postToInstagram,
  postToTwitter,
  logToSheets,
  transporter,
} from "../services/workflowService.js";
import { slackClient, pendingApprovals } from "../services/slackService.js";
import { google } from "googleapis";
import { v4 as uuidv4 } from "uuid";

const sheets = google.sheets("v4");
const auth = new google.auth.GoogleAuth({
  keyFile: "credentials.json",
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});

export async function runWorkflow(req, res) {
  const logs = [];
  try {
    addLog(logs, "⚡ Workflow triggered...");

    // === 1️⃣ Fetch from Google Sheet ===
    const client = await auth.getClient();
    const sheetRes = await sheets.spreadsheets.values.get({
      auth: client,
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: process.env.RANGE,
    });

    const rows = sheetRes.data.values;
    if (!rows || rows.length === 0) throw new Error("No campaigns found.");

    const row = rows[0];

    // Map columns to campaign object
    const campaign = {
      title: row[0],
      linkedinTitle: row[1],
      linkedinDesc: row[2],
      linkedinImagePrompt: row[3],
      instagramTitle: row[4],
      instagramDesc: row[5],
      instagramImagePrompt: row[6],
      facebookTitle: row[7],
      facebookDesc: row[8],
      facebookImagePrompt: row[9],
      twitterTitle: row[10],
      twitterDesc: row[11],
      twitterImagePrompt: row[12],
      date: row[13],
    };

    addLog(logs, `📄 Loaded campaign: ${campaign.title}`);

    // === 2️⃣ Generate images per platform ===
    const images = {
      LinkedIn: await generateImage(campaign.linkedinImagePrompt),
      Instagram: await generateImage(campaign.instagramImagePrompt),
      Facebook: await generateImage(campaign.facebookImagePrompt),
      Twitter: await generateImage(campaign.twitterImagePrompt),
    };

    // === 3️⃣ Build platform posts ===
    const posts = [
      { platform: "LinkedIn", title: campaign.linkedinTitle, text: campaign.linkedinDesc, imageUrl: images.LinkedIn },
      { platform: "Instagram", title: campaign.instagramTitle, text: campaign.instagramDesc, imageUrl: images.Instagram },
      { platform: "Facebook", title: campaign.facebookTitle, text: campaign.facebookDesc, imageUrl: images.Facebook },
      { platform: "Twitter", title: campaign.twitterTitle, text: campaign.twitterDesc, imageUrl: images.Twitter },
    ];

    // === 4️⃣ Slack approval request ===
    const workflowId = uuidv4();
    const blocks = [
      { type: "section", text: { type: "mrkdwn", text: `*Approval Request for:* ${campaign.title}` } },
      ...posts.flatMap((p) => [
        { type: "section", text: { type: "mrkdwn", text: `*${p.platform} - ${p.title}*\n${p.text}` } },
        p.imageUrl ? { type: "image", image_url: p.imageUrl, alt_text: `${p.platform} image` } : [],
      ]),
      {
        type: "actions",
        elements: [
          { type: "button", text: { type: "plain_text", text: "✅ Approve" }, style: "primary", value: workflowId, action_id: "approve" },
          { type: "button", text: { type: "plain_text", text: "❌ Reject" }, style: "danger", value: workflowId, action_id: "reject" },
        ],
      },
    ].flat();

    await slackClient.chat.postMessage({
      channel: process.env.SLACK_CHANNEL_ID,
      text: `Approval request for ${campaign.title}`,
      blocks,
    });

    const approval = await new Promise((resolve) => pendingApprovals.set(workflowId, { resolve }));

    if (approval.action !== "approve") {
      addLog(logs, "❌ Rejected by reviewer", "error");
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_USER,
        subject: `❌ Rejected: ${campaign.title}`,
        text: `Campaign "${campaign.title}" was rejected.`,
      });
      return res.json({ logs });
    }

    addLog(logs, "✅ Approved by reviewer", "success");

    // === 5️⃣ Post to all platforms ===
    const results = await Promise.allSettled([
      postToLinkedIn(campaign.linkedinDesc, images.LinkedIn),
      postToInstagram(campaign.instagramDesc),
      postToFacebook(campaign.facebookDesc),
      postToTwitter(campaign.twitterDesc),
    ]);

    const status = results.map((r, i) => ({
      platform: ["LinkedIn", "Instagram", "Facebook", "Twitter"][i],
      success: r.status === "fulfilled",
    }));

    await logToSheets(campaign, status);

    await slackClient.chat.postMessage({
      channel: process.env.SLACK_CHANNEL_ID,
      text: `✅ Posted successfully for ${campaign.title}: ${status.map((s) => `${s.platform}:${s.success ? "✅" : "❌"}`).join(", ")}`,
    });

    res.json({ logs });
  } catch (err) {
    addLog(logs, `❌ Workflow failed: ${err.message}`, "error");
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: "❌ Workflow Failed",
      text: err.message,
    });
    res.json({ logs });
  }
}
