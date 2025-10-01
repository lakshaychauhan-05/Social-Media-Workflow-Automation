import fs from "fs";
import express from "express";
import dotenv from "dotenv";
import path from "path";

// ✅ Sanitize .env at runtime (removes BOM/leading spaces)
try {
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const raw = fs.readFileSync(envPath, "utf8");
    const withoutBom = raw.replace(/^\uFEFF/, "");
    const normalized = withoutBom
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s+/, ""))
      .join("\n");
    if (normalized !== raw) {
      fs.writeFileSync(envPath, normalized, { encoding: "utf8" });
    }
  }
} catch {}

// ✅ Load .env
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// ✅ Import controllers AFTER env is loaded
const { runWorkflow } = await import("./src/controllers/workflowController.js");
const { slackInteractions } = await import("./src/controllers/slackController.js");

const app = express();
const port = process.env.PORT || 3000;

// Middleware for Slack signature verification
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(
  express.urlencoded({
    extended: true,
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

// ✅ HTML Trigger UI
app.get("/", (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Social Media Workflow Automation</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 40px; }
          h1 { color: #333; }
          button {
            background: #4CAF50; color: white; border: none;
            padding: 12px 24px; font-size: 16px; cursor: pointer; border-radius: 8px;
          }
          button:hover { background: #45a049; }
          .logs { margin-top: 20px; text-align: left; max-width: 600px; margin-left: auto; margin-right: auto; }
        </style>
        <script>
          async function triggerWorkflow() {
            const res = await fetch('/run-workflow', { method: 'POST' });
            const data = await res.json();
            document.getElementById('logs').innerHTML = 
              '<h3>Logs:</h3><pre>' + JSON.stringify(data.logs, null, 2) + '</pre>';
          }
        </script>
      </head>
      <body>
        <h1>🚀 Social Media Workflow Automation</h1>
        <p>Click below to start a workflow.</p>
        <button onclick="triggerWorkflow()">Start Workflow</button>
        <div id="logs" class="logs"></div>
      </body>
    </html>
  `);
});

// ✅ API Routes
app.post("/run-workflow", runWorkflow);
app.post("/slack/interactions", slackInteractions);

// Start server
app.listen(port, () =>
  console.log(`⚡ Server running at http://localhost:${port}`)
);
