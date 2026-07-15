import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Subscription plans
  const plans = [
    {
      slug: "free",
      name: "Бесплатный",
      description: "Для пробных генераций",
      priceMonthly: 0,
      monthlyLimit: 5,
      features: ["5 генераций в месяц", "Базовые шаблоны", "Стандартная очередь"],
      displayOrder: 0,
    },
    {
      slug: "basic",
      name: "Базовый",
      description: "Для небольшого бизнеса",
      priceMonthly: 99000,
      monthlyLimit: 30,
      features: ["30 генераций в месяц", "Все шаблоны", "Стандартная очередь"],
      displayOrder: 1,
    },
    {
      slug: "pro",
      name: "Pro",
      description: "Для активного маркетинга",
      priceMonthly: 299000,
      monthlyLimit: 150,
      features: ["150 генераций в месяц", "Все шаблоны", "Приоритетная генерация"],
      displayOrder: 2,
    },
    {
      slug: "business",
      name: "Business",
      description: "Для команд и агентств",
      priceMonthly: 999000,
      monthlyLimit: 1000,
      features: ["1000 генераций в месяц", "Все шаблоны", "Приоритетная генерация", "Доступ команды"],
      displayOrder: 3,
    },
  ];

  for (const plan of plans) {
    await prisma.subscriptionPlan.upsert({
      where: { slug: plan.slug },
      update: plan,
      create: plan,
    });
  }

  // Base fields reused across templates
  const contactFields = [
    { name: "headline", label: "Заголовок", type: "text", required: true },
    { name: "subheadline", label: "Подзаголовок", type: "text", required: false },
    { name: "website", label: "Сайт", type: "url", required: false },
    { name: "phone", label: "Телефон", type: "tel", required: false },
    { name: "telegram", label: "Telegram", type: "text", required: false },
    { name: "email", label: "Email", type: "email", required: false },
    { name: "address", label: "Адрес", type: "text", required: false },
    { name: "discount", label: "Размер скидки / акция", type: "text", required: false },
    { name: "buttonText", label: "Текст кнопки", type: "text", required: false },
  ];

  const templates = [
    // Marketplaces
    {
      slug: "marketplace-product-card",
      category: "Маркетплейсы",
      categoryKey: "marketplaces",
      name: "Карточка товара",
      description: "Профессиональная карточка для маркетплейсов",
      icon: "ShoppingBag",
      fields: [
        { name: "productName", label: "Название товара", type: "text", required: true },
        { name: "price", label: "Цена", type: "text", required: false },
        { name: "oldPrice", label: "Старая цена", type: "text", required: false },
        { name: "productDesc", label: "Описание товара", type: "textarea", required: false },
        { name: "discount", label: "Скидка", type: "text", required: false },
        { name: "buttonText", label: "Текст кнопки", type: "text", required: false },
      ],
    },
    {
      slug: "marketplace-infographic",
      category: "Маркетплейсы",
      categoryKey: "marketplaces",
      name: "Инфографика",
      description: "Схема преимуществ и характеристик",
      icon: "BarChart3",
      fields: [
        { name: "headline", label: "Заголовок", type: "text", required: true },
        { name: "features", label: "Преимущества (через запятую)", type: "textarea", required: false },
        { name: "buttonText", label: "Текст кнопки", type: "text", required: false },
      ],
    },
    {
      slug: "marketplace-promo-banner",
      category: "Маркетплейсы",
      categoryKey: "marketplaces",
      name: "Баннер акции",
      description: "Баннер для промо на маркетплейсе",
      icon: "Percent",
      fields: contactFields,
    },
    {
      slug: "marketplace-shop-cover",
      category: "Маркетплейсы",
      categoryKey: "marketplaces",
      name: "Обложка магазина",
      description: "Шапка витрины магазина",
      icon: "Store",
      fields: [
        { name: "headline", label: "Название магазина / слоган", type: "text", required: true },
        { name: "subheadline", label: "Подзаголовок", type: "text", required: false },
        { name: "buttonText", label: "Текст кнопки", type: "text", required: false },
      ],
    },
    // Advertising
    {
      slug: "ad-banner",
      category: "Реклама",
      categoryKey: "advertising",
      name: "Рекламный баннер",
      description: "Баннер для контекстной и таргетированной рекламы",
      icon: "Megaphone",
      fields: contactFields,
    },
    {
      slug: "ad-poster",
      category: "Реклама",
      categoryKey: "advertising",
      name: "Афиша",
      description: "Афиша мероприятия или продукта",
      icon: "Ticket",
      fields: [
        { name: "headline", label: "Название события", type: "text", required: true },
        { name: "subheadline", label: "Дата / место", type: "text", required: false },
        { name: "discount", label: "Промокод", type: "text", required: false },
        { name: "buttonText", label: "Текст кнопки", type: "text", required: false },
      ],
    },
    {
      slug: "ad-poster2",
      category: "Реклама",
      categoryKey: "advertising",
      name: "Постер",
      description: "Декоративный постер",
      icon: "Image",
      fields: [
        { name: "headline", label: "Заголовок", type: "text", required: true },
        { name: "subheadline", label: "Подзаголовок", type: "text", required: false },
        { name: "buttonText", label: "Текст кнопки", type: "text", required: false },
      ],
    },
    {
      slug: "ad-billboard",
      category: "Реклама",
      categoryKey: "advertising",
      name: "Билборд",
      description: "Крупный наружный баннер",
      icon: "RectangleHorizontal",
      fields: [
        { name: "headline", label: "Короткий заголовок", type: "text", required: true },
        { name: "subheadline", label: "Телефон / сайт", type: "text", required: false },
        { name: "buttonText", label: "Призыв", type: "text", required: false },
      ],
    },
    // Social
    {
      slug: "social-post",
      category: "Социальные сети",
      categoryKey: "social",
      name: "Пост",
      description: "Пост для ленты",
      icon: "MessageSquare",
      fields: [
        { name: "headline", label: "Заголовок", type: "text", required: true },
        { name: "subheadline", label: "Основной текст", type: "textarea", required: false },
        { name: "discount", label: "Акция", type: "text", required: false },
        { name: "buttonText", label: "Призыв", type: "text", required: false },
      ],
    },
    {
      slug: "social-stories",
      category: "Социальные сети",
      categoryKey: "social",
      name: "Stories",
      description: "Вертикальная история",
      icon: "Smartphone",
      fields: [
        { name: "headline", label: "Заголовок", type: "text", required: true },
        { name: "subheadline", label: "Подпись", type: "text", required: false },
        { name: "buttonText", label: "Свайп / текст", type: "text", required: false },
      ],
    },
    {
      slug: "social-carousel",
      category: "Социальные сети",
      categoryKey: "social",
      name: "Карусель",
      description: "Набор слайдов для карусели",
      icon: "GalleryHorizontal",
      fields: [
        { name: "headline", label: "Тема карусели", type: "text", required: true },
        { name: "subheadline", label: "Ключевые тезисы", type: "textarea", required: false },
        { name: "buttonText", label: "Призыв", type: "text", required: false },
      ],
    },
    {
      slug: "social-community-cover",
      category: "Социальные сети",
      categoryKey: "social",
      name: "Обложка сообщества",
      description: "Обложка для группы или канала",
      icon: "Users",
      fields: [
        { name: "headline", label: "Название сообщества / слоган", type: "text", required: true },
        { name: "subheadline", label: "Подпись", type: "text", required: false },
      ],
    },
    // Branding
    {
      slug: "branding-logo",
      category: "Брендинг",
      categoryKey: "branding",
      name: "Логотип",
      description: "Концепции логотипа",
      icon: "PenTool",
      fields: [
        { name: "headline", label: "Название компании", type: "text", required: true },
        { name: "subheadline", label: "Слоган / текст", type: "text", required: false },
        { name: "style", label: "Стиль (минимализм, премиум, яркий)", type: "text", required: false },
      ],
    },
    {
      slug: "branding-business-card",
      category: "Брендинг",
      categoryKey: "branding",
      name: "Визитка",
      description: "Макет визитки",
      icon: "IdCard",
      fields: [
        { name: "headline", label: "Имя / должность", type: "text", required: true },
        { name: "phone", label: "Телефон", type: "tel", required: false },
        { name: "email", label: "Email", type: "email", required: false },
        { name: "website", label: "Сайт", type: "url", required: false },
        { name: "address", label: "Адрес", type: "text", required: false },
      ],
    },
    {
      slug: "branding-certificate",
      category: "Брендинг",
      categoryKey: "branding",
      name: "Сертификат",
      description: "Подарочный или благодарственный сертификат",
      icon: "Award",
      fields: [
        { name: "headline", label: "Название", type: "text", required: true },
        { name: "subheadline", label: "Номинал / текст", type: "text", required: false },
        { name: "buttonText", label: "Текст кнопки", type: "text", required: false },
      ],
    },
    {
      slug: "branding-flyer",
      category: "Брендинг",
      categoryKey: "branding",
      name: "Флаер / Листовка",
      description: "Печатная листовка",
      icon: "FileText",
      fields: contactFields,
    },
    {
      slug: "branding-gift-certificate",
      category: "Брендинг",
      categoryKey: "branding",
      name: "Подарочный сертификат",
      description: "Сертификат для клиентов",
      icon: "Gift",
      fields: [
        { name: "headline", label: "Название", type: "text", required: true },
        { name: "subheadline", label: "Номинал", type: "text", required: false },
        { name: "buttonText", label: "Текст кнопки", type: "text", required: false },
      ],
    },
    // Website
    {
      slug: "site-hero-banner",
      category: "Для сайта",
      categoryKey: "website",
      name: "Hero Banner",
      description: "Главный баннер сайта",
      icon: "LayoutTemplate",
      fields: [
        { name: "headline", label: "Главный заголовок", type: "text", required: true },
        { name: "subheadline", label: "Подзаголовок", type: "text", required: false },
        { name: "buttonText", label: "Текст кнопки", type: "text", required: false },
      ],
    },
    {
      slug: "site-promo-banner",
      category: "Для сайта",
      categoryKey: "website",
      name: "Баннер акции",
      description: "Баннер со скидкой для сайта",
      icon: "Tag",
      fields: contactFields,
    },
    {
      slug: "site-icons",
      category: "Для сайта",
      categoryKey: "website",
      name: "Иконки",
      description: "Набор иконок для интерфейса",
      icon: "Grid3X3",
      fields: [
        { name: "headline", label: "Тема / стиль иконок", type: "text", required: true },
        { name: "subheadline", label: "Количество и описание", type: "textarea", required: false },
      ],
    },
    {
      slug: "site-illustrations",
      category: "Для сайта",
      categoryKey: "website",
      name: "Иллюстрации",
      description: "Иллюстрации для страниц",
      icon: "Palette",
      fields: [
        { name: "headline", label: "Тема иллюстрации", type: "text", required: true },
        { name: "subheadline", label: "Описание сцены", type: "textarea", required: false },
      ],
    },
  ];

  for (const t of templates) {
    await prisma.template.upsert({
      where: { slug: t.slug },
      update: {
        category: t.category,
        categoryKey: t.categoryKey,
        name: t.name,
        description: t.description,
        icon: t.icon,
        fields: t.fields as any,
      },
      create: {
        slug: t.slug,
        category: t.category,
        categoryKey: t.categoryKey,
        name: t.name,
        description: t.description,
        icon: t.icon,
        fields: t.fields as any,
      },
    });
  }

  // Prompt configs
  const prompts = [
    {
      key: "conceptGeneration",
      prompt: `Ты — опытный арт-директор и маркетолог. На основе брифа клиента придумай 4-6 концепций дизайна. Для каждой концепции дай: название (1-2 слова), краткое описание (1-2 предложения), палитра из 5 hex-кодов, 3 рекомендации по стилю. Верни ТОЛЬКО JSON-объект со свойством "concepts" — массив объектов {name, description, palette (массив hex), recommendations (массив строк)}. Без markdown, без пояснений.`,
      description: "Генерация концепций дизайна по брифу",
    },
    {
      key: "imageGeneration",
      prompt: `Профессиональный рекламный дизайн на тему: {topic}. Стиль: {style}. Цвета: {colors}. Текстовые элементы (только если логично вписать): {text}. Избегай лишнего мелкого текста — только крупная композиция.`,
      description: "Базовый промпт для генерации макетов",
    },
    {
      key: "imageIdeogram",
      prompt: `A professional marketing design in {style} style for a business. Theme: {topic}. Use colors: {colors}. Include clear, readable text: {text}. No clutter.`,
      description: "Базовый промпт для Ideogram",
    },
  ];

  for (const p of prompts) {
    await prisma.promptConfig.upsert({
      where: { key: p.key },
      update: { prompt: p.prompt, description: p.description },
      create: { key: p.key, prompt: p.prompt, description: p.description },
    });
  }

  console.log("Seeded plans, templates and prompts.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
