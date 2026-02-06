import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Iniciando seed: admin auth only...');

  const email = 'maiara.mkcloset@gmail.com';
  const plainPassword = 'Hgalslua761';
  const password = await bcrypt.hash(plainPassword, 10);

  await prisma.user.upsert({
    where: { email },
    update: {
      password,
      role: Role.ADMIN,
    },
    create: {
      email,
      password,
      role: Role.ADMIN,
    },
  });
  console.log('✅ Admin criado/atualizado com sucesso.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
