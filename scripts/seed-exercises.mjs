import 'dotenv/config';
import postgres from 'postgres';

const exercises = [
  {
    seedKey: 'ege14-context-vnachale',
    type: 'multiple_choice',
    category: 'orthography',
    difficulty: 1,
    skillTags: ['ege.14', 'orthography.compound_spelling', 'context.homonymy'],
    prompt: 'Выбери пару, в которой написание зависит от значения и роли слова в предложении.',
    payload: {
      options: [
        'вначале урока / в начале пути',
        'вовремя прийти / во время урока',
        'сначала объяснить / с начала года',
      ],
    },
    answer: { correctOptionIndex: 0 },
    explanation:
      'В паре "вначале / в начале" возможны оба написания: "вначале" - наречие со значением "сначала", "в начале" - предлог с существительным.',
    typicalMistake:
      'Ученик выбирает написание по привычке, не определяя часть речи и значение в контексте.',
    sourceAlignment: {
      exam: 'EGE_RU_2025',
      fipiLine: 14,
      topic: 'Слитное, дефисное и раздельное написание слов разных частей речи',
    },
    solutionSteps: [
      'Определи, можно ли заменить слово наречием "сначала".',
      'Проверь, есть ли существительное с предлогом.',
      'Сравни значение в двух контекстах.',
    ],
  },
  {
    seedKey: 'ege12-borutsya',
    type: 'fill_blank',
    category: 'orthography',
    difficulty: 1,
    skillTags: ['ege.12', 'orthography.verb_endings', 'morphology.infinitive'],
    prompt: 'Вставь пропущенную букву. Сначала найди инфинитив и спряжение.',
    payload: {
      before: 'Они бор',
      after: 'тся за победу.',
      placeholderLabel: 'ю/я',
    },
    answer: { accepted: ['ю'], caseSensitive: false },
    explanation:
      'Начальная форма - "бороться". Это глагол I спряжения: они борются. Поэтому пишем "ю".',
    typicalMistake:
      'Ученик выбирает окончание на слух и не восстанавливает начальную форму глагола.',
    sourceAlignment: {
      exam: 'EGE_RU_2025',
      fipiLine: 12,
      topic: 'Личные окончания глаголов',
    },
    solutionSteps: [
      'Восстанови инфинитив: бороться.',
      'Определи спряжение.',
      'Выбери окончание формы 3-го лица множественного числа.',
    ],
  },
  {
    seedKey: 'ege18-k-schastyu',
    type: 'punctuation_insert',
    category: 'punctuation',
    difficulty: 1,
    skillTags: ['ege.18', 'punctuation.introductory_words'],
    prompt: 'Поставь запятую при вводной конструкции.',
    payload: {
      tokens: ['К', 'счастью', 'дождь', 'закончился'],
      allowedMarks: [','],
    },
    answer: {
      marks: [{ afterTokenIndex: 1, mark: ',' }],
    },
    explanation:
      '"К счастью" выражает отношение говорящего к сообщению и не является членом предложения. Вводные конструкции обособляются.',
    typicalMistake:
      'Ученик не отличает вводную конструкцию от члена предложения и пропускает запятую.',
    sourceAlignment: {
      exam: 'EGE_RU_2025',
      fipiLine: 18,
      topic: 'Вводные слова и конструкции',
    },
    solutionSteps: [
      'Найди слова, выражающие отношение говорящего.',
      'Проверь, являются ли они членами предложения.',
      'Обособь вводную конструкцию.',
    ],
  },
  {
    seedKey: 'ege14-two-separated',
    type: 'multiple_choice',
    category: 'orthography',
    difficulty: 2,
    skillTags: ['ege.14', 'orthography.compound_spelling', 'context.transfer'],
    prompt: 'Найди строку, где оба сочетания пишутся раздельно.',
    payload: {
      options: [
        'говорить напрямую с директором; выйти на прямую дорогу',
        'посмотреть вдаль; исчезнуть в дали тумана',
        'сделать по моему совету; идти по моему следу',
      ],
    },
    answer: { correctOptionIndex: 2 },
    explanation:
      'В обоих случаях есть предлог "по" и местоимение "моему" при существительном: "по моему совету", "по моему следу". Поэтому пишем раздельно. Наречие "по-моему" пишется через дефис, но здесь его нет.',
    typicalMistake:
      'Ученик путает наречие "по-моему" и сочетание предлога с местоимением.',
    sourceAlignment: {
      exam: 'EGE_RU_2025',
      fipiLine: 14,
      topic: 'Дефисное и раздельное написание омонимичных форм',
    },
    solutionSteps: [
      'Проверь, есть ли после "моему" существительное.',
      'Если существительное есть, это предлог с местоимением.',
      'Если слово отвечает на вопрос "как?" и не имеет существительного, возможно наречие через дефис.',
    ],
  },
  {
    seedKey: 'ege21-ssp-sun',
    type: 'punctuation_insert',
    category: 'punctuation',
    difficulty: 2,
    skillTags: ['ege.21', 'punctuation.complex_sentence', 'syntax.grammar_bases'],
    prompt: 'Поставь запятую между частями сложного предложения.',
    payload: {
      tokens: ['Солнце', 'скрылось', 'и', 'в', 'комнате', 'стало', 'тихо'],
      allowedMarks: [','],
    },
    answer: {
      marks: [{ afterTokenIndex: 1, mark: ',' }],
    },
    explanation:
      'Здесь две грамматические основы: "солнце скрылось" и "стало тихо". Части сложносочинённого предложения соединены союзом "и", поэтому между ними нужна запятая.',
    typicalMistake:
      'Ученик видит союз "и", но не проверяет, соединяет ли он однородные члены или части сложного предложения.',
    sourceAlignment: {
      exam: 'EGE_RU_2025',
      fipiLine: 21,
      topic: 'Пунктуационный анализ сложного предложения',
    },
    solutionSteps: [
      'Найди грамматические основы.',
      'Определи, что союз соединяет части сложного предложения.',
      'Поставь запятую между частями.',
    ],
  },
  {
    seedKey: 'ege15-zharenaya',
    type: 'fill_blank',
    category: 'orthography',
    difficulty: 2,
    skillTags: ['ege.15', 'orthography.n_nn', 'morphology.participle'],
    prompt: 'Вставь Н или НН. Обрати внимание на зависимое слово.',
    payload: {
      before: 'жаре',
      after: 'ая на масле рыба',
      placeholderLabel: 'н/нн',
    },
    answer: { accepted: ['нн'], caseSensitive: false },
    explanation:
      'Есть зависимое слово "на масле", значит это причастие с зависимым словом. В полных причастиях с зависимыми словами пишется НН: жаренная на масле рыба.',
    typicalMistake:
      'Ученик не замечает зависимое слово и пишет одну Н по аналогии с прилагательным.',
    sourceAlignment: {
      exam: 'EGE_RU_2025',
      fipiLine: 15,
      topic: 'Н и НН в разных частях речи',
    },
    solutionSteps: [
      'Найди зависимое слово.',
      'Определи, что перед тобой причастие.',
      'Примени правило о НН в причастиях с зависимыми словами.',
    ],
  },
  {
    seedKey: 'ege14-naschet',
    type: 'multiple_choice',
    category: 'orthography',
    difficulty: 1,
    skillTags: ['ege.14', 'orthography.preposition_noun', 'context.homonymy'],
    prompt: 'Выбери предложение, где нужно слитное написание.',
    payload: {
      options: [
        'Мы договорились насчёт встречи.',
        'Деньги поступили на счёт школы.',
        'Ошибка попала на счёт невнимательности ученика.',
      ],
    },
    answer: { correctOptionIndex: 0 },
    explanation:
      '"Насчёт" в значении "о, относительно" - производный предлог и пишется слитно. "На счёт" с существительным "счёт" пишется раздельно.',
    typicalMistake:
      'Ученик не различает производный предлог и сочетание предлога с существительным.',
    sourceAlignment: {
      exam: 'EGE_RU_2025',
      fipiLine: 14,
      topic: 'Производные предлоги и омонимичные сочетания',
    },
    solutionSteps: [
      'Проверь значение: можно ли заменить на "о".',
      'Если речь о банковском или ином счёте, пишем раздельно.',
      'Если это производный предлог, пишем слитно.',
    ],
  },
  {
    seedKey: 'ege14-vsledstvie',
    type: 'multiple_choice',
    category: 'orthography',
    difficulty: 2,
    skillTags: ['ege.14', 'orthography.derived_prepositions', 'context.transfer'],
    prompt: 'Найди строку, где оба выделенных сочетания пишутся слитно.',
    payload: {
      options: [
        'вследствие болезни; ввиду непогоды',
        'в следствии по делу; в виду города',
        'в течение урока; в продолжение дня',
      ],
    },
    answer: { correctOptionIndex: 0 },
    explanation:
      '"Вследствие" и "ввиду" в этих контекстах - производные предлоги со значением причины, поэтому пишутся слитно. Во второй строке есть существительные, в третьей производные предлоги пишутся раздельно.',
    typicalMistake:
      'Ученик узнаёт похожую форму, но не проверяет значение причины и часть речи.',
    sourceAlignment: {
      exam: 'EGE_RU_2025',
      fipiLine: 14,
      topic: 'Производные предлоги',
    },
    solutionSteps: [
      'Определи значение причины.',
      'Проверь, не является ли слово существительным с предлогом.',
      'Сравни написание производных предлогов.',
    ],
  },
  {
    seedKey: 'ege12-kleyat',
    type: 'fill_blank',
    category: 'orthography',
    difficulty: 1,
    skillTags: ['ege.12', 'orthography.verb_endings', 'morphology.conjugation'],
    prompt: 'Вставь пропущенную букву в личном окончании глагола.',
    payload: {
      before: 'Они кле',
      after: 'т афиши.',
      placeholderLabel: 'я/ю',
    },
    answer: { accepted: ['я'], caseSensitive: false },
    explanation:
      'Начальная форма - "клеить", это глагол II спряжения. В форме 3-го лица множественного числа пишем: они клеят.',
    typicalMistake:
      'Ученик пишет окончание по звучанию, не восстанавливая инфинитив.',
    sourceAlignment: {
      exam: 'EGE_RU_2025',
      fipiLine: 12,
      topic: 'Личные окончания глаголов',
    },
    solutionSteps: [
      'Поставь глагол в инфинитив: клеить.',
      'Определи спряжение.',
      'Выбери окончание: клеят.',
    ],
  },
  {
    seedKey: 'ege12-vidimy',
    type: 'fill_blank',
    category: 'orthography',
    difficulty: 2,
    skillTags: ['ege.12', 'orthography.participle_suffixes', 'morphology.participle'],
    prompt: 'Вставь пропущенную букву в суффиксе причастия.',
    payload: {
      before: 'вид',
      after: 'мый издалека дом',
      placeholderLabel: 'и/е',
    },
    answer: { accepted: ['и'], caseSensitive: false },
    explanation:
      'Причастие образовано от глагола II спряжения "видеть", поэтому пишем суффикс -им-: видимый издалека дом.',
    typicalMistake:
      'Ученик не связывает суффикс причастия со спряжением исходного глагола.',
    sourceAlignment: {
      exam: 'EGE_RU_2025',
      fipiLine: 12,
      topic: 'Суффиксы причастий',
    },
    solutionSteps: [
      'Найди исходный глагол: видеть.',
      'Определи спряжение.',
      'Выбери суффикс причастия.',
    ],
  },
  {
    seedKey: 'ege13-nevzglyadya',
    type: 'multiple_choice',
    category: 'orthography',
    difficulty: 1,
    skillTags: ['ege.13', 'orthography.ne_ni', 'context.meaning'],
    prompt: 'Выбери предложение, где НЕ пишется слитно.',
    payload: {
      options: [
        'Он говорил, не глядя в тетрадь.',
        'Несмотря на дождь, экскурсия состоялась.',
        'Работа была не проверена учителем.',
      ],
    },
    answer: { correctOptionIndex: 1 },
    explanation:
      '"Несмотря на" в значении уступки - производный предлог и пишется слитно. В первом предложении "не глядя" - деепричастие с НЕ раздельно.',
    typicalMistake:
      'Ученик не различает деепричастие и производный предлог.',
    sourceAlignment: {
      exam: 'EGE_RU_2025',
      fipiLine: 13,
      topic: 'Правописание НЕ с разными частями речи',
    },
    solutionSteps: [
      'Определи часть речи или устойчивую конструкцию.',
      'Проверь значение уступки.',
      'Сравни с деепричастием, которое сохраняет действие.',
    ],
  },
  {
    seedKey: 'ege13-ni-kto',
    type: 'fill_blank',
    category: 'orthography',
    difficulty: 2,
    skillTags: ['ege.13', 'orthography.ne_ni', 'pronouns.negative'],
    prompt: 'Вставь Е или И в отрицательное местоимение.',
    payload: {
      before: 'Н',
      after: 'кто не ответил на вопрос.',
      placeholderLabel: 'е/и',
    },
    answer: { accepted: ['и'], caseSensitive: false },
    explanation:
      'В безударной приставке отрицательного местоимения пишется НИ: никто. Под ударением пишется НЕ: некто.',
    typicalMistake:
      'Ученик не учитывает ударение в отрицательных местоимениях.',
    sourceAlignment: {
      exam: 'EGE_RU_2025',
      fipiLine: 13,
      topic: 'НЕ и НИ в отрицательных местоимениях',
    },
    solutionSteps: [
      'Проверь, падает ли ударение на приставку.',
      'Без ударения выбирай НИ.',
      'Под ударением выбирай НЕ.',
    ],
  },
  {
    seedKey: 'ege18-odnako',
    type: 'punctuation_insert',
    category: 'punctuation',
    difficulty: 2,
    skillTags: ['ege.18', 'punctuation.introductory_words', 'syntax.contrast'],
    prompt: 'Поставь запятую, если слово "однако" выступает вводным или присоединительным элементом.',
    payload: {
      tokens: ['Мы', 'устали', 'однако', 'продолжили', 'путь'],
      allowedMarks: [','],
    },
    answer: {
      marks: [{ afterTokenIndex: 1, mark: ',' }],
    },
    explanation:
      'В этом предложении "однако" близко по значению к противительному союзу "но" и соединяет части высказывания: "Мы устали, однако продолжили путь". Запятая ставится перед "однако".',
    typicalMistake:
      'Ученик автоматически выделяет "однако" с двух сторон или не ставит знак перед ним.',
    sourceAlignment: {
      exam: 'EGE_RU_2025',
      fipiLine: 18,
      topic: 'Слова и конструкции, грамматически не связанные с членами предложения',
    },
    solutionSteps: [
      'Определи значение слова "однако".',
      'Проверь, соединяет ли оно части высказывания.',
      'Поставь знак перед присоединительным элементом.',
    ],
  },
  {
    seedKey: 'ege18-obrashchenie',
    type: 'punctuation_insert',
    category: 'punctuation',
    difficulty: 1,
    skillTags: ['ege.18', 'punctuation.address'],
    prompt: 'Поставь запятую при обращении.',
    payload: {
      tokens: ['Ребята', 'откройте', 'тетради'],
      allowedMarks: [','],
    },
    answer: {
      marks: [{ afterTokenIndex: 0, mark: ',' }],
    },
    explanation:
      '"Ребята" - обращение, оно называет адресата речи и не является членом предложения. Обращение отделяется запятой.',
    typicalMistake:
      'Ученик принимает обращение за подлежащее и не ставит запятую.',
    sourceAlignment: {
      exam: 'EGE_RU_2025',
      fipiLine: 18,
      topic: 'Обращения',
    },
    solutionSteps: [
      'Найди слово, называющее адресата речи.',
      'Проверь, является ли оно членом предложения.',
      'Отдели обращение запятой.',
    ],
  },
  {
    seedKey: 'ege17-deeprichastny-oborot',
    type: 'punctuation_insert',
    category: 'punctuation',
    difficulty: 1,
    skillTags: ['ege.17', 'punctuation.detached_adverbial', 'syntax.participial_phrases'],
    prompt: 'Поставь запятую при деепричастном обороте.',
    payload: {
      tokens: ['Закончив', 'работу', 'мы', 'вышли', 'из', 'класса'],
      allowedMarks: [','],
    },
    answer: {
      marks: [{ afterTokenIndex: 1, mark: ',' }],
    },
    explanation:
      '"Закончив работу" - деепричастный оборот. Он обозначает добавочное действие и обособляется запятой.',
    typicalMistake:
      'Ученик видит короткое начало предложения и не выделяет деепричастный оборот.',
    sourceAlignment: {
      exam: 'EGE_RU_2025',
      fipiLine: 17,
      topic: 'Обособленные обстоятельства',
    },
    solutionSteps: [
      'Найди деепричастие.',
      'Определи границы оборота.',
      'Поставь запятую после оборота.',
    ],
  },
  {
    seedKey: 'ege21-spp-kogda',
    type: 'punctuation_insert',
    category: 'punctuation',
    difficulty: 2,
    skillTags: ['ege.21', 'punctuation.complex_sentence', 'syntax.subordinate_clause'],
    prompt: 'Поставь запятую между главным и придаточным предложением.',
    payload: {
      tokens: ['Когда', 'начался', 'урок', 'в', 'классе', 'стало', 'тихо'],
      allowedMarks: [','],
    },
    answer: {
      marks: [{ afterTokenIndex: 2, mark: ',' }],
    },
    explanation:
      'Придаточная часть "Когда начался урок" стоит перед главной частью "в классе стало тихо". Между частями сложноподчинённого предложения ставится запятая.',
    typicalMistake:
      'Ученик не видит границу придаточной части, если она стоит в начале предложения.',
    sourceAlignment: {
      exam: 'EGE_RU_2025',
      fipiLine: 21,
      topic: 'Пунктуация в сложноподчинённом предложении',
    },
    solutionSteps: [
      'Найди союзное слово или союз.',
      'Определи границу придаточной части.',
      'Поставь запятую между частями.',
    ],
  },
  {
    seedKey: 'ege11-suffix-liv',
    type: 'fill_blank',
    category: 'orthography',
    difficulty: 1,
    skillTags: ['ege.11', 'orthography.suffixes', 'morphology.adjective_suffix'],
    prompt: 'Вставь пропущенную букву в суффиксе прилагательного.',
    payload: {
      before: 'заботл',
      after: 'вый человек',
      placeholderLabel: 'и/е',
    },
    answer: { accepted: ['и'], caseSensitive: false },
    explanation:
      'В суффиксах прилагательных -лив- и -чив- пишется И: заботливый, доверчивый.',
    typicalMistake:
      'Ученик не узнаёт суффикс -лив-/-чив- и выбирает букву на слух.',
    sourceAlignment: {
      exam: 'EGE_RU_2025',
      fipiLine: 11,
      topic: 'Правописание суффиксов',
    },
    solutionSteps: [
      'Выдели суффикс.',
      'Проверь, относится ли он к группе -чив-/-лив-.',
      'Запиши букву И.',
    ],
  },
  {
    seedKey: 'ege10-prefix-razyskat',
    type: 'fill_blank',
    category: 'orthography',
    difficulty: 2,
    skillTags: ['ege.10', 'orthography.prefixes', 'orthography.y_i_after_prefix'],
    prompt: 'Вставь Ы или И после приставки.',
    payload: {
      before: 'раз',
      after: 'скать документы',
      placeholderLabel: 'ы/и',
    },
    answer: { accepted: ['ы'], caseSensitive: false },
    explanation:
      'После русской приставки на согласный корневое И обычно заменяется на Ы: искать -> разыскать.',
    typicalMistake:
      'Ученик сохраняет И после приставки и не учитывает правило Ы/И после приставок.',
    sourceAlignment: {
      exam: 'EGE_RU_2025',
      fipiLine: 10,
      topic: 'Буквы Ы/И после приставок',
    },
    solutionSteps: [
      'Найди приставку.',
      'Проверь, заканчивается ли она на согласный.',
      'Примени правило Ы/И после приставки.',
    ],
  },
  {
    seedKey: 'ege21-bsp-colon',
    type: 'punctuation_insert',
    category: 'punctuation',
    difficulty: 2,
    skillTags: ['ege.21', 'punctuation.bsp', 'syntax.semantic_relations'],
    prompt: 'Поставь двоеточие в бессоюзном сложном предложении.',
    payload: {
      tokens: ['Я', 'понял', 'ошибка', 'была', 'в', 'первом', 'слове'],
      allowedMarks: [':'],
    },
    answer: {
      marks: [{ afterTokenIndex: 1, mark: ':' }],
    },
    explanation:
      'Вторая часть раскрывает содержание первой: что именно понял? Ошибка была в первом слове. Между частями бессоюзного сложного предложения ставится двоеточие.',
    typicalMistake:
      'Ученик ставит запятую вместо двоеточия, не анализируя смысловые отношения частей.',
    sourceAlignment: {
      exam: 'EGE_RU_2025',
      fipiLine: 21,
      topic: 'Пунктуация в бессоюзном сложном предложении',
    },
    solutionSteps: [
      'Найди две грамматические основы.',
      'Определи смысл: вторая часть раскрывает первую.',
      'Поставь двоеточие.',
    ],
  },
];

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL is required to seed exercises.');
  process.exit(1);
}

