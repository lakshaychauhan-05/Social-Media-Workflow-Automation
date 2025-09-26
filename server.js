// server.js
import express from "express";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import { WebClient } from "@slack/web-api";
import { google } from "googleapis";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// NOTE: capture raw body for Slack signature verification
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));
app.use(express.urlencoded({
  extended: true,
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

app.use(express.static(__dirname));

const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);

// Gmail transporter (uses username/password app password or SMTP)
// If you use Gmail API OAuth2 you can replace this later.
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

// Google Sheets (service account)
const sheets = google.sheets("v4");
const auth = new google.auth.GoogleAuth({
  keyFile: "credentials.json", // service account JSON file
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

// Helper for logs
function addLog(logs, message, type = "info") {
  logs.push({ message, type, time: new Date().toISOString() });
}

// --- OpenAI text + image generation (unchanged) ---
async function generatePostAndImage(campaign) {
  // generate text
  const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a helpful assistant that generates social media posts." },
        { role: "user", content: `Write a creative social media post about "${campaign.title}" related to "${campaign.content}".` }
      ],
    }),
  });
  const aiData = await aiResponse.json();
  const text = aiData.choices?.[0]?.message?.content?.trim() || "Auto-generated post";

  // generate image via OpenAI Images API
  const imgResponse = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      prompt: `Promotional image for: ${campaign.title} - ${campaign.content}, modern social media style`,
      n: 1,
      size: "1024x1024"
    })
  });
  const imgData = await imgResponse.json();
  const imageUrl = imgData?.data?.[0]?.url || null;

  return { text, imageUrl };
}

// --- LinkedIn post with text + image (unchanged) ---
async function postToLinkedIn(text, imageUrl) {
  const authorUrn = process.env.LINKEDIN_PERSON_URN;
  // 1. Register upload
  const registerRes = await fetch("https://api.linkedin.com/v2/assets?action=registerUpload", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0"
    },
    body: JSON.stringify({
      registerUploadRequest: {
        owner: authorUrn,
        recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
        serviceRelationships: [
          { identifier: "urn:li:userGeneratedContent", relationshipType: "OWNER" }
        ]
      }
    })
  });

  const registerData = await registerRes.json();
  if (!registerRes.ok) throw new Error(JSON.stringify(registerData));
  const uploadUrl = registerData.value.uploadMechanism["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"].uploadUrl;
  const asset = registerData.value.asset;

  // 2. Upload image bytes to LinkedIn uploadUrl
  if (imageUrl) {
    const imgFetch = await fetch(imageUrl);
    if (!imgFetch.ok) throw new Error("Failed to fetch generated image URL");
    const imgBuffer = await imgFetch.arrayBuffer();
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Authorization": `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}` },
      body: Buffer.from(imgBuffer)
    });
    if (!uploadRes.ok) throw new Error("Image upload failed");
  }

  // 3. Create UGC post referencing the uploaded asset
  const postBody = {
    author: authorUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text },
        shareMediaCategory: imageUrl ? "IMAGE" : "NONE",
        media: imageUrl ? [{ status: "READY", description: { text }, media: asset, title: { text: "Campaign Image" } }] : []
      }
    },
    visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" }
  };

  const postRes = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0"
    },
    body: JSON.stringify(postBody)
  });

  if (!postRes.ok) {
    const err = await postRes.text();
    throw new Error(err);
  }

  return true;
}

// Placeholder other platforms (extend later)
async function postToFacebook(content) { console.log("📘 FB:", content); return true; }
async function postToInstagram(content) { console.log("📸 IG:", content); return true; }
async function postToTwitter(content) { console.log("🐦 Twitter:", content); return true; }

// --- Slack interaction orchestration ---
const pendingApprovals = new Map(); // workflowId -> { resolve, meta... }

