# TREASURES: Полезные ресурсы и библиотеки

## Core Технологии
- [Next.js](https://nextjs.org/) - Основной фреймворк для реализации SSR и API.
- [Bun](https://bun.sh/) - Пакетный менеджер и рантайм. Быстрее npm, идеален для старта новых проектов.
- **Базы данных (для селф-хоста в Dokploy):**
  - **PostgreSQL** - Стандартная реляционная БД, поднимается в Dokploy за 1 минуту. Идеальна для связки с Drizzle ORM.
  - **MongoDB** - NoSQL БД, также нативно поддерживается в Dokploy.
  - [SQLite](https://sqlite.org/index.html) - Файловая БД для самого легкого старта (требует настройки Volume).
  - [Sanity](https://www.sanity.io/) - Легкая облачная Headless CMS (остается как вариант, если нужна готовая админка для редакторов контента).

## ORM (Работа с БД)
- [Drizzle ORM](https://orm.drizzle.team/) - Легковесная, быстрая и типобезопасная ORM для TypeScript.
- [Prisma](https://www.prisma.io/) - Более мощная альтернатива с отличным Developer Experience.

## UI, Анимации и UX
- [Framer Motion](https://www.framer.com/motion/) - Библиотека для создания плавных анимаций (вылет сообщений чата, эффекты "набора текста", тряска при неверном ответе).
- [Tailwind CSS](https://tailwindcss.com/) - Для быстрой стилизации компонентов.
- [shadcn/ui](https://ui.shadcn.com/) - Набор готовых, доступных (accessible) компонентов, которые вы можете скопировать в проект и полностью кастомизировать.

## Валидация и Стейт
- [Zod](https://zod.dev/) - Валидация схем данных (защита от неконсистентных данных из API/БД).
- [Zustand](https://docs.pmnd.rs/zustand/getting-started/introduction) - Крошечный, быстрый менеджер состояний для React (идеален для хранения прогресса пользователя, счета и серии правильных ответов).

## Вдохновение для Чат-UI
- [React Chatbot Kit](https://fredrikoseberg.github.io/react-chatbot-kit-docs/) - Готовый набор для создания чатботов на React. Можно подсмотреть структуру компонентов или использовать как базу.
