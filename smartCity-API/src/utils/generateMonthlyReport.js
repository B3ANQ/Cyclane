const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function generateMonthlyReportCSV(outputPath) {
  // Début et fin du mois courant
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  // Récupérer les signalements du mois
  const reports = await prisma.report.findMany({
    where: {
      timestamp: {
        gte: startOfMonth,
        lte: endOfMonth
      }
    },
    orderBy: { timestamp: 'asc' }
  });

  // Générer le CSV
  const header = 'id,type,latitude,longitude,timestamp,status\n';
  const rows = reports.map(r =>
    `${r.id},${r.type},${r.latitude},${r.longitude},${r.timestamp.toISOString()},${r.status}`
  );
  const csvContent = header + rows.join('\n');

  fs.writeFileSync(outputPath, csvContent, 'utf8');
}

module.exports = generateMonthlyReportCSV;