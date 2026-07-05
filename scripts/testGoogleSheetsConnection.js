const { readContactRows } = require('../src/config/googleSheets');

async function main() {
  const rows = await readContactRows();

  console.log('Google Sheets connection works.');
  console.log(`Rows found in Contacts sheet: ${rows.length}`);

  if (rows.length > 0) {
    console.log('First row:');
    console.log(rows[0]);
  }
}

main().catch((error) => {
  console.error('Google Sheets connection failed.');
  console.error(error.message);
  process.exit(1);
});
