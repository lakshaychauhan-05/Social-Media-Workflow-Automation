import { slackClient, verifySlackSignature, pendingApprovals } from "../services/slackService.js";

export async function slackInteractions(req, res) {
  if (!verifySlackSignature(req)) return res.status(400).send("Invalid signature");

  const payload = JSON.parse(req.body.payload);
  res.status(200).send();

  try {
    const action = payload.actions?.[0];
    if (!action) return;

    const workflowId = action.value;
    const actionId = action.action_id;
    const userId = payload.user?.id;
    const channelId = payload.channel?.id;
    const messageTs = payload.message?.ts;

    const entry = pendingApprovals.get(workflowId);
    if (!entry) {
      await slackClient.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: "This approval is expired or already handled.",
      });
      return;
    }

    const resultText =
      actionId === "approve" ? `✅ Approved by <@${userId}>` : `❌ Rejected by <@${userId}>`;

    await slackClient.chat.update({
      channel: channelId,
      ts: messageTs,
      text: resultText,
      blocks: [{ type: "section", text: { type: "mrkdwn", text: resultText } }],
    });

    entry.resolve({ action: actionId, user: userId });
    pendingApprovals.delete(workflowId);
  } catch (err) {
    console.error("Slack interaction error:", err);
  }
}