const sql = postgres(connectionString);

function assertValidExercise(exercise) {
  if (!exercise.seedKey || !exercise.prompt || !exercise.explanation) {
    throw new Error(`Exercise ${exercise.seedKey ?? '<missing>'} is incomplete.`);
  }

  if (!exercise.sourceAlignment || !exercise.typicalMistake || !exercise.solutionSteps) {
    throw new Error(`Exercise ${exercise.seedKey} is missing compliance metadata.`);
  }

  if (![1, 2].includes(exercise.difficulty)) {
    throw new Error(`Exercise ${exercise.seedKey} has invalid difficulty.`);
  }

  if (exercise.type === 'multiple_choice') {
    const options = exercise.payload?.options ?? [];
    const index = exercise.answer?.correctOptionIndex;
    if (!Array.isArray(options) || options.length < 2 || index < 0 || index >= options.length) {
      throw new Error(`Exercise ${exercise.seedKey} has invalid multiple-choice answer.`);
    }
  }

  if (exercise.type === 'fill_blank') {
    if (!exercise.answer?.accepted?.length) {
      throw new Error(`Exercise ${exercise.seedKey} has no accepted fill-blank answers.`);
    }
  }

  if (exercise.type === 'punctuation_insert') {
    const tokenCount = exercise.payload?.tokens?.length ?? 0;
    for (const mark of exercise.answer?.marks ?? []) {
      if (mark.afterTokenIndex < 0 || mark.afterTokenIndex >= tokenCount - 1) {
        throw new Error(`Exercise ${exercise.seedKey} has invalid punctuation index.`);
      }
    }
  }
}

