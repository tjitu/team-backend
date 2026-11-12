require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const SEED_PROJECT_ID = 'seed-project-community-partnership';

const INITIAL_PARTNERSHIPS = [
  {
    id: 'seed-marketing-partner-1',
    name: 'studyarchive27',
    category: 'Creator',
    platform: 'X',
    totalMembers: 0,
    notes: null,
    sortOrder: 1,
  },
  {
    id: 'seed-marketing-partner-2',
    name: 'piscesslifes',
    category: 'Creator',
    platform: 'X',
    totalMembers: 0,
    notes: null,
    sortOrder: 2,
  },
  {
    id: 'seed-marketing-partner-3',
    name: 'b4efaa',
    category: 'Creator',
    platform: 'X',
    totalMembers: 0,
    notes: 'https://x.com/b4efaa?s=11',
    sortOrder: 3,
  },
  {
    id: 'seed-marketing-partner-4',
    name: 'lalaaskyyy',
    category: 'Creator',
    platform: 'X',
    totalMembers: 0,
    notes: 'https://x.com/lalaaskyyy?s=11',
    sortOrder: 4,
  },
  {
    id: 'seed-marketing-partner-5',
    name: 'zupazuft',
    category: 'Creator',
    platform: 'X',
    totalMembers: 0,
    notes: 'https://x.com/zupazuft?s=11',
    sortOrder: 5,
  },
  {
    id: 'seed-marketing-partner-6',
    name: 'altherlys',
    category: 'Creator',
    platform: 'X',
    totalMembers: 0,
    notes: 'https://x.com/altherlys?s=11',
    sortOrder: 6,
  },
];

async function ensureSeedProject(marketingDeptId) {
  let project = await prisma.project.findFirst({
    where: {
      OR: [
        { id: SEED_PROJECT_ID },
        { slug: 'community-partnership' },
      ],
    },
  });

  const creator = await prisma.teamMember.findFirst({
    where: { isActive: true },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    select: { id: true },
  });

  if (!project && marketingDeptId && creator) {
    project = await prisma.project.create({
      data: {
        id: SEED_PROJECT_ID,
        name: 'Community & Partnership',
        slug: 'community-partnership',
        description:
          'Outreach, broadcast, dan kolaborasi komunitas, akun belajar, serta grup sekolah untuk pertumbuhan JituPTN.',
        departmentId: marketingDeptId,
        hasPartnershipSheet: true,
        createdById: creator.id,
      },
    });
  } else if (project && !project.hasPartnershipSheet) {
    project = await prisma.project.update({
      where: { id: project.id },
      data: { hasPartnershipSheet: true },
    });
  }

  if (project && marketingDeptId) {
    // Ensure active Marketing members and System Owners/Admins have access to this project.
    const [deptMembers, admins] = await Promise.all([
      prisma.teamMemberDepartment.findMany({
        where: { departmentId: marketingDeptId, isActive: true, teamMember: { isActive: true } },
        select: { teamMemberId: true },
      }),
      prisma.teamMember.findMany({
        where: { isActive: true, role: { in: ['SYSTEM_OWNER', 'SYSTEM_ADMIN'] } },
        select: { id: true },
      }),
    ]);

    const adminSet = new Set(admins.map((a) => a.id));
    const memberIds = Array.from(new Set([...admins.map((a) => a.id), ...deptMembers.map((m) => m.teamMemberId)]));

    for (const teamMemberId of memberIds) {
      await prisma.projectMember.upsert({
        where: { projectId_teamMemberId: { projectId: project.id, teamMemberId } },
        create: {
          projectId: project.id,
          teamMemberId,
          role: adminSet.has(teamMemberId) ? 'PROJECT_MANAGER' : 'MEMBER',
          isActive: true,
        },
        update: { isActive: true },
      });
    }
  }

  return project;
}

async function main() {
  const marketingDept = await prisma.department.findFirst({
    where: { slug: 'marketing' },
    select: { id: true },
  });

  const project = await ensureSeedProject(marketingDept?.id ?? null);

  const existing = await prisma.marketingPartnership.findMany({
    where: { archivedAt: null },
    select: { id: true, name: true, platform: true, projectId: true },
  });

  const seen = new Set(
    existing.map((row) => `${row.name.trim().toLowerCase()}::${row.platform.trim().toLowerCase()}`),
  );
  const existingById = new Map(existing.map((row) => [row.id, row]));

  let createdCount = 0;
  let linkedCount = 0;
  for (const item of INITIAL_PARTNERSHIPS) {
    const found = existingById.get(item.id);
    if (found) {
      if (project && !found.projectId) {
        await prisma.marketingPartnership.update({
          where: { id: found.id },
          data: { projectId: project.id },
        });
        linkedCount += 1;
      }
      continue;
    }

    const key = `${item.name.toLowerCase()}::${item.platform.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }

    await prisma.marketingPartnership.create({
      data: {
        id: item.id,
        name: item.name,
        category: item.category,
        platform: item.platform,
        totalMembers: item.totalMembers,
        broadcastStatus: 'NOT_STARTED',
        notes: item.notes,
        projectId: project?.id ?? null,
        departmentId: marketingDept?.id ?? null,
        sortOrder: item.sortOrder,
      },
    });
    createdCount += 1;
  }

  // Also link any existing unlinked marketing partnerships to the seeded project.
  if (project) {
    const updated = await prisma.marketingPartnership.updateMany({
      where: { projectId: null, archivedAt: null },
      data: { projectId: project.id },
    });
    linkedCount += updated.count;
  }

  process.stdout.write(
    `Project "${project?.name ?? 'none'}" ready. Seeded ${createdCount} row(s), linked ${linkedCount} row(s).\n`,
  );
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Seed failed.'}\n`);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
