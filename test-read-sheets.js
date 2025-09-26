// test-read-sheets.js
import { google } from "googleapis";
import dotenv from "dotenv";
dotenv.config();

async function testRead() {
  const auth = new google.auth.GoogleAuth({
    keyFile: "credentials.json",
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = process.env.SPREADSHEET_ID;
  const range = process.env.RANGE || "Campaigns!A2:D";

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  console.log("Rows returned:", (res.data.values || []).length);
  console.log(res.data.values || []);
}

testRead().catch(err => {
  console.error("ERROR reading sheet:", err.message);
  process.exit(1);
});
