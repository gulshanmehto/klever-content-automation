import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const task = await prisma.articleTask.findUnique({
    where: { id: 8 },
    include: { articleSections: { orderBy: { position: 'asc' } } }
  });

  if (!task) return console.log('No task');

  const sectionsToProcess = [];
  for (const section of task.articleSections) {
    if (!section.imagePrompt) continue;
    const existingValid = await prisma.imageGeneration.findFirst({
      where: { articleSectionId: section.id, qcStatus: { in: ['GENERATED', 'PASSED', 'NEEDS_MANUAL_REVIEW'] } },
    });
    if (!existingValid) {
      sectionsToProcess.push({
        position: section.position,
      });
    }
  }
  console.log('To process:', sectionsToProcess);
}
main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
