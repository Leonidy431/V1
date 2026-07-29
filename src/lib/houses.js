/**
 * Семантическая матрица «Светопись Домов» (браузерная копия).
 * Идентична functions/houses.js — при изменении семантики обновляйте оба файла.
 */
(function (global) {
  'use strict';

  const HOUSES = [
    { id: 1, name: 'Личность / Эго', zone: 'Центр композиции, первый план', box: { x: 0.30, y: 0.28, w: 0.40, h: 0.44 }, description: 'Доминанта, главный образ, фокальная точка холста.' },
    { id: 2, name: 'Ресурсы / Привычки', zone: 'Нижняя треть холста, земная опора', box: { x: 0.10, y: 0.72, w: 0.80, h: 0.24 }, description: 'База, материальный мир, укоренённость.' },
    { id: 3, name: 'Окружение / Контакты', zone: 'Средний план, левая часть', box: { x: 0.02, y: 0.34, w: 0.30, h: 0.36 }, description: 'Связи, ближний круг, переходы.' },
    { id: 4, name: 'Дом / Корни / Истоки', zone: 'Нижний левый угол', box: { x: 0.00, y: 0.66, w: 0.28, h: 0.30 }, description: 'Тьма, глубина холста, подсознание, фундамент.' },
    { id: 5, name: 'Творчество / Дети / Азарт', zone: 'Центральный правый план', box: { x: 0.58, y: 0.30, w: 0.34, h: 0.36 }, description: 'Вспышка цвета, динамическое действие.' },
    { id: 6, name: 'Служение / Работа / Здоровье', zone: 'Нижний правый сектор', box: { x: 0.62, y: 0.68, w: 0.36, h: 0.28 }, description: 'Мелкая фактура, ремесло, дисциплина деталей.' },
    { id: 7, name: 'Партнёрство / Отражение', zone: 'Центральная вертикальная ось', box: { x: 0.42, y: 0.10, w: 0.16, h: 0.80 }, description: 'Зеркальная симметрия, диалог образов.' },
    { id: 8, name: 'Трансформация / Тайна', zone: 'Глубокий нижний центр', box: { x: 0.30, y: 0.78, w: 0.40, h: 0.20 }, description: 'Воронки, порталы, смерть-возрождение.' },
    { id: 9, name: 'Философия / Дальние земли', zone: 'Верхний правый план', box: { x: 0.60, y: 0.00, w: 0.38, h: 0.30 }, description: 'Горизонты, дальние миры, странствие духа.' },
    { id: 10, name: 'Призвание / Вершина', zone: 'Верхняя центральная зона', box: { x: 0.30, y: 0.00, w: 0.40, h: 0.22 }, description: 'Шпили, вершины, кульминация судьбы.' },
    { id: 11, name: 'Сообщество / Мечты', zone: 'Верхний левый план', box: { x: 0.00, y: 0.00, w: 0.38, h: 0.30 }, description: 'Созвездия, сети, коллективный сон.' },
    { id: 12, name: 'Тайны / Итог', zone: 'Верхняя треть, уходящая в бесконечность', box: { x: 0.00, y: 0.00, w: 1.00, h: 0.16 }, description: 'Растворение, итог, выход за пределы холста.' }
  ];

  const THEMES = [
    { range: [0, 1], key: 'chaos', title: 'Хаос / Первозданная материя', archetype: 'Фрагменты титанических конструкций, туман.', palette: { under: '#241a12', glaze: '#5b4632', highlight: '#c9b48f' } },
    { range: [2, 3], key: 'communication', title: 'Коммуникация / Письма / Вести', archetype: 'Летящие пергаменты, световые лучи, мосты, вестники.', palette: { under: '#1c2b3a', glaze: '#3f6a8a', highlight: '#e8d9a6' } },
    { range: [4, 5], key: 'love', title: 'Любовь / Притяжение / Эрос', archetype: 'Слияние фактур, неоновое свечение органики, гармония сфер.', palette: { under: '#3a1420', glaze: '#8a2d4a', highlight: '#f2a6c9' } },
    { range: [6, 7], key: 'trial', title: 'Испытание / Металл / Трансформация', archetype: 'Острые кристаллические структуры, изломы, тени.', palette: { under: '#12181c', glaze: '#4a5a63', highlight: '#d7e6ea' } },
    { range: [8, 9], key: 'order', title: 'Высший Порядок / Архитектура духа', archetype: 'Воздушные готические замки, парящие в люминесцентных облаках.', palette: { under: '#1a1430', glaze: '#4b3d8a', highlight: '#e6dcff' } }
  ];

  function themeForDigit(digit) {
    const d = Number(digit);
    return THEMES.find((t) => d >= t.range[0] && d <= t.range[1]);
  }

  function houseForStep(step) {
    return HOUSES[(step - 1) % HOUSES.length];
  }

  function parseSeed(seed) {
    const digits = String(seed).replace(/\D/g, '').split('');
    if (digits.length !== 12) {
      throw new Error('Seed должен содержать ровно 12 цифр');
    }
    return digits.map((digit, index) => {
      const step = index + 1;
      return {
        step,
        digit: Number(digit),
        house: houseForStep(step),
        theme: themeForDigit(digit)
      };
    });
  }

  function generateSeed() {
    let seed = '';
    const arr = new Uint32Array(12);
    if (global.crypto && global.crypto.getRandomValues) {
      global.crypto.getRandomValues(arr);
      for (let i = 0; i < 12; i++) seed += (arr[i] % 10).toString();
    } else {
      for (let i = 0; i < 12; i++) seed += Math.floor(Math.random() * 10).toString();
    }
    return seed;
  }

  global.HouseMatrix = { HOUSES, THEMES, themeForDigit, houseForStep, parseSeed, generateSeed };
})(typeof window !== 'undefined' ? window : globalThis);
