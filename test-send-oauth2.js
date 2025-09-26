// test-send-oauth2.js
import nodemailer from "nodemailer";
import { google } from "googleapis";
import dotenv from "dotenv";
dotenv.config();

const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, EMAIL_USER } = process.env;

async function sendOAuth2() {
  const oauth2Client = new google.auth.OAuth2(
    GMAIL_CLIENT_ID,
    GMAIL_CLIENT_SECRET,
    "https://developers.google.com/oauthplayground" // redirect URI used by playground
  );

  oauth2Client.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });

  const accessTokenResponse = await oauth2Client.getAccessToken();
  const accessToken = accessTokenResponse?.token;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: EMAIL_USER,
      clientId: GMAIL_CLIENT_ID,
      clientSecret: GMAIL_CLIENT_SECRET,
      refreshToken: GMAIL_REFRESH_TOKEN,
      accessToken
    }
  });

  const info = await transporter.sendMail({
    from: EMAIL_USER,
    to: EMAIL_USER,
    subject: "Test OAuth2 email",
    text: "This is a test using OAuth2 refresh token."
  });

  console.log("Sent:", info.messageId);
}

sendOAuth2().catch(err => {
  console.error("OAuth2 email error:", err);
  process.exit(1);
});
