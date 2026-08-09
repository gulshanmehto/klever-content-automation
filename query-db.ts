import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const images = await prisma.imageGeneration.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, qcStatus: true, error: true, provider: true, model: true }
  });
  console.log(images);
}
main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
