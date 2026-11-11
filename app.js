(() => {
  const BASE_URL = 'https://www.comune.roma.it/servizi/mesis-portal-reports-war/loadMenuMese.do';
  const PROXY_URL = 'https://pasti-infanzia.cristian-cardillo-it.workers.dev';
  const MUNICIPIO = '8';
  const CICLO = '4';
  const CACHE_PREFIX = 'pasti-infanzia-menu-mese-v2';
  const CACHE_TTL = 12 * 60 * 60 * 1000;

  const $ = (selector) => document.querySelector(selector);
  const dateInput = $('#date');
  const datePicker = $('#datePicker');
  const datePickerBtn = $('#datePickerBtn');
  const previousDateBtn = $('#previousDateBtn');
  const nextDateBtn = $('#nextDateBtn');
  const btn = $('#btn');
  const loader = $('#loader');
  const errorBox = $('#error');
  const resultCard = $('#resultCard');
  const menuDate = $('#menuDate');
  const menuGrid = $('#menuGrid');
  const overviewBtn = $('#overviewBtn');
  const overviewModes = $('#overviewModes');
  const groupedViewBtn = $('#groupedViewBtn');
  const dailyViewBtn = $('#dailyViewBtn');
  const memoryCache = new Map();
  let currentMonthHtml = '';
  let overviewVisible = false;
  let hasMonthMenu = false;

  function localIsoDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function isoToApiDate(isoDate) {
    const [year, month, day] = isoDate.split('-');
    return `${day}/${month}/${year}`;
  }

  function italianDateToIso(value) {
    const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return null;
    const [, day, month, year] = match;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    if (
      date.getFullYear() !== Number(year) ||
      date.getMonth() !== Number(month) - 1 ||
      date.getDate() !== Number(day)
    ) return null;
    return localIsoDate(date);
  }

  function isoToItalianDate(isoDate) {
    const [year, month, day] = isoDate.split('-');
    return `${day}/${month}/${year}`;
  }

  function dateLabel(isoDate) {
    const [year, month, day] = isoDate.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('it-IT', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }

  function setError(message = '') {
    errorBox.textContent = message;
    errorBox.style.display = message ? 'block' : 'none';
  }

  function escapeHtml(value) {
    const element = document.createElement('div');
    element.textContent = value == null ? '' : String(value);
    return element.innerHTML;
  }

  function cacheKey(month) {
    return `${CACHE_PREFIX}-${MUNICIPIO}-${CICLO}-${month}`;
  }

  function readMonthCache(month) {
    const key = cacheKey(month);
    if (memoryCache.has(key)) return memoryCache.get(key);

    try {
      const saved = localStorage.getItem(key);
      if (!saved) return null;
      const entry = JSON.parse(saved);
      if (typeof entry.html !== 'string' || typeof entry.savedAt !== 'number') return null;
      memoryCache.set(key, entry);
      return entry;
    } catch (error) {
      console.warn('Impossibile leggere la cache locale del menu:', error);
      return null;
    }
  }

  function saveMonthCache(month, html) {
    const entry = { html, savedAt: Date.now() };
    const key = cacheKey(month);
    memoryCache.set(key, entry);
    try {
      localStorage.setItem(key, JSON.stringify(entry));
    } catch (error) {
      console.warn('Impossibile salvare la cache locale del menu:', error);
    }
    return entry;
  }

  function parseMonthMenu(html) {
    const document = new DOMParser().parseFromString(html, 'text/html');
    const menuSection = document.querySelector('#zonaMenuMese');
    if (!menuSection) {
      throw new Error('La pagina ricevuta non contiene il menu mensile.');
    }

    const days = {};
    let currentDay = null;
    let currentMeal = null;

    menuSection.querySelectorAll('table').forEach((table) => {
      const cells = Array.from(table.querySelectorAll('td'))
        .map((cell) => cell.textContent.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      const text = cells.join(' ').trim();
      if (!text) return;

      const dateMatch = text.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
      if (dateMatch) {
        const [, day, month, year] = dateMatch;
        const isoDate = `${year}-${month}-${day}`;
        currentDay = days[isoDate] = { meals: [], notes: [] };
        currentMeal = null;
        return;
      }

      if (!currentDay) return;

      const heading = table.querySelector('strong');
      if (heading) {
        const label = heading.textContent.replace(/\s+/g, ' ').trim();
        currentMeal = { label, items: [] };
        currentDay.meals.push(currentMeal);
        return;
      }

      if (currentMeal) currentMeal.items.push(text);
      else currentDay.notes.push(text);
    });

    if (Object.keys(days).length === 0) {
      throw new Error('Non è stato possibile trovare le date del menu mensile.');
    }
    return days;
  }

  function renderMenu(html, isoDate) {
    const days = parseMonthMenu(html);
    const day = days[isoDate];
    currentMonthHtml = html;
    hasMonthMenu = true;
    overviewVisible = false;
    overviewModes.hidden = true;
    overviewBtn.disabled = false;
    overviewBtn.textContent = '📊 Overview del mese';
    menuDate.textContent = dateLabel(isoDate);
    menuGrid.replaceChildren();

    if (!day || (day.meals.length === 0 && day.notes.length === 0)) {
      const message = document.createElement('div');
      message.className = 'note-box';
      message.textContent = 'Nessun menù disponibile per la data selezionata.';
      menuGrid.appendChild(message);
    } else {
      day.meals.forEach((meal) => {
        if (meal.items.length === 0) return;
        const item = document.createElement('div');
        item.className = 'menu-item';
        item.innerHTML = `
          <span class="emoji">🍽️</span>
          <span class="item-label">${escapeHtml(meal.label)}</span>
          <span class="item-value">${meal.items.map(escapeHtml).join('<br>')}</span>
        `;
        menuGrid.appendChild(item);
      });

      day.notes.forEach((note) => {
        const item = document.createElement('div');
        item.className = 'note-box';
        item.textContent = note;
        menuGrid.appendChild(item);
      });
    }

    resultCard.style.display = 'flex';
  }

  function renderOverview(mode = 'grouped') {
    if (!currentMonthHtml) return;
    const days = parseMonthMenu(currentMonthHtml);
    const sortedDays = Object.entries(days).sort(([dateA], [dateB]) => dateA.localeCompare(dateB));
    overviewModes.hidden = false;
    groupedViewBtn.classList.toggle('active', mode === 'grouped');
    groupedViewBtn.setAttribute('aria-pressed', String(mode === 'grouped'));
    dailyViewBtn.classList.toggle('active', mode === 'daily');
    dailyViewBtn.setAttribute('aria-pressed', String(mode === 'daily'));

    if (mode === 'daily') {
      const [year, month, day] = sortedDays[0][0].split('-').map(Number);
      const monthLabel = new Date(year, month - 1, day).toLocaleDateString('it-IT', {
        month: 'long',
        year: 'numeric'
      });
      menuDate.textContent = `Menù del mese · ${monthLabel}`;
      menuGrid.replaceChildren();

      sortedDays.forEach(([isoDate, menu]) => {
        const daySection = document.createElement('section');
        daySection.className = 'overview-day';
        const heading = document.createElement('h3');
        heading.className = 'overview-day-title';
        heading.textContent = dateLabel(isoDate);
        daySection.appendChild(heading);

        menu.meals.forEach((meal) => {
          if (meal.items.length === 0) return;
          const mealCard = document.createElement('article');
          mealCard.className = 'overview-day-meal';
          const mealHeading = document.createElement('strong');
          mealHeading.className = 'overview-day-meal-title';
          mealHeading.textContent = meal.label;
          const foodList = document.createElement('ul');
          foodList.className = 'overview-day-foods';
          meal.items.forEach((food) => {
            const foodItem = document.createElement('li');
            foodItem.textContent = food;
            foodList.appendChild(foodItem);
          });
          mealCard.append(mealHeading, foodList);
          daySection.appendChild(mealCard);
        });

        menu.notes.forEach((note) => {
          const noteItem = document.createElement('p');
          noteItem.className = 'note-box';
          noteItem.textContent = note;
          daySection.appendChild(noteItem);
        });

        menuGrid.appendChild(daySection);
      });

      overviewVisible = true;
      overviewBtn.textContent = '🍽️ Torna al menù del giorno';
      return;
    }

    const meals = new Map();

    Object.entries(days).forEach(([isoDate, day]) => {
      day.meals.forEach((meal) => {
        const isLunch = meal.label.trim().toLocaleLowerCase('it-IT') === 'pranzo';
        const mealLabel = meal.label.trim();
        if (!meals.has(mealLabel)) meals.set(mealLabel, new Map());
        const foods = meals.get(mealLabel);

        meal.items.forEach((food) => {
          const normalized = food.replace(/\s+/g, ' ').trim();
          const key = normalized.toLocaleLowerCase('it-IT');
          if (!normalized || (isLunch && /^(pane|frutta)\b/i.test(normalized))) return;
          if (!foods.has(key)) foods.set(key, { name: normalized, dates: [] });
          const entry = foods.get(key);
          const dates = entry.dates;
          if (dates[dates.length - 1] !== isoDate) dates.push(isoDate);
        });
      });
    });

    const [year, month, day] = sortedDays[0][0].split('-').map(Number);
    const monthLabel = new Date(year, month - 1, day).toLocaleDateString('it-IT', {
      month: 'long',
      year: 'numeric'
    });

    menuDate.textContent = `Overview · ${monthLabel}`;
    menuGrid.replaceChildren();
    if (Array.from(meals.values()).every((foods) => foods.size === 0)) {
      const message = document.createElement('div');
      message.className = 'note-box';
      message.textContent = 'Non ci sono pietanze da riepilogare per questo mese.';
      menuGrid.appendChild(message);
    } else {
      meals.forEach((foods, mealLabel) => {
        if (foods.size === 0) return;
        const group = document.createElement('section');
        group.className = 'overview-group';
        const heading = document.createElement('h3');
        heading.className = 'overview-group-title';
        heading.textContent = mealLabel;
        const items = document.createElement('div');
        items.className = 'overview-group-items';

        Array.from(foods.values())
          .sort((a, b) => a.name.localeCompare(b.name, 'it'))
          .forEach((food) => {
            const item = document.createElement('article');
            item.className = 'overview-item';
            const name = document.createElement('strong');
            name.className = 'overview-food';
            name.textContent = food.name;
            const dates = document.createElement('span');
            dates.className = 'overview-dates';
            dates.textContent = food.dates.map(isoToItalianDate).join(' · ');
            item.append(name, dates);
            items.appendChild(item);
          });

        group.append(heading, items);
        menuGrid.appendChild(group);
      });
    }

    overviewVisible = true;
    overviewBtn.textContent = '🍽️ Torna al menù del giorno';
  }

  async function fetchMonth(isoDate) {
    const targetUrl = new URL(BASE_URL);
    targetUrl.searchParams.set('municipio', MUNICIPIO);
    targetUrl.searchParams.set('cicloScolastico', CICLO);
    targetUrl.searchParams.set('dataSelezionata', isoToApiDate(isoDate));

    const response = await fetch(PROXY_URL, {
      headers: {
        Accept: 'text/html, application/xhtml+xml',
        'x-target-url': targetUrl.toString()
      },
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(`Il servizio ha risposto con HTTP ${response.status}.`);

    const contentType = response.headers.get('content-type') || '';
    const charset = contentType.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1] || 'utf-8';
    const html = new TextDecoder(charset).decode(await response.arrayBuffer());
    if (!html.trim()) throw new Error('Il servizio ha restituito una risposta vuota.');
    parseMonthMenu(html);
    return html;
  }

  async function loadMenu(isoDate) {
    if (!isoDate) {
      setError('Seleziona una data per visualizzare il menù.');
      return;
    }

    setError('');
    btn.disabled = true;
    dateInput.disabled = true;
    datePickerBtn.disabled = true;
    previousDateBtn.disabled = true;
    nextDateBtn.disabled = true;
    overviewBtn.disabled = true;
    loader.style.display = 'block';
    const month = isoDate.slice(0, 7);
    const cached = readMonthCache(month);

    if (cached) {
      renderMenu(cached.html, isoDate);
      overviewBtn.disabled = true;
    } else {
      hasMonthMenu = false;
      resultCard.style.display = 'none';
    }

    const isFresh = cached && Date.now() - cached.savedAt < CACHE_TTL;
    if (isFresh) {
      loader.style.display = 'none';
      btn.disabled = false;
      dateInput.disabled = false;
      datePickerBtn.disabled = false;
      previousDateBtn.disabled = false;
      nextDateBtn.disabled = false;
      overviewBtn.disabled = !hasMonthMenu;
      return;
    }

    loader.textContent = cached
      ? 'Aggiornamento del menù salvato…'
      : 'Caricamento menù…';

    try {
      const html = await fetchMonth(isoDate);
      saveMonthCache(month, html);
      renderMenu(html, isoDate);
    } catch (error) {
      console.error('Errore durante il caricamento del menu:', error);
      setError(cached
        ? 'Connessione non disponibile: è mostrato il menù salvato in precedenza.'
        : 'Non è stato possibile caricare il menù. Verifica la connessione e riprova.');
    } finally {
      loader.style.display = 'none';
      loader.textContent = 'Caricamento menù…';
      btn.disabled = false;
      dateInput.disabled = false;
      datePickerBtn.disabled = false;
      previousDateBtn.disabled = false;
      nextDateBtn.disabled = false;
      overviewBtn.disabled = !hasMonthMenu;
    }
  }

  btn.addEventListener('click', () => {
    const isoDate = italianDateToIso(dateInput.value);
    if (!isoDate) {
      setError('Inserisci una data valida nel formato gg/mm/aaaa.');
      dateInput.focus();
      return;
    }
    datePicker.value = isoDate;
    loadMenu(isoDate);
  });
  dateInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') btn.click();
  });
  datePickerBtn.addEventListener('click', () => {
    if (typeof datePicker.showPicker === 'function') datePicker.showPicker();
    else {
      datePicker.focus();
      datePicker.click();
    }
  });
  datePicker.addEventListener('change', () => {
    if (!datePicker.value) return;
    dateInput.value = isoToItalianDate(datePicker.value);
    setError('');
    loadMenu(datePicker.value);
  });
  function shiftSelectedDate(offset) {
    const isoDate = italianDateToIso(dateInput.value);
    if (!isoDate) {
      setError('Inserisci una data valida nel formato gg/mm/aaaa.');
      dateInput.focus();
      return;
    }

    const [year, month, day] = isoDate.split('-').map(Number);
    const nextDate = new Date(year, month - 1, day + offset);
    const nextIsoDate = localIsoDate(nextDate);
    dateInput.value = isoToItalianDate(nextIsoDate);
    datePicker.value = nextIsoDate;
    setError('');
    loadMenu(nextIsoDate);
  }
  previousDateBtn.addEventListener('click', () => shiftSelectedDate(-1));
  nextDateBtn.addEventListener('click', () => shiftSelectedDate(1));
  overviewBtn.addEventListener('click', () => {
    if (overviewVisible) {
      const selectedDate = italianDateToIso(dateInput.value);
      if (selectedDate) renderMenu(currentMonthHtml, selectedDate);
      return;
    }
    renderOverview();
  });
  groupedViewBtn.addEventListener('click', () => renderOverview('grouped'));
  dailyViewBtn.addEventListener('click', () => renderOverview('daily'));
  const today = localIsoDate(new Date());
  dateInput.value = isoToItalianDate(today);
  datePicker.value = today;
  loadMenu(today);

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js')
      .catch((error) => console.error('Impossibile registrare il service worker:', error));
  }
})();
