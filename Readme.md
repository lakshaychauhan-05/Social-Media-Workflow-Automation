# 📢 Social Media Workflow Automation

This project automates the process of generating, approving, and posting campaign content across multiple social media platforms (LinkedIn, Facebook, Instagram, Twitter).  
It integrates with **OpenAI, Slack, LinkedIn API, Google Sheets, and Gmail API** to deliver a production-ready workflow.  

---

## 🚀 Features

- 🔁 **Slack Approval Loop** – Up to 3 retries with regenerated content (text + AI image) if rejected.  
- 🖼️ **AI Content Generation** – Captions via OpenAI GPT and promotional images via OpenAI DALL·E.  
- 🔗 **Social Posting** – Automatic posting to LinkedIn (text + image), plus Facebook, Instagram, and Twitter.  
- 🌐 **Parallel Posting** – All platforms posted simultaneously.  
- 📊 **Google Sheets Logging** – Logs campaign, retries, and per-platform status.  
- 📧 **Gmail Alerts (via Gmail API)** – Sends notifications on workflow failures or rejections.  
- 💬 **Slack Notifications** – Interactive approval buttons + final summary.  

---

## 🛠️ Tech Stack

- **Node.js + Express**  
- **Slack API** (`@slack/web-api`)  
- **LinkedIn Marketing API**  
- **OpenAI API** (ChatGPT + DALL·E)  
- **Google Sheets API**  
- **Gmail API (OAuth2)**  
- **Nodemailer** for sending mails with Gmail API tokens  

---
