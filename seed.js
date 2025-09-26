import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  await prisma.report.create({
    data: {
      type: "travaux",
      description: "Route cyclable coupée",
      latitude: 48.85,
      longitude: 2.35,
    },
  });

  const reports = await prisma.report.findMany();
  console.log(reports);
}

main().finally(() => prisma.$disconnect());
