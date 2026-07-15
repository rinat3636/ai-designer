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
      monthlyLimit: 0,
      features: ["Безлимитные генерации", "Базовые шаблоны", "Стандартная очередь"],
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

  // Per-template instructions for concept and design generation
  const promptHintsBySlug: Record<string, { concept: string; design: string; transparent?: boolean }> = {
    "marketplace-product-card": {
      concept: "Концепции карточки товара для маркетплейса: чистый фон, крупный продукт/иконка, читаемая цена и скидка, минимум текста, акцент на выгоде.",
      design: "Create a marketplace product card. Use a clean light background. Show the product as a simple vector icon or silhouette. Make the price and discount the largest elements. Add a short product name and a small CTA. Keep the layout spacious, high contrast, and mobile-readable.",
    },
    "marketplace-infographic": {
      concept: "Инфографика для маркетплейса: 4-6 преимуществ в виде иконка + короткая подпись, чёткая сетка, контрастные акценты, без мелкого текста.",
      design: "Build an infographic as a clean vertical or horizontal list. Each item is a simple icon + one short line of text. Use 4-6 items, large fonts, plenty of whitespace, and accent colors from the palette. No tiny details.",
    },
    "marketplace-promo-banner": {
      concept: "Баннер акции на маркетплейсе: яркая скидка, короткий заголовок, сильный CTA, контрастная палитра.",
      design: "Design a promo banner. The discount percentage must be the largest element. Add a short headline and a clear CTA button. Use a bright but not cluttered background. Keep text under 8 words.",
    },
    "marketplace-shop-cover": {
      concept: "Шапка магазина на маркетплейсе: широкий формат, название, слоган, простая графика, минимум текста.",
      design: "Design a wide shop cover (1920×640 feel). Place the shop name and tagline on the left. Use a simple icon or shape on the right. Keep the background solid or with a very subtle gradient. Minimal text.",
    },
    "ad-banner": {
      concept: "Рекламный баннер: один короткий продающий заголовок, чёткий CTA, контрастная палитра, много воздуха.",
      design: "Design a horizontal ad banner. One strong headline (max 5 words), one short benefit, and a CTA button. Use high-contrast text on a solid or soft gradient background. Leave clean negative space around text.",
    },
    "ad-poster": {
      concept: "Афиша мероприятия: название, дата/место, призыв, выразительная типографика, лёгкая атмосфера.",
      design: "Design an event poster. Prominent event name at the top, date/location below, and a clear call to action. Use expressive but readable typography. Add one simple decorative element. Vertical or square format.",
    },
    "ad-poster2": {
      concept: "Декоративный постер: художественная композиция из простых форм, крупный заголовок, минимум текста, акцент на стиль.",
      design: "Design a decorative poster. A large headline, an artistic composition of simple vector shapes, and minimal supporting text. Focus on style and color harmony, not on selling.",
    },
    "ad-billboard": {
      concept: "Билборд: один очень короткий заголовок, максимальная контрастность и читаемость издалека.",
      design: "Design a large billboard. One ultra-short headline (3-5 words) and a phone/website in small but legible text. Use bold high-contrast colors. Avoid decorative clutter — it must read from far away.",
    },
    "social-post": {
      concept: "Пост для ленты: квадрат 1:1, крупный заголовок, 2-3 строки основного текста, ясный CTA.",
      design: "Design a 1:1 social feed post. A bold headline, 2-3 lines of body text, and a clear CTA button or swipe prompt. Use a solid or gradient background from the palette. Leave clean space around text.",
    },
    "social-stories": {
      concept: "Stories: вертикальный 9:16, заголовок сверху, минимум текста по центру, CTA снизу.",
      design: "Design a 9:16 vertical story. Headline at the top, small central image/illustration or minimal text, and a CTA at the bottom ('swipe up' / 'link'). Keep the middle area open for UI overlays.",
    },
    "social-carousel": {
      concept: "Слайд карусели: квадрат, один тезис + короткое пояснение, простая иконка/цифра.",
      design: "Design a square carousel slide. One clear thesis as the headline, a one-line explanation, and a small icon or number. Keep each slide focused on a single idea. Consistent style across imagined slides.",
    },
    "social-community-cover": {
      concept: "Обложка сообщества: широкий формат, название и слоган, минимум текста, узнаваемость.",
      design: "Design a wide community cover (1920×640 feel). Community name and tagline on the left, a simple graphic element on the right. Solid or subtle gradient background. Very little text.",
    },
    "branding-logo": {
      concept: "Логотип: простой масштабируемый знак + читаемое название, 1-3 цвета, минимум деталей, плоский вектор.",
      design: "Create a professional logo mark. Combine a simple geometric symbol or lettermark with the brand name as clean text. Use 1-3 flat colors, no shadows, no photorealism, no 3D. It must remain readable at 64×64 px. Transparent background.",
      transparent: true,
    },
    "branding-business-card": {
      concept: "Визитка: компактная сетка контактов, много воздуха, премиум или минимализм.",
      design: "Design a professional business card layout (1050×600). Name and title prominent, contact details (phone, email, website, address) neatly aligned. Use accent color for the name. Plenty of whitespace, clean grid.",
    },
    "branding-certificate": {
      concept: "Сертификат: элегантный, название, номинал, декоративная рамка, сдержанная премиум-палитра.",
      design: "Design an elegant certificate (1920×1080). Title at the top, value/recipient text in the center, decorative border or corner ornaments, and signature lines at the bottom. Use serif or classic fonts and a restrained premium palette.",
    },
    "branding-flyer": {
      concept: "Флаер/листовка: заголовок, 3-4 преимущества, контакты, CTA, компактная печатная композиция.",
      design: "Design a flyer (A5/A6 proportions). A bold headline, 3-4 short benefits, contacts, and a CTA. Use a clear visual hierarchy, readable fonts, and accent color for the CTA. Do not overcrowd.",
    },
    "branding-gift-certificate": {
      concept: "Подарочный сертификат: сумма, кому/от кого, праздничные, но сдержанные акценты.",
      design: "Design a gift certificate. Title, nominal value, and 'to/from' fields. Use festive but tasteful accents (ribbons, soft ornaments). Keep text centered and elegant. Clear space for handwriting or printing.",
    },
    "site-hero-banner": {
      concept: "Hero-баннер сайта: главный заголовок, подзаголовок 1-2 строки, CTA, минимум графики, акцент на типографику.",
      design: "Design a wide hero banner. A large main headline, a 1-2 line subheadline, and a CTA button. Keep graphics minimal — focus on typography and a strong color background or subtle gradient.",
    },
    "site-promo-banner": {
      concept: "Баннер акции на сайте: скидка, CTA, яркий акцент, короткий текст.",
      design: "Design a website promo banner. The discount is the hero element. Add a short headline and a CTA button. Use a bright accent background from the palette. Keep text short and scannable.",
    },
    "site-icons": {
      concept: "Набор иконок для интерфейса: монолиния, 24×24 feel, простые формы, сетка 2×3/3×2.",
      design: "Create a set of 4-6 simple UI icons in a monoline or flat style. Arrange them in a 2×3 or 3×2 grid. Use consistent stroke width, simple geometry, no gradients, no shadows. Light background, dark stroke color from the palette.",
      transparent: true,
    },
    "site-illustrations": {
      concept: "Иллюстрация для сайта: простая векторная сцена, плоский стиль, без мелких деталей.",
      design: "Create a simple website illustration. A flat vector scene with a character or object relevant to the topic. Use the brand palette, keep shapes simple, avoid tiny details. Optional short caption.",
    },
  };

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
    const promptHints = promptHintsBySlug[t.slug] || null;
    await prisma.template.upsert({
      where: { slug: t.slug },
      update: {
        category: t.category,
        categoryKey: t.categoryKey,
        name: t.name,
        description: t.description,
        icon: t.icon,
        fields: t.fields as any,
        promptHints: promptHints as any,
      },
      create: {
        slug: t.slug,
        category: t.category,
        categoryKey: t.categoryKey,
        name: t.name,
        description: t.description,
        icon: t.icon,
        fields: t.fields as any,
        promptHints: promptHints as any,
      },
    });
  }

  // Prompt configs
  const prompts = [
    {
      key: "conceptGeneration",
      prompt: `Ты — старший арт-директор и маркетолог с 15-летним опытом. Проанализируй нишу клиента по его брифу и предложи 4-6 профессиональных концепций дизайна.

Что должно быть в анализе:
- Краткий разбор ниши, аудитории и конкурентного контекста.
- Какие цвета, стили и композиции работают в этой нише и почему.
- Как выделить бренд среди конкурентов.

Что должно быть в каждой концепции:
- name: 1-3 слова, запоминающееся название концепции.
- description: 1-2 предложения о визуальном решении.
- explanation: 1-2 предложения, почему эта концепция подходит именно этому бизнесу/аудитории.
- palette: 5 конкретных hex-кодов (не плейсхолдеры), подобранных под нишу.
- recommendations: 3 практических совета по использованию концепции.

Верни ТОЛЬКО JSON-объект вида:
{
  "analysis": "...",
  "concepts": [
    { "name": "...", "description": "...", "explanation": "...", "palette": ["#hex", "#hex", "#hex", "#hex", "#hex"], "recommendations": ["...", "...", "..."] }
  ]
}

Без markdown, без текста вне JSON.`,
      description: "Генерация концепций и анализа ниши",
    },
    {
      key: "imageGeneration",
      prompt: `You are a senior graphic designer. Create a professional, production-ready design as a single self-contained SVG.

Use the brand name, business description, target audience, selected concept, style, and color palette. Follow the design-type instructions. Keep typography clear, use clean vector shapes, leave negative space, and avoid raster images, shadows, 3D, or photorealism unless requested. Output raw SVG 1.1 markup only.`,
      description: "Базовый системный промпт для генерации макетов",
    },
    {
      key: "imageIdeogram",
      prompt: `A professional marketing design in the requested style for the business. Use the provided brand name, concept, color palette, and text blocks. Clean layout, readable text, no clutter, no raster images. Output as a flat vector design.`,
      description: "Базовый промпт для внешних image-моделей",
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
