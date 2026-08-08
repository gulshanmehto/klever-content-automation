import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL || 'admin@klevermarketing.com';
  const password = process.env.ADMIN_PASSWORD || 'admin123';

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash },
    create: {
      email,
      passwordHash,
      name: 'Admin',
    },
  });

  console.log(`✅ Admin user created/updated: ${user.email}`);

  // Create a sample website if none exists
  const websiteCount = await prisma.website.count();
  if (websiteCount === 0) {
    const website = await prisma.website.create({
      data: {
        name: 'My Website',
        domain: 'example.com',
        wpBaseUrl: 'https://example.com',
        watermarkText: 'example.com',
        targetCountry: 'US',
        targetAudience: 'general',
        defaultTone: 'informative',
        defaultImageStyle: 'photorealistic',
        defaultImageRatio: '16:9',
      },
    });
    console.log(`✅ Sample website created: ${website.name} (${website.domain})`);
  }

  console.log('🎉 Seed complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
