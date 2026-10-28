require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const { TEAM_OWNER_USER_ID, TEAM_OWNER_EMAIL, TEAM_OWNER_NAME } = process.env;
  if (!TEAM_OWNER_USER_ID || !TEAM_OWNER_EMAIL || !TEAM_OWNER_NAME) {
    throw new Error('Set TEAM_OWNER_USER_ID, TEAM_OWNER_EMAIL, and TEAM_OWNER_NAME first.');
  }

  const existingOwner = await prisma.teamMember.findFirst({
    where: { role: 'SYSTEM_OWNER', isActive: true },
  });
  if (existingOwner) {
    throw new Error('An active System Owner already exists.');
  }

  await prisma.teamMember.upsert({
    where: { userId: TEAM_OWNER_USER_ID },
    create: {
      userId: TEAM_OWNER_USER_ID,
      email: TEAM_OWNER_EMAIL.trim().toLowerCase(),
      name: TEAM_OWNER_NAME.trim(),
      role: 'SYSTEM_OWNER',
      isActive: true,
    },
    update: {
      email: TEAM_OWNER_EMAIL.trim().toLowerCase(),
      name: TEAM_OWNER_NAME.trim(),
      role: 'SYSTEM_OWNER',
      isActive: true,
    },
  });
  process.stdout.write('Initial System Owner is ready. Remove the temporary owner variables now.\n');
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Owner setup failed.'}\n`);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
