// src/services/workflowService.js
import fetch from "node-fetch";
import nodemailer from "nodemailer";
import { google } from "googleapis";

// === Gmail SMTP ===
export const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// === Google Sheets setup ===
const sheets = google.sheets("v4");
const auth = new google.auth.GoogleAuth({
  keyFile: "credentials.json",
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

export function addLog(logs, message, type = "info") {
  logs.push({ message, type, time: new Date().toISOString() });
}

// === Image generation for each platform ===
export async function generateImage(prompt) {
  try {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: prompt || "AI technology theme",
        n: 1,
        size: "1024x1024",
      }),
    });

    const data = await response.json();
    return data?.data?.[0]?.url || null;
  } catch (err) {
    console.error("❌ Image generation failed:", err.message);
    return null;
  }
}

// === LinkedIn Posting ===
export async function postToLinkedIn(text, imageUrl) {
  const authorUrn = process.env.LINKEDIN_PERSON_URN;

  // Register upload
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

  // Upload image
  if (imageUrl) {
    const imgFetch = await fetch(imageUrl);
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

  // Post
  const postBody = {
    author: authorUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text },
        shareMediaCategory: imageUrl ? "IMAGE" : "NONE",
        media: imageUrl
          ? [{ status: "READY", description: { text }, media: asset, title: { text: "LinkedIn Campaign Image" } }]
          : [],
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

// === Dummy posts for other platforms ===
export async function postToFacebook(content) {
  console.log("📘 Facebook Post:", content);
  return true;
}
export async function postToInstagram(content) {
  console.log("📸 Instagram Post:", content);
  return true;
}
export async function postToTwitter(content) {
  console.log("🐦 Twitter Post:", content);
  return true;
}

// === Log to Google Sheets ===
export async function logToSheets(campaign, results) {
  const client = await auth.getClient();
  const statusRow = [
    campaign.title,
    results.map((r) => `${r.platform}:${r.success ? "✅" : "❌"}`).join(", "),
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
