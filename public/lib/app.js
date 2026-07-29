(function () {
  'use strict';

  const seedInput = document.getElementById('seedInput');
  const btnGenerate = document.getElementById('btnGenerate');
  const btnPaint = document.getElementById('btnPaint');
  const btnSave = document.getElementById('btnSave');
  const statusLine = document.getElementById('statusLine');
  const inventoryNumber = document.getElementById('inventoryNumber');
  const legendList = document.getElementById('legendList');
  const craquelureOverlay = document.getElementById('craquelureOverlay');
  const canvas = document.getElementById('canvas');

  const engine = new OilEngine(canvas);
  const audio = new BrushAudio();

  let isPainting = false;
  let currentSeed = null;

  engine.paintImprimatura();
  buildLegendSkeleton();

  window.addEventListener('resize', () => {
    if (isPainting) return;
    engine.resize();
    engine.paintImprimatura();
  });

  seedInput.addEventListener('input', () => {
    seedInput.value = seedInput.value.replace(/\D/g, '').slice(0, 12);
    btnPaint.disabled = seedInput.value.length !== 12 || isPainting;
  });

  btnGenerate.addEventListener('click', async () => {
    let seed = null;
    if (window.firebaseClient && window.firebaseClient.isConfigured) {
      await window.firebaseClient.init();
      seed = await window.firebaseClient.generateSeed();
    }
    if (!seed) seed = HouseMatrix.generateSeed();
    seedInput.value = seed;
    btnPaint.disabled = isPainting;
  });

  btnPaint.addEventListener('click', () => {
    if (isPainting || seedInput.value.length !== 12) return;
    runGeneration(seedInput.value);
  });

  btnSave.addEventListener('click', async () => {
    if (!currentSeed) return;
    try {
      statusLine.textContent = 'Сохраняем в галерею…';
      await window.firebaseClient.savePainting(currentSeed);
      statusLine.textContent = 'Картина сохранена в вашей галерее.';
    } catch (err) {
      statusLine.textContent = 'Не удалось сохранить: ' + err.message;
    }
  });

  function buildLegendSkeleton() {
    legendList.innerHTML = '';
    HouseMatrix.HOUSES.forEach((house) => {
      const li = document.createElement('li');
      li.className = 'legend__item';
      li.id = `legend-step-${house.id}`;
      li.innerHTML = `
        <span class="legend__step">${house.id}</span>
        <span class="legend__house">${house.name}</span>
        <span class="legend__theme">— ожидает мазка —</span>
      `;
      legendList.appendChild(li);
    });
  }

  async function runGeneration(seed) {
    let entries;
    try {
      entries = HouseMatrix.parseSeed(seed);
    } catch (err) {
      statusLine.textContent = err.message;
      return;
    }

    isPainting = true;
    currentSeed = seed;
    btnPaint.disabled = true;
    btnGenerate.disabled = true;
    btnSave.disabled = true;
    craquelureOverlay.classList.remove('is-visible');
    inventoryNumber.textContent = `№ ${seed} · Светопись Домов · холст, масло (симуляция)`;
    buildLegendSkeleton();

    engine.resize();
    engine.paintImprimatura();

    for (const entry of entries) {
      statusLine.textContent = `Дом ${entry.house.id} — ${entry.house.name}: наносится тема «${entry.theme.title}»`;
      updateLegendItem(entry, 'active');
      audio.playStroke();
      await engine.paintStep(entry);
      updateLegendItem(entry, 'done');
    }

    statusLine.textContent = 'Финальное лакирование…';
    await engine.varnish();
    craquelureOverlay.classList.add('is-visible');
    statusLine.textContent = 'Картина завершена и высохла.';

    isPainting = false;
    btnGenerate.disabled = false;
    btnPaint.disabled = false;
    btnSave.disabled = !(window.firebaseClient && window.firebaseClient.ready);
  }

  function updateLegendItem(entry, state) {
    const li = document.getElementById(`legend-step-${entry.house.id}`);
    if (!li) return;
    li.classList.remove('is-active', 'is-done');
    li.classList.add(state === 'active' ? 'is-active' : 'is-done');
    const themeSpan = li.querySelector('.legend__theme');
    themeSpan.textContent = `${entry.digit} → ${entry.theme.title}`;
  }

  (async function initFirebase() {
    if (window.firebaseClient && window.firebaseClient.isConfigured) {
      const ok = await window.firebaseClient.init();
      if (ok) {
        statusLine.textContent = 'Firebase подключен: доступна генерация и сохранение в галерею.';
      }
    }
  })();
})();
