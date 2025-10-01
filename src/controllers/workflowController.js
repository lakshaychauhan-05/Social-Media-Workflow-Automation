import {
  addLog,
  generatePostAndImage,
  postToLinkedIn,
  postToFacebook,
  postToInstagram,
  postToTwitter,
  logToSheets,
  transporter,
} from "../services/workflowService.js";
import { slackClient, pendingApprovals } from "../services/slackService.js";
import { v4 as uuidv4 } from "uuid";

export async function runWorkflow(req, res) {
  const logs = [];
  try {
    addLog(logs, "⚡ Workflow triggered...");
    const campaign = { title: "Launch Campaign", content: "This is a sample campaign." };

    let approved = false;
    let retries = 0;
    let finalPost = "";
    let finalImage = "";

    while (!approved && retries < 3) {
      const { text, imageUrl } = await generatePostAndImage(campaign);
      finalPost = text;
      finalImage = imageUrl;
      addLog(logs, `🤖 Generated post attempt ${retries + 1}`, "info");

      const workflowId = uuidv4();
      await slackClient.chat.postMessage({
        channel: process.env.SLACK_CHANNEL_ID,
        text: `Approval request attempt ${retries + 1}`,
        blocks: [
          { type: "section", text: { type: "mrkdwn", text: finalPost } },
          finalImage ? { type: "image", image_url: finalImage, alt_text: "Generated image" } : null,
          {
            type: "actions",
            elements: [
              { type: "button", text: { type: "plain_text", text: "✅ Approve" }, style: "primary", value: workflowId, action_id: "approve" },
              { type: "button", text: { type: "plain_text", text: "❌ Reject" }, style: "danger", value: workflowId, action_id: "reject" },
            ],
          },
        ].filter(Boolean),
      });

      const approval = await new Promise((resolve) => pendingApprovals.set(workflowId, { resolve }));

      if (approval.action === "approve") {
        addLog(logs, "✅ Approved", "success");
        approved = true;
      } else {
        retries++;
        addLog(logs, `❌ Rejected attempt ${retries}`, "warning");
      }
    }

    if (!approved) {
      addLog(logs, "❌ Rejected after 3 attempts", "error");
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_USER,
        subject: "❌ Post Rejected",
        text: `Campaign "${campaign.title}" rejected after 3 retries.`,
      });
      return res.json({ logs });
    }

    const results = await Promise.allSettled([
      postToLinkedIn(finalPost, finalImage),
      postToFacebook(finalPost),
      postToInstagram(finalPost),
      postToTwitter(finalPost),
    ]);
    const status = results.map((r, i) => ({
      platform: ["LinkedIn", "Facebook", "Instagram", "Twitter"][i],
      success: r.status === "fulfilled",
    }));

    await logToSheets(campaign, retries, status);
    await slackClient.chat.postMessage({
      channel: process.env.SLACK_CHANNEL_ID,
      text: `✅ Workflow done: ${status.map((s) => `${s.platform}:${s.success ? "✅" : "❌"}`).join(", ")}`,
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
