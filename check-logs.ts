import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const logs = await prisma.taskLog.findMany({ 
    where: { articleTaskId: 7 }, 
    orderBy: { createdAt: 'desc' }, 
    take: 10 
  });
  console.log(logs);
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
