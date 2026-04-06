# React + Appwrite конфигурации

Простой сайт на React, который:

- по маршруту `/` показывает страницу из файла `src/HomePage.js`;
- по маршруту `/:id` делает запрос в базу данных Appwrite и показывает данные конфигурации.

## Логика

- В коллекции `configurations` есть строковое поле `id`, равное части маршрута после `/`.
  - Например, при заходе на `/hello` в БД ищется документ с `id = "hello"`.
- В документе есть поле `settings` (строка с JSON), например:

```json
{
  "name": "",
  "description": ""
}
```

- Страница `/:id`:
  - парсит `settings`;
  - выводит:
    - `<h1>` — `name`;
    - `<h2>` — `description`;
  - устанавливает `document.title = name`.

## Файлы

- `index.html` — HTML-шаблон с корневым `<div id="root">`.
- `vite.config.js` — настройка Vite с плагином React.
- `src/main.jsx` — входная точка React, оборачивает приложение в `BrowserRouter`.
- `src/App.jsx` — описание роутов:
  - `/` → `HomePage`;
  - `/:configId` → `ConfigPage`.
- `src/HomePage.js` — простая главная страница.
- `src/ConfigPage.js` — страница, которая:
  - читает `configId` из URL;
  - запрашивает соответствующую конфигурацию из Appwrite;
  - парсит поле `settings` и показывает `name` и `description`.
- `src/appwriteClient.js` — клиент и вспомогательная функция для работы с Appwrite.

## Настройка Appwrite

В `src/appwriteClient.js` заданы:

- `PROJECT_ID = "69ad52b9002370350eee"`;
- `DATABASE_ID = "69ad534000186b123410"`;
- `COLLECTION_ID = "configurations"`;
- `APPWRITE_ENDPOINT = "https://cloud.appwrite.io/v1"` — при необходимости замените на адрес своего инстанса.

## Как запустить

1. Установите зависимости (из корня папки проекта):

```bash
npm init -y
npm install react react-dom react-router-dom appwrite
npm install -D vite @vitejs/plugin-react
```

2. Убедитесь, что в `package.json` есть скрипты:

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview"
}
```

3. Запустите dev-сервер:

```bash
npm run dev
```

4. Откройте в браузере:

- `http://localhost:5173/` — главная страница (`HomePage.js`);
- `http://localhost:5173/hello` — страница, которая попытается получить документ с `id = "hello"` из коллекции `configurations`.

