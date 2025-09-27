const path = require('path');
const generateMonthlyReportCSV = require('./generateMonthlyReport');
const sendMonthlyReportEmail = require('./sendReportByEmail');

// Ajoute la date au format YYYY-MM-DD
const now = new Date();
const dateString = now.toISOString().slice(0, 10); // "YYYY-MM-DD"
const outputPath = path.join(__dirname, `rapport-mensuel-${dateString}.csv`);

const destinataires = 'teo.mamina@gmail.com';

async function main() {
  await generateMonthlyReportCSV(outputPath);
  await sendMonthlyReportEmail(outputPath, destinataires);
  console.log('Rapport CSV généré et envoyé !');
}

main().catch(console.error);