const path = require('path');
const generateMonthlyReportCSV = require('../utils/generateMonthlyReport');
const sendMonthlyReportEmail = require('../utils/sendReportByEmail');

exports.sendMonthlyReport = async (req, res) => {
  try {
    const now = new Date();
    const dateString = now.toISOString().slice(0, 10);
    const outputPath = path.join(__dirname, `../utils/rapport-mensuel-${dateString}.csv`);
    const destinataires = req.body.to || process.env.REPORT_RECIPIENTS || 'ton.email@gmail.com';

    await generateMonthlyReportCSV(outputPath);
    await sendMonthlyReportEmail(outputPath, destinataires);

    res.status(200).json({ message: 'Rapport généré et envoyé avec succès.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};