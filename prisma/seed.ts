import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Iniciando o seed de recuperação total...');

  // 1. Limpeza profunda para evitar duplicidade ou lixo
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  console.log('🧹 Banco limpo para recepção dos dados originais.');

  // 2. Recriação das Categorias (IDs fixos para manter integridade)
  const vestidos = await prisma.category.create({
    data: {
      name: 'Vestidos',
      slug: 'vestidos',
      imageUrl: 'https://res.cloudinary.com/dwsqjnbnq/image/upload/v1768583483/renda-frent1_asekyb.jpg'
    }
  });

  const conjuntos = await prisma.category.create({
    data: {
      name: 'Conjuntos',
      slug: 'conjuntos',
      imageUrl: 'https://res.cloudinary.com/dwsqjnbnq/image/upload/v1768584519/sint-frent_tdznei.jpg'
    }
  });

  console.log('✅ Categorias recuperadas.');

  // 3. Injeção dos Produtos Exatos (Dados do Record 1 ao 4)
  await prisma.product.createMany({
    data: [
      {
        id: '6740992d-3707-4437-a309-a1cc31c3e7b4',
        name: 'Conjunto Sintonia - Lurex Dourado',
        description: 'Conjunto com detalhes em lurex dourado. Top cropped halter com amarração nas costas e drapeado no busto. Saia longa com caimento fluido, leve transparência e estampa sofisticada. Ideal para looks tropicais e verão de luxo.',
        price: 299.00,
        images: [
          'https://res.cloudinary.com/dwsqjnbnq/image/upload/v1768584519/sint-frent_tdznei.jpg',
          'https://res.cloudinary.com/dwsqjnbnq/image/upload/v1768584519/sint-lado_eksg0e.jpg',
          'https://res.cloudinary.com/dwsqjnbnq/image/upload/v1768584520/sint-frente_ehw3zj.jpg'
        ],
        stock: 10,
        categoryId: conjuntos.id,
        isFeatured: true
      },
      {
        id: 'ddeb4539-c829-4873-b19a-f8fe9e48d9da',
        name: 'Vestido em Renda com Amarração Lateral',
        description: 'Vestido confeccionado em renda delicada, com transparência sofisticada e toque sensual na medida certa. Possui mangas longas em renda e amarração lateral perfeita que valoriza a silhueta. A peça conta com acabamento refinado e caimento impecável.',
        price: 330.00,
        images: [
          'https://res.cloudinary.com/dwsqjnbnq/image/upload/v1768583483/renda-frent1_asekyb.jpg',
          'https://res.cloudinary.com/dwsqjnbnq/image/upload/v1768583483/renda-frente_f0wldz.jpg',
          'https://res.cloudinary.com/dwsqjnbnq/image/upload/v1768583483/renda_ozdf3y.jpg'
        ],
        stock: 10,
        categoryId: vestidos.id,
        isFeatured: true
      },
      {
        id: 'f7768f46-71f0-4d4f-9b2d-afcee5c1b8f2',
        name: 'Conjunto Poá',
        description: 'Conjunto em poá clássico, atemporal e super feminino. O top tomara que caia possui zíper nas costas, garantindo melhor ajuste e praticidade, enquanto a saia traz modelagem que valoriza a silhueta com leveza e sofisticação. As peças são vendidas separadamente.',
        price: 125.00,
        images: [
          'https://res.cloudinary.com/dwsqjnbnq/image/upload/v1768584045/poa-frent_he82za.jpg',
          'https://res.cloudinary.com/dwsqjnbnq/image/upload/v1768584046/poa-fren_gvcnld.jpg'
        ],
        stock: 15,
        categoryId: conjuntos.id,
        isFeatured: true
      },
      {
        id: '3ccb000e-0174-40ea-8ea3-48ab0a61e8a3',
        name: 'Conjunto Poá (Variação)',
        description: 'Conjunto em poá clássico, atemporal e super feminino. O top tomara que caia possui zíper nas costas. As peças são vendidas separadamente.',
        price: 150.00,
        images: [
          'https://res.cloudinary.com/dwsqjnbnq/image/upload/v1768584045/poa-lado_tlcmpm.jpg',
          'https://res.cloudinary.com/dwsqjnbnq/image/upload/v1768584046/poa-frente_h0hbyx.jpg'
        ],
        stock: 15,
        categoryId: conjuntos.id,
        isFeatured: true
      }
    ]
  });

  console.log('✅ Dados restaurados com sucesso.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });