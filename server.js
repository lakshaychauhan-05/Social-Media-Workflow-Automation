import express from "express";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import { WebClient } from "@slack/web-api";

dotenv.config();
const app = express();
const port = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);

// --- Helper functions ---
function addLog(logs, message, type = "info") {
  logs.push({ message, type });
}

// Gmail transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Placeholder social media functions
async function postToFacebook(content) {
  console.log("📘 Facebook placeholder:", content);
  return true;
}
async function postToInstagram(content) {
  console.log("📸 Instagram placeholder:", content);
  return true;
}
async function postToTwitter(content) {
  console.log("🐦 Twitter placeholder:", content);
  return true;
}

// Workflow trigger
app.post("/run-workflow", async (req, res) => {
  let logs = [];
  try {
    addLog(logs, "⚡ Workflow triggered...");

    // 1. Fetch campaigns (placeholder)
    const campaign = { title: "Launch Campaign", content: "This is a sample campaign." };
    addLog(logs, `📄 Campaign fetched: ${campaign.title}`);

    // 2. Generate post text (placeholder for OpenAI)
    const generatedPost = `Generated Post: ${campaign.content} ✨`;
    addLog(logs, "🤖 Post generated via OpenAI");

    // 3. Slack Approval (simulated)
    try {
      await slackClient.chat.postMessage({
        channel: process.env.SLACK_CHANNEL_ID,
        text: "Please approve this post:",
        attachments: [
          {
            text: generatedPost,
            fallback: "Approve or Reject?",
            callback_id: "post_approval",
            actions: [
              { name: "approve", text: "✅ Approve", type: "button", value: "approve" },
              { name: "reject", text: "❌ Reject", type: "button", value: "reject" }
            ]
          }
        ]
      });
      addLog(logs, "✅ Slack approval sent", "success");
    } catch (err) {
      addLog(logs, `❌ Slack notification failed: ${err.message}`, "error");
    }

    // 4. Sequential Posting (placeholders)
    await postToFacebook(generatedPost);
    addLog(logs, "📘 Posted to Facebook (placeholder)", "success");

    await postToInstagram(generatedPost);
    addLog(logs, "📸 Posted to Instagram (placeholder)", "success");

    await postToTwitter(generatedPost);
    addLog(logs, "🐦 Posted to Twitter (placeholder)", "success");

    // 5. Log to Google Sheets (placeholder)
    addLog(logs, "📝 Logged to Google Sheets (placeholder)", "success");

    // 6. Final Slack notification
    try {
      await slackClient.chat.postMessage({
        channel: process.env.SLACK_CHANNEL_ID,
        text: "✅ Workflow completed successfully!"
      });
      addLog(logs, "✅ Final Slack notification sent", "success");
    } catch (err) {
      addLog(logs, `❌ Final Slack notification failed: ${err.message}`, "error");
    }

    res.json({ logs });
  } catch (err) {
    addLog(logs, `❌ Workflow failed: ${err.message}`, "error");

    // Send Gmail notification
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: "❌ Workflow Failed",
      text: err.message,
    });

    res.json({ logs });
  }
});

app.listen(port, () => {
  console.log(`⚡ Server running at http://localhost:${port}`);
});
