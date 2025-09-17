import dotenv from "dotenv";
dotenv.config();

import { readSheetData, updateSheetStatus } from "./test-sheets.js";
import cron from "node-cron";
import nodemailer from "nodemailer";
// import axios from "axios";   // Slack ke liye tha, ab comment kar diya

// import OpenAI from "openai"; // abhi image/text OpenAI se use nahi kar rahe
// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SPREADSHEET_ID = "1ccgIt_mxC66VjpftUT94o8IL5if8Pmr5Rwtax7AM7yA";
const RANGE = "Campaigns!A2:D"; // header skipped
// const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL; // ab use nahi hoga

// Gmail setup
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function generatePostText(title, topic) {
  // Mock text generation
  return `This is a post about "${title}" on topic "${topic}"`;
}

// Slack ko hata diya
// async function sendSlackNotification(message) {
//   await axios.post(SLACK_WEBHOOK_URL, { text: message });
// }

async function sendFailureEmail(title, error) {
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_USER,
    subject: `Failed to post: ${title}`,
    text: `Error: ${error}`,
  });
}

async function postToPlatform(platform, title) {
  console.log(`Posting "${title}" to ${platform}...`);
  await new Promise((resolve) => setTimeout(resolve, 500)); // mock delay
  console.log(`✅ Posted to ${platform}`);
}

async function main() {
  console.log("Fetching campaigns from Google Sheets...");
  let campaigns = await readSheetData(SPREADSHEET_ID, RANGE);

  let finalStatus = "";

  for (let i = 0; i < campaigns.length; i++) {
    const [id, title, topic] = campaigns[i];
    console.log(`\nRequesting approval for post: "${title}"`);
    console.log("✅ Approved"); // Mock approval

    let postText;
    try {
      postText = await generatePostText(title, topic);

      // Sequential posting
      const platforms = ["WordPress", "Twitter", "LinkedIn", "Facebook", "Instagram"];
      for (let platform of platforms) {
        await postToPlatform(platform, title);
      }

      await updateSheetStatus(SPREADSHEET_ID, i + 1, "Posted");
      finalStatus += `${title}: Posted\n`;
    } catch (err) {
      await sendFailureEmail(title, err);
      finalStatus += `${title}: Failed\n`;
    }
  }

  // Slack ko sirf console log me replace kiya
  console.log("\n[Slack Notification - Disabled]");
  console.log(finalStatus);
  console.log("\n✅ Console notification printed\nAll posts processed!");
}

// Optional: run every day at 9AM
cron.schedule("0 9 * * *", main);

// Run immediately
main();
