import dotenv from "dotenv";
dotenv.config();

import { readSheetData, updateSheetStatus } from "./test-sheets.js";
import cron from "node-cron";
import nodemailer from "nodemailer";
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Gmail setup
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function generatePostText(title, topic) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "user", content: `Write a short, engaging social media post for the campaign titled "${title}" about "${topic}".` }
      ],
    });
    return response.choices[0].message.content;
  } catch (error) {
    console.error("OpenAI API error:", error);
    throw error;
  }
}

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
  let campaigns = await readSheetData(process.env.SPREADSHEET_ID, process.env.RANGE);

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

      await updateSheetStatus(process.env.SPREADSHEET_ID, i + 1, "Posted");
      finalStatus += `${title}: Posted\n`;
    } catch (err) {
      await sendFailureEmail(title, err);
      finalStatus += `${title}: Failed\n`;
    }
  }

  console.log("\n[Slack Notification - Disabled]");
  console.log(finalStatus);
  console.log("\n✅ Console notification printed\nAll posts processed!");
}

cron.schedule("0 9 * * *", main); // Run every day at 9AM
main();
