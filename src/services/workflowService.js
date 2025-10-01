// src/services/workflowService.js
import fetch from "node-fetch";
import nodemailer from "nodemailer";
import { google } from "googleapis";
import { slackClient } from "./slackService.js";

// === DEBUG EMAIL ENV ===

// Gmail transporter (SMTP config)
export const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true, // true for port 465, false for 587
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Google Sheets setup
const sheets = google.sheets("v4");
const auth = new google.auth.GoogleAuth({
  keyFile: "credentials.json",
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

export function addLog(logs, message, type = "info") {
  logs.push({ message, type, time: new Date().toISOString() });
}

// === OpenAI text + image ===
export async function generatePostAndImage(campaign) {
  const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a helpful assistant that generates social media posts." },
        { role: "user", content: `Write a creative social media post about "${campaign.title}" related to "${campaign.content}".` },
      ],
    }),
  });
  const aiData = await aiResponse.json();
  const text = aiData.choices?.[0]?.message?.content?.trim() || "Auto-generated post";

  const imgResponse = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: `Promotional image for: ${campaign.title} - ${campaign.content}, modern social media style`,
      n: 1,
      size: "1024x1024",
    }),
  });
  const imgData = await imgResponse.json();
  const imageUrl = imgData?.data?.[0]?.url || null;

  return { text, imageUrl };
}

// === LinkedIn posting ===
export async function postToLinkedIn(text, imageUrl) {
  const authorUrn = process.env.LINKEDIN_PERSON_URN;

  const registerRes = await fetch("https://api.linkedin.com/v2/assets?action=registerUpload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      registerUploadRequest: {
        owner: authorUrn,
        recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
        serviceRelationships: [{ identifier: "urn:li:userGeneratedContent", relationshipType: "OWNER" }],
      },
    }),
  });

  const registerData = await registerRes.json();
  if (!registerRes.ok) throw new Error(JSON.stringify(registerData));
  const uploadUrl = registerData.value.uploadMechanism["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"].uploadUrl;
  const asset = registerData.value.asset;

  if (imageUrl) {
    const imgFetch = await fetch(imageUrl);
    if (!imgFetch.ok) throw new Error("Failed to fetch generated image");
    const imgBuffer = await imgFetch.arrayBuffer();
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { Authorization: `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}` },
      body: Buffer.from(imgBuffer),
    });
    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      throw new Error("LinkedIn image upload failed: " + err);
    }
  }

  const postBody = {
    author: authorUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text },
        shareMediaCategory: imageUrl ? "IMAGE" : "NONE",
        media: imageUrl ? [{ status: "READY", description: { text }, media: asset, title: { text: "Campaign Image" } }] : [],
      },
    },
    visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
  };

  const postRes = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(postBody),
  });

  if (!postRes.ok) {
    const err = await postRes.text();
    throw new Error("LinkedIn post failed: " + err);
  }
  return true;
}

// === Placeholder posting for FB/IG/Twitter ===
export async function postToFacebook(content) { console.log("📘 FB:", content); return true; }
export async function postToInstagram(content) { console.log("📸 IG:", content); return true; }
export async function postToTwitter(content) { console.log("🐦 Twitter:", content); return true; }

// === Log results in Google Sheets ===
export async function logToSheets(campaign, retries, results) {
  const client = await auth.getClient();
  const statusRow = [
    campaign.title,
    `Retries: ${retries}`,
    results.map((r) => r.platform + ":" + (r.success ? "✅" : "❌")).join(", "),
    new Date().toISOString(),
  ];
  await sheets.spreadsheets.values.append({
    auth: client,
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: process.env.RANGE,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [statusRow] },
  });
}
