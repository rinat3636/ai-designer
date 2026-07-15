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
  const promptHintsBySlug: Record<string, { concept: string; design: string }> = {
    "marketplace-product-card": {
      concept: "Концепции для карточки товара на маркетплейсе: акцент на цене/выгоде, чистый фон, крупный продукт, минимум текста.",
      design: "Горизонтальная или квадратная карточка товара. Покажи продукт как простую векторную иконку/силуэт, цену и скидку крупным шрифтом, короткое название. Фон светлый, без мелких деталей.",
    },
    "marketplace-infographic": {
      concept: "Инфографика для маркетплейса: 3-5 читаемых преимуществ с иконками, чёткая структура.",
      design: "Инфографика в виде вертикального или горизонтального списка: иконка + короткая подпись преимущества. 4-6 блоков, крупный шрифт, контрастные акценты.",
    },
    "marketplace-promo-banner": {
      concept: "Баннер акции на маркетплейсе: яркая скидка, чёткий CTA, минимум текста.",
      design: "Баннер с крупной скидкой (например, -30%), коротким заголовком и кнопкой. Фон яркий, но не перегруженный.",
    },
    "marketplace-shop-cover": {
      concept: "Шапка/обложка магазина на маркетплейсе: широкий формат, название, слоган, минимум деталей.",
      design: "Широкий горизонтальный баннер 1920×640. Слева название магазина и слоган, справа простая графика/иконка. Минимум текста.",
    },
    "ad-banner": {
      concept: "Рекламный баннер: короткий продающий заголовок, CTA, контрастная палитра, минимум текста.",
      design: "Горизонтальный рекламный баннер. Крупный заголовок, одно короткое преимущество, кнопка. Фон — сплошной или с мягким градиентом.",
    },
    "ad-poster": {
      concept: "Афиша мероприятия: название, дата/место, призыв, выразительная типографика.",
      design: "Афиша с названием события, датой/местом, декоративным элементом. Вертикальный или квадратный формат, выразительная типографика.",
    },
    "ad-poster2": {
      concept: "Декоративный постер: художественная композиция, минимум текста, акцент на стиль.",
      design: "Декоративный постер: крупный заголовок, художественная композиция из простых векторных форм. Минимум текста, акцент на стиль.",
    },
    "ad-billboard": {
      concept: "Билборд: очень крупный короткий текст, максимальная контрастность и читаемость издалека.",
      design: "Горизонтальный билборд. Один короткий заголовок (3-5 слов), телефон/сайт мелким, крупный фон. Максимальная контрастность.",
    },
    "social-post": {
      concept: "Пост для ленты: квадрат, крупный заголовок, 2-3 строки текста, ясный призыв.",
      design: "Квадратный пост 1080×1080. Заголовок, основной текст 2-3 строки, акцентная кнопка/призыв. Фон — цветной или градиент.",
    },
    "social-stories": {
      concept: "Stories: вертикальный 9:16, минимум текста по центру, кнопка внизу.",
      design: "Вертикальная история 1080×1920. Заголовок вверху, кнопка/призыв внизу (свайп вверх), минимум текста по центру.",
    },
    "social-carousel": {
      concept: "Слайд карусели: квадрат, один тезис + короткое пояснение, простая иконка/цифра.",
      design: "Квадратный слайд карусели. Один тезис/заголовок, короткое пояснение, простая иконка или цифра. Фон в стиле концепции.",
    },
    "social-community-cover": {
      concept: "Обложка сообщества: широкий формат, название и слоган, минимум текста.",
      design: "Широкая горизонтальная обложка 1920×640. Название сообщества и слоган, минимальная графика. Не перегружай текстом.",
    },
    "branding-logo": {
      concept: "Логотип: простой знак + название, масштабируемость, минимум деталей.",
      design: "Логотип/фирменный знак. Название компании крупным шрифтом и простая векторная иконка/знак рядом. Масштабируемый, читаемый, минимум деталей. Фон прозрачный/однотонный.",
    },
    "branding-business-card": {
      concept: "Визитка: компактная сетка контактов, много воздуха, премиум или минимализм.",
      design: "Макет визитки 1050×600. Имя/должность, телефон, email, сайт, адрес. Минималистичная сетка, много воздуха, акцентный цвет для имени.",
    },
    "branding-certificate": {
      concept: "Сертификат: элегантный, номинал, золотые/премиум акценты.",
      design: "Сертификат 1920×1080. Название, номинал, декоративная рамка/орнамент, шрифты с засечками. Сдержанная цветовая палитра.",
    },
    "branding-flyer": {
      concept: "Флаер/листовка: печатный, заголовок, 3-4 преимущества, контакты, CTA.",
      design: "Листовка A5/А6. Заголовок, 3-4 преимущества, контакты, CTA. Компактная композиция, читаемый шрифт, не перегружай.",
    },
    "branding-gift-certificate": {
      concept: "Подарочный сертификат: сумма, кому/от кого, праздничные акценты.",
      design: "Подарочный сертификат с названием, номиналом, полем 'кому/от кого'. Праздничные, но сдержанные акценты.",
    },
    "site-hero-banner": {
      concept: "Hero-баннер сайта: главный заголовок, подзаголовок, CTA, минимум графики.",
      design: "Широкий hero-баннер 1920×1080. Главный заголовок, подзаголовок 1-2 строки, кнопка. Минимум графики, акцент на типографику.",
    },
    "site-promo-banner": {
      concept: "Баннер акции на сайте: скидка, CTA, яркий акцент.",
      design: "Баннер со скидкой для сайта. Крупный процент скидки, короткий заголовок, кнопка. Яркий акцентный фон.",
    },
    "site-icons": {
      concept: "Набор иконок для интерфейса: монолиния, 24×24, простые формы, сетка 2×3/3×2.",
      design: "Набор из 4-6 простых иконок 24×24 пикселя в монолинейном стиле, расположенных сеткой 2×3 или 3×2. Однотонный stroke, без заливки, на светлом фоне. Иконки на тему запроса.",
    },
    "site-illustrations": {
      concept: "Иллюстрация для сайта: простая векторная сцена, плоский стиль, без мелких деталей.",
      design: "Иллюстрация для сайта. Простая векторная сцена с персонажем или объектом на тему, плоский стиль, без мелких деталей. Можно с короткой подписью.",
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
      prompt: `Ты — опытный арт-директор и маркетолог. Проанализируй нишу клиента по его брифу и предложи 4-6 концепций дизайна.

Верни ТОЛЬКО JSON-объект вида:
{
  "analysis": "2-4 предложения: что работает в нише, какая палитра/стиль подойдут, почему именно так.",
  "concepts": [
    {
      "name": "1-2 слова",
      "description": "1-2 предложения",
      "explanation": "1-2 предложения, почему эта концепция подходит конкретно для этого бизнеса/аудитории",
      "palette": ["#hex", "#hex", "#hex", "#hex", "#hex"],
      "recommendations": ["...", "...", "..."]
    }
  ]
}

Без markdown, без пояснений вне JSON.`,
      description: "Генерация концепций и анализа ниши",
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
