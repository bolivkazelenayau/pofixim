# Формат `punctuation_constructor` на примере задания 4656

Этот документ описывает полный формат интерактивного задания `punctuation_constructor`, чтобы по нему можно было собрать похожие задания из `ege_63_error_examples.md`.

## Запись в `exercises`

| Поле | Значение |
|---|---|
| `id` | `4656` |
| `seed_key` | `md-63-62-punctuation-constructor-direct-speech` |
| `type` | `punctuation_constructor` |
| `category` | `punctuation` |
| `difficulty` | `1` |
| `quality_status` | `draft` |
| `is_active` | `true` |
| `transfer_group` | `direct_speech_constructor` |

## Формулировка

```txt
Расставьте знаки препинания в предложении с прямой речью.
```

## Skill tags

```json
[
  "punctuation.constructor",
  "direct_speech",
  "ege.21"
]
```

## Payload

`payload` описывает то, что видит ученик: токены предложения, банк знаков, подсказки, пошаговый режим и структурную разметку.

```json
{
  "tokens": ["Мне", "сказали", "Ждите", "приедет", "другой", "замерщик"],
  "markBank": [
    "period",
    "comma",
    "semicolon",
    "colon",
    "question",
    "exclamation",
    "quote_open",
    "quote_close",
    "paren_open",
    "paren_close",
    "dash",
    "ellipsis"
  ],
  "hints": [
    "В предложении есть прямая речь.",
    "После слов автора перед прямой речью нужен знак.",
    "Проверь знаки после слова «сказали» и в конце предложения.",
    "В двух слотах должно быть по два знака подряд."
  ],
  "guidedSteps": [
    {
      "id": "author_words",
      "title": "Где заканчиваются слова автора?",
      "slotIndex": 2,
      "marks": ["colon"]
    },
    {
      "id": "open_quote",
      "title": "Где начинается прямая речь?",
      "slotIndex": 2,
      "marks": ["quote_open"]
    },
    {
      "id": "inside_comma",
      "title": "Нужна ли запятая внутри реплики?",
      "slotIndex": 3,
      "marks": ["comma"]
    },
    {
      "id": "close_quote",
      "title": "Где заканчивается прямая речь?",
      "slotIndex": 6,
      "marks": ["quote_close", "period"]
    }
  ],
  "segments": [
    {
      "label": "Слова автора",
      "tokenStart": 0,
      "tokenEnd": 1,
      "kind": "author_words"
    },
    {
      "label": "Прямая речь",
      "tokenStart": 2,
      "tokenEnd": 5,
      "kind": "direct_speech"
    }
  ]
}
```

## Answer

`answer` содержит правильную расстановку знаков и обучающий разбор по слотам.

```json
{
  "placements": [
    { "slotIndex": 2, "mark": "colon" },
    { "slotIndex": 2, "mark": "quote_open" },
    { "slotIndex": 3, "mark": "comma" },
    { "slotIndex": 6, "mark": "quote_close" },
    { "slotIndex": 6, "mark": "period" }
  ],
  "slotExplanations": [
    {
      "slotIndex": 2,
      "marks": ["colon", "quote_open"],
      "text": "После слов автора ставится двоеточие, затем открываются кавычки."
    },
    {
      "slotIndex": 3,
      "marks": ["comma"],
      "text": "Внутри реплики между частями нужна запятая."
    },
    {
      "slotIndex": 6,
      "marks": ["quote_close", "period"],
      "text": "Кавычки закрываются перед финальной точкой."
    }
  ]
}
```

## Как считается `slotIndex`

`slotIndex` — это позиция для знака относительно токенов:

- `0` — перед первым токеном;
- `1` — после первого токена;
- `2` — после второго токена;
- `N` — после последнего токена, где `N = tokens.length`.

Для задания 4656:

```txt
0:Мне | 1:сказали | 2:Ждите | 3:приедет | 4:другой | 5:замерщик
```

Правильная сборка:

```txt
Мне сказали: «Ждите, приедет другой замерщик».
```

Расстановка по слотам:

- `slotIndex: 2` — после слова `сказали`: `:` и `«`;
- `slotIndex: 3` — после слова `Ждите`: `,`;
- `slotIndex: 6` — после слова `замерщик`: `»` и `.`;
- порядок знаков внутри одного слота важен.

## Explanation

```txt
Слова другого человека оформляются как прямая речь: после слов автора ставится двоеточие, сама реплика заключается в кавычки.
```

## Typical mistake

```txt
Прямая речь записана без двоеточия и кавычек.
```

## Algorithm steps

