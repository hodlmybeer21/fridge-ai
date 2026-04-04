const fs = require('fs');
['/etc/environment', '/root/.config/openclaw/secrets.env'].forEach(f => {
  if (fs.existsSync(f)) fs.readFileSync(f, 'utf8').split('\n').forEach(l => {
    const idx = l.indexOf('='); if (idx > 0) process.env[l.slice(0, idx).trim()] = l.slice(idx + 1).trim();
  });
});
const { google } = require('googleapis');

const oauth2 = new google.auth.OAuth2(
  process.env.GOOGLE_DRIVE_CLIENT_ID,
  process.env.GOOGLE_DRIVE_CLIENT_SECRET
);
oauth2.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN });

const sheets = google.sheets({ version: 'v4', auth: oauth2 });
const drive  = google.drive({ version: 'v3', auth: oauth2 });

const SHEET_NAME = 'FridgeAI Pantry';
const FOLDER_ID  = process.env.GOOGLE_DRIVE_FOLDER_ID; // GoodBot folder

async function ensureSheet() {
  // Check if sheet already exists in Drive
  const res = await drive.files.list({
    q: `name='${SHEET_NAME}' and '${FOLDER_ID}' in parents and trashed=false`,
    fields: 'files(id,name)',
  });
  if (res.data.files.length > 0) {
    const id = res.data.files[0].id;
    console.log('Found existing sheet:', id);
    return id;
  }

  // Create new spreadsheet
  const created = await sheets.spreadsheets.create({
    resource: {
      properties: { title: SHEET_NAME },
      sheets: [{ properties: { title: 'Pantry', sheetId: 0 } }],
    },
    fields: 'spreadsheetId,spreadsheetUrl',
  });
  const id = created.data.spreadsheetId;
  console.log('Created new sheet:', id, created.data.spreadsheetUrl);

  // Move it to GoodBot folder
  await drive.files.update({ fileId: id, addParents: [FOLDER_ID] });

  // Set header row
  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range: 'Pantry!A1:D1',
    valueInputOption: 'RAW',
    resource: { values: [['Name', 'Added', 'Expiry', 'Quantity']] },
  });

  // Make it publicly readable
  await drive.permissions.create({ fileId: id, requestBody: { type: 'anyone', role: 'reader' } });
  await drive.permissions.create({ fileId: id, requestBody: { type: 'anyone', role: 'writer' } });

  console.log('Sheet ready:', id);
  return id;
}

async function readPantry(sheetId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: 'Pantry!A2:D',
  });
  const rows = res.data.values || [];
  return rows.map(r => ({ name: r[0] || '', addedAt: r[1] || '', expiry: r[2] || '', quantity: r[3] || '1' }));
}

async function writePantry(sheetId, items) {
  const values = items.map(i => [i.name, i.addedAt || '', i.expiry || '', i.quantity || '1']);
  await sheets.spreadsheets.values.clear({ spreadsheetId: sheetId, range: 'Pantry!A2:D' });
  if (values.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: 'Pantry!A2:D',
      valueInputOption: 'RAW',
      resource: { values },
    });
  }
}

async function main() {
  const sheetId = await ensureSheet();
  const items = await readPantry(sheetId);
  console.log('Current pantry:', JSON.stringify(items, null, 2));
}

main().catch(console.error);