try {
  await sql`alter table exercises add column if not exists seed_key text`;
  await sql`
    create unique index if not exists exercises_seed_key_unique
    on exercises(seed_key)
  `;

  for (const exercise of exercises) {
    assertValidExercise(exercise);

    const visualHint = {
      sourceAlignment: exercise.sourceAlignment,
      typicalMistake: exercise.typicalMistake,
      solutionSteps: exercise.solutionSteps,
    };

    await sql`
      insert into exercises
        (
          seed_key,
          type,
          category,
          difficulty,
          skill_tags,
          prompt,
          payload,
          answer,
          explanation,
          source_alignment,
          typical_mistake,
          algorithm_steps,
          quality_status,
          visual_hint,
          is_active
        )
      values
        (
          ${exercise.seedKey},
          ${exercise.type},
          ${exercise.category},
          ${exercise.difficulty},
          ${exercise.skillTags},
          ${exercise.prompt},
          ${sql.json(exercise.payload)},
          ${sql.json(exercise.answer)},
          ${exercise.explanation},
          ${sql.json(exercise.sourceAlignment)},
          ${exercise.typicalMistake},
          ${sql.json(
            exercise.solutionSteps.map((title, index) => ({
              id: `seed_${index + 1}`,
              title,
              required: true,
            })),
          )},
          ${'approved'},
          ${sql.json(visualHint)},
          true
        )
      on conflict (seed_key) do update set
        type = excluded.type,
        category = excluded.category,
        difficulty = excluded.difficulty,
        skill_tags = excluded.skill_tags,
        prompt = excluded.prompt,
        payload = excluded.payload,
        answer = excluded.answer,
        explanation = excluded.explanation,
        source_alignment = excluded.source_alignment,
        typical_mistake = excluded.typical_mistake,
        algorithm_steps = excluded.algorithm_steps,
        quality_status = excluded.quality_status,
        visual_hint = excluded.visual_hint,
        is_active = excluded.is_active,
        updated_at = now()
    `;
  }

  await sql`
    update exercises
    set is_active = false, updated_at = now()
    where seed_key is null
  `;

  console.log(`Upserted ${exercises.length} exercises.`);
} finally {
  await sql.end();
}