```json
[
  {
    "id": "author_words",
    "title": "Найти слова автора",
    "required": true
  },
  {
    "id": "direct_speech",
    "title": "Определить границы прямой речи",
    "required": true
  },
  {
    "id": "punctuation",
    "title": "Поставить двоеточие, кавычки и запятую внутри реплики",
    "required": true
  }
]
```

## Source alignment

```json
{
  "source": "ege_63_error_examples.md",
  "item": 62
}
```

## Доступные `mark id`

| mark id | Символ |
|---|---|
| `period` | `.` |
| `comma` | `,` |
| `semicolon` | `;` |
| `colon` | `:` |
| `question` | `?` |
| `exclamation` | `!` |
| `quote_open` | `«` |
| `quote_close` | `»` |
| `paren_open` | `(` |
| `paren_close` | `)` |
| `dash` | `—` |
| `ellipsis` | `...` |

## Админский текстовый формат

### Токены предложения

```txt
Мне | сказали | Ждите | приедет | другой | замерщик
```

### Банк знаков

```txt
period, comma, semicolon, colon, question, exclamation, quote_open, quote_close, paren_open, paren_close, dash, ellipsis
```

### Подсказки

```txt
В предложении есть прямая речь.
После слов автора перед прямой речью нужен знак.
Проверь знаки после слова «сказали» и в конце предложения.
В двух слотах должно быть по два знака подряд.
```

### Пошаговый режим

Формат строки:

```txt
id | title | slotIndex | mark1, mark2
```

Пример:

```txt
author_words | Где заканчиваются слова автора? | 2 | colon
open_quote | Где начинается прямая речь? | 2 | quote_open
inside_comma | Нужна ли запятая внутри реплики? | 3 | comma
close_quote | Где заканчивается прямая речь? | 6 | quote_close, period
```

### Правильные слоты

Формат:

```txt
slotIndex:mark
```

Пример:

```txt
2:colon, 2:quote_open, 3:comma, 6:quote_close, 6:period
```

### Разбор слотов

Формат строки:

```txt
slotIndex | mark1, mark2 | explanation text
```

Пример:

```txt
2 | colon, quote_open | После слов автора ставится двоеточие, затем открываются кавычки.
3 | comma | Внутри реплики между частями нужна запятая.
6 | quote_close, period | Кавычки закрываются перед финальной точкой.
```

### Структура

Формат строки:

```txt
label | tokenStart | tokenEnd | kind
```

Пример:

```txt
Слова автора | 0 | 1 | author_words
Прямая речь | 2 | 5 | direct_speech
```

## Шаблон для генерации новых заданий

```json
{
  "seedKey": "md-63-N-punctuation-constructor-...",
  "type": "punctuation_constructor",
  "category": "punctuation",
  "difficulty": 1,
  "skillTags": ["punctuation.constructor"],
  "prompt": "Расставьте знаки препинания в предложении.",
  "payload": {
    "tokens": ["..."],
    "markBank": [
      "period",
      "comma",
      "semicolon",
      "colon",
      "question",
      "exclamation",
      "quote_open",
      "quote_close",
      "paren_open",
      "paren_close",
      "dash",
      "ellipsis"
    ],
    "hints": ["..."],
    "guidedSteps": [
      {
        "id": "step_1",
        "title": "...",
        "slotIndex": 1,
        "marks": ["comma"]
      }
    ],
    "segments": [
      {
        "label": "...",
        "tokenStart": 0,
        "tokenEnd": 1,
        "kind": "other"
      }
    ]
  },
  "answer": {
    "placements": [
      {
        "slotIndex": 1,
        "mark": "comma"
      }
    ],
    "slotExplanations": [
      {
        "slotIndex": 1,
        "marks": ["comma"],
        "text": "..."
      }
    ]
  },
  "explanation": "...",
  "typicalMistake": "...",
  "algorithmSteps": [
    {
      "id": "step_1",
      "title": "...",
      "required": true
    }
  ],
  "sourceAlignment": {
    "source": "ege_63_error_examples.md",
    "item": "N"
  },
  "transferGroup": "...",
  "qualityStatus": "draft",
  "isActive": true
}
```

## Правила генерации

- Не добавлять в `tokens` знаки препинания, которые ученик должен поставить сам.
- Если упражнение не умеет менять регистр, нужный регистр должен быть уже в `tokens`.
- Например, для прямой речи токен должен быть `Ждите`, а не `ждите`, если в правильном ответе реплика начинается с заглавной буквы.
- Парные знаки задаются модульно: `quote_open` и `quote_close`, `paren_open` и `paren_close`.
- В один слот можно положить несколько знаков.
- Порядок знаков внутри одного слота важен.
- Если возможны альтернативные правильные варианты, текущая схема их пока не поддерживает: нужно выбрать один эталонный вариант или расширять модель отдельно.
