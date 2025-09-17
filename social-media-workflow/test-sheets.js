// test-sheets.js
import { google } from "googleapis";

const sheets = google.sheets("v4");

const auth = new google.auth.GoogleAuth({
  keyFile: "credentials.json", // Google service account key
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

export async function readSheetData(spreadsheetId, range) {
  const client = await auth.getClient();
  const res = await sheets.spreadsheets.values.get({
    auth: client,
    spreadsheetId,
    range,
  });
  return res.data.values;
}

export async function updateSheetStatus(spreadsheetId, row, status) {
  const client = await auth.getClient();
  const range = `Campaigns!D${row + 1}`; // assuming D column for status
  await sheets.spreadsheets.values.update({
    auth: client,
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[status]] },
  });
}