function verifySlackSignature(req) {
  try {
    const signingSecret = process.env.SLACK_SIGNING_SECRET;
    const timestamp = req.headers['x-slack-request-timestamp'];
    const sigHeader = req.headers['x-slack-signature'];

    if (!signingSecret || !timestamp || !sigHeader) return false;

    const time = Math.floor(Date.now() / 1000);
    if (Math.abs(time - Number(timestamp)) > 60 * 5) return false; // older than 5 minutes

    const sigBasestring = `v0:${timestamp}:${req.rawBody.toString()}`;
    const hmac = crypto.createHmac('sha256', signingSecret);
    hmac.update(sigBasestring);
    const mySig = `v0=${hmac.digest('hex')}`;

    // timing-safe compare
    const buf1 = Buffer.from(mySig, 'utf8');
    const buf2 = Buffer.from(sigHeader, 'utf8');
    if (buf1.length !== buf2.length) return false;
    return crypto.timingSafeEqual(buf1, buf2);
  } catch (err) {
    return false;
  }
}

async function sendApprovalMessage(workflowId, postText, imageUrl, attempt) {
  // Build message blocks
  const blocks = [
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Approval request — attempt ${attempt + 1}*\n${postText}` }
    }
  ];

  if (imageUrl) {
    blocks.push({
      type: "image",
      image_url: imageUrl,
      alt_text: "Generated image"
    });
  }

  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "✅ Approve" },
        style: "primary",
        value: workflowId,
        action_id: "approve"
      },
      {
        type: "button",
        text: { type: "plain_text", text: "❌ Reject" },
        style: "danger",
        value: workflowId,
        action_id: "reject"
      }
    ]
  });

  const result = await slackClient.chat.postMessage({
    channel: process.env.SLACK_CHANNEL_ID,
    text: `Approval request (attempt ${attempt + 1})`,
    blocks
  });

  return { ts: result.ts, channel: result.channel };
}

function waitForApproval(workflowId, timeoutMs = 1000 * 60 * 60) { // default 1 hour
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (pendingApprovals.has(workflowId)) {
        pendingApprovals.delete(workflowId);
        resolve({ action: "timeout" });
      }
    }, timeoutMs);

    // store resolve so interactions endpoint can call it
    pendingApprovals.set(workflowId, {
      resolve: (payload) => {
        clearTimeout(timeout);
        if (pendingApprovals.has(workflowId)) pendingApprovals.delete(workflowId);
        resolve(payload);
      }
    });
  });
}

// Slack interactions endpoint - handle button clicks
app.post("/slack/interactions", async (req, res) => {
  // verify signature
  if (!verifySlackSignature(req)) {
    return res.status(400).send("Invalid signature");
  }

  // Slack sends payload as form-encoded 'payload' field
  const payload = JSON.parse(req.body.payload);

  // ack immediately
  res.status(200).send(); // 200 fast

  try {
    const action = payload.actions?.[0];
    if (!action) {
      // nothing actionable
      return;
    }

    const workflowId = action.value;
    const actionId = action.action_id; // 'approve' or 'reject'
    const userId = payload.user?.id;
    const channelId = payload.channel?.id;
    const messageTs = payload.message?.ts;

    // if there's no pending workflow, let the user know
    const entry = pendingApprovals.get(workflowId);
    if (!entry) {
      // send ephemeral message to user so they know it's expired/handled
      await slackClient.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: "This approval is expired or already handled."
      });
      return;
    }

    // Update the original message to show who approved/rejected
    const resultText = actionId === "approve"
      ? `✅ Approved by <@${userId}>`
      : `❌ Rejected by <@${userId}> (attempt recorded)`;

    try {
      await slackClient.chat.update({
        channel: channelId,
        ts: messageTs,
        text: resultText,
        blocks: [
          { type: "section", text: { type: "mrkdwn", text: resultText } }
        ]
      });
    } catch (err) {
      // non-fatal: still resolve the workflow
      console.warn("Could not update message:", err.message);
    }

    // Resolve the waiting workflow promise
    entry.resolve({ action: actionId, user: userId });
  } catch (err) {
    console.error("Error handling Slack interaction:", err);
  }
});

// --- Log results to Google Sheets ---
async function logToSheets(campaign, retries, results) {
  const client = await auth.getClient();
  const statusRow = [
    campaign.title,
    `Retries: ${retries}`,
    results.map(r => r.platform + ":" + (r.success ? "✅" : "❌")).join(", "),
    new Date().toISOString()
  ];
  await sheets.spreadsheets.values.append({
    auth: client,
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: process.env.RANGE,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [statusRow] }
  });
}

// --- Workflow endpoint (now waits for real Slack interactions) ---
app.post("/run-workflow", async (req, res) => {
  const logs = [];
  try {
    addLog(logs, "⚡ Workflow triggered...");

    // 1) Fetch campaign — replace with your real fetch from Sheets
    const campaign = { title: "Launch Campaign", content: "This is a sample campaign." };
    addLog(logs, `📄 Campaign fetched: ${campaign.title}`, "success");

    // 2) Approval loop (max 3 attempts)
    let approved = false;
    let retries = 0;
    let finalPost = "";
    let finalImage = "";
    while (!approved && retries < 3) {
      // generate text + image
      const { text, imageUrl } = await generatePostAndImage(campaign);
      finalPost = text;
      finalImage = imageUrl;
      addLog(logs, `🤖 Generated post (Attempt ${retries + 1})`, "info");
      addLog(logs, `🖼️ Generated image: ${finalImage}`, "info");

      // send Slack approval message and wait for user action
      const workflowId = uuidv4();
      const sent = await sendApprovalMessage(workflowId, finalPost, finalImage, retries);
      addLog(logs, `🔔 Slack approval sent (workflowId=${workflowId})`, "info");

      const actionResult = await waitForApproval(workflowId, 1000 * 60 * 60); // 1 hour timeout
      if (actionResult.action === "approve") {
        addLog(logs, "✅ Approved in Slack", "success");
        approved = true;
        break;
      } else if (actionResult.action === "reject") {
        addLog(logs, `↩️ Rejected in Slack (attempt ${retries + 1})`, "warning");
        retries++;
        // loop will regenerate new post+image and re-request approval
        continue;
      } else if (actionResult.action === "timeout") {
        addLog(logs, "⌛ Approval timed out", "error");
        // notify via email
        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: process.env.EMAIL_USER,
          subject: "❌ Approval timed out",
          text: `Campaign "${campaign.title}" timed out waiting for approval.`
        });
        return res.json({ logs });
      } else {
        // unknown - treat as fail
        addLog(logs, `❌ Unknown action result: ${JSON.stringify(actionResult)}`, "error");
        return res.json({ logs });
      }
    }

    if (!approved) {
      addLog(logs, "❌ Rejected after 3 attempts", "error");
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_USER,
        subject: "❌ Post Rejected after 3 retries",
        text: `Campaign "${campaign.title}" was rejected after 3 attempts.`
      });
      return res.json({ logs });
    }

    // 3) Parallel posting (LinkedIn + other platforms)
    const results = await Promise.allSettled([
      postToLinkedIn(finalPost, finalImage),
      postToFacebook(finalPost),
      postToInstagram(finalPost),
      postToTwitter(finalPost),
    ]);

    const status = results.map((r, i) => ({
      platform: ["LinkedIn", "Facebook", "Instagram", "Twitter"][i],
      success: r.status === "fulfilled"
    }));

    for (const s of status) {
      addLog(logs, `${s.success ? "✅" : "❌"} ${s.platform}`, s.success ? "success" : "error");
    }

    // 4) Log to Google Sheets
    await logToSheets(campaign, retries, status);

    // 5) Final Slack summary
    await slackClient.chat.postMessage({
      channel: process.env.SLACK_CHANNEL_ID,
      text: `✅ Workflow completed for "${campaign.title}". Results: ${status.map(s => `${s.platform}:${s.success ? "✅" : "❌"}`).join(", ")}`
    });

    addLog(logs, "✅ Final Slack summary sent", "success");
    res.json({ logs });

  } catch (err) {
    addLog(logs, `❌ Workflow failed: ${err.message}`, "error");
    // notify by email
    await transporter.sendMail({
      from: process.env.EMAIL_USER, to: process.env.EMAIL_USER,
      subject: "❌ Workflow Failed", text: err.message
    });
    res.json({ logs });
  }
});

app.listen(port, () => console.log(`⚡ Server running at http://localhost:${port}`));
