const nodemailer = require('nodemailer');
require('dotenv').config();
const path = require('path');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

async function sendMonthlyReportEmail(csvPath, toEmail) {
  const filename = path.basename(csvPath);

  const mailOptions = {
    from: process.env.GMAIL_USER,
    to: toEmail,
    subject: 'Rapport mensuel des signalements',
    text: 'Veuillez trouver ci-joint le rapport CSV du mois.',
    html: `
      <div style="font-family: Arial, sans-serif; color: #222;">
        <h2>Rapport mensuel des signalements</h2>
        <p>Bonjour,</p>
        <p>Veuillez trouver en pièce jointe le rapport CSV du mois.</p>
        <p style="margin-top:30px; font-size:12px; color:#888;">Cyclane &copy; ${new Date().getFullYear()}</p>
      </div>
    `,
    attachments: [
      {
        filename,
        path: csvPath
      }
    ]
  };

  await transporter.sendMail(mailOptions);
}

module.exports = sendMonthlyReportEmail;