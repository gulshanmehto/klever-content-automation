import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const taskId = 8;
  const sections = await prisma.articleSection.findMany({
    where: { articleTaskId: taskId },
    include: {
      imageGenerations: true,
    },
    orderBy: { position: 'asc' },
    take: 3
  });
  
  for (const s of sections) {
    console.log(`Section ${s.position}: Prompt=${!!s.imagePrompt} Desc=${!!s.imageDescription}`);
    console.log(`  Generations: ${s.imageGenerations.length}`);
    for (const g of s.imageGenerations) {
      console.log(`    - ID: ${g.id} Status: ${g.qcStatus} Error: ${g.error}`);
    }
  }
}
main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
