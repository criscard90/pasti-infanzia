(() => {
  // ================= CONFIGURAZIONE =================
  const BASE_URL = 'https://www.comune.roma.it/servizi/mesis-portal-reports-war/';
  const MUNICIPIO = '8';
  const CICLO = '4';
  // Endpoint che restituisce il menu mensile in HTML (più affidabile del proxy)
  const MENU_MESI_URL = 'https://www.comune.roma.it/servizi/mesis-portal-reports-war/loadMenuMese.do';

  // ================= ELEMENTI DOM =================
  const $ = (sel) => document.querySelector(sel);
  const dateInput = $('#date');
  const btn = $('#btn');
  const loader = $('#loader');
  const errorBox = $('#error');
  const resultCard = $('#resultCard');
  const menuDate = $('#menuDate');
  const menuGrid = $('#menuGrid');
  const rawBox = $('#rawBox');
  const rawToggle = $('#rawToggle');

  // ================= DATA =================
  const today = new Date().toISOString().split('T')[0];
  const todayDate = new Date();
  const firstDayOfMonth = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);
  const lastDayOfMonth = new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 0);
  
  // Imposta il valore min/max e genera le opzioni per tutto il mese
  dateInput.min = firstDayOfMonth.toISOString().split('T')[0];
  dateInput.max = lastDayOfMonth.toISOString().split('T')[0];
  dateInput.value = today;
  
  // Genera un select dropdown con tutti i giorni del mese (opzionale miglioramento UI)
  // Nota: Mantengo l'input type="date" nativo ma ne potenziamo le limitazioni

  function isoToApiDate(iso) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  function dateLabel(iso) {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('it-IT', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  }

  // ================= UTILITY =================
  function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text === null || text === undefined ? '' : String(text);
    return d.innerHTML;
  }

  function setError(show, msg) {
    errorBox.style.display = show ? 'block' : 'none';
    if (show) errorBox.textContent = msg;
  }

  function extractTextFromHtml(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    div.querySelectorAll('script, style').forEach((el) => el.remove());
    const text = div.innerText || div.textContent || '';
    return text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  }

  // ================= RENDERING MENÙ (JSON) =================
  const FIELDS = [
    { key: 'primo', label: 'Primo', emoji: '🍝' },
    { key: 'secondo', label: 'Secondo', emoji: '🍗' },
    { key: 'contorno', label: 'Contorno', emoji: '🥗' },
    { key: 'frutta', label: 'Frutta', emoji: '🍎' },
    { key: 'note', label: 'Note', emoji: '📝' },
  ];

  function renderJson(data, label) {
    let menu = data;
    if (Array.isArray(data)) menu = data.find((x) => x && typeof x === 'object') || data[0] || {};
    if (!menu || typeof menu !== 'object') {
      renderHtml([String(data)], label);
      return;
    }

    menuDate.textContent = label;
    menuGrid.innerHTML = '';

    let renderedAny = false;
    FIELDS.forEach((field) => {
      const val = menu[field.key];
      if (val === undefined || val === null || String(val).trim() === '') return;
      renderedAny = true;
      const item = document.createElement('div');
      item.className = 'menu-item';
      item.innerHTML = `
        <span class="emoji">${field.emoji}</span>
        <span class="item-label">${escapeHtml(field.label)}</span>
        <span class="item-value">${escapeHtml(String(val))}</span>
      `;
      menuGrid.appendChild(item);
    });

    if (!renderedAny) {
      const item = document.createElement('div');
      item.className = 'menu-item';
      item.style.background = '#f8fafc';
      item.style.borderColor = '#cbd5e1';
      item.style.color = '#334155';
      item.innerHTML = `
        <span class="emoji">📦</span>
        <span class="item-label">Dati ricevuti</span>
        <span class="item-value">${escapeHtml(JSON.stringify(menu, null, 2))}</span>
      `;
      menuGrid.appendChild(item);
    }

    resultCard.style.display = 'flex';
    rawBox.style.display = 'none';
    rawToggle.style.display = 'inline-block';
    rawBox.textContent = JSON.stringify(data, null, 2);
  }

  // ================= RENDERING MENÙ (HTML / testo) =================
  function renderHtml(lines, label) {
    menuDate.textContent = label;
    menuGrid.innerHTML = '';

    if (lines.length === 0) lines = ['Nessun dato disponibile per questa data.'];

    const styles = ['var(--cream)', '#dbeafe', 'var(--mint)', 'var(--pink-light)', 'var(--blue-light)'];
    lines.forEach((line, i) => {
      const item = document.createElement('div');
      item.className = 'menu-item';
      item.style.cssText = `background: ${styles[i % styles.length]}; border-color: transparent;`;
      item.innerHTML = `
        <span class="emoji">🍽️</span>
        <span class="item-value">${escapeHtml(line)}</span>
      `;
      menuGrid.appendChild(item);
    });

    resultCard.style.display = 'flex';
    rawBox.style.display = 'none';
    rawToggle.style.display = 'inline-block';
    rawBox.textContent = lines.join('\n');
  }

  // ================= FETCH =================
  async function loadMenu(dateStr) {
    setError(false, '');
    resultCard.style.display = 'none';
    rawBox.style.display = 'none';
    loader.style.display = 'block';
    btn.disabled = true;

    // Usa la data selezionata dall'input, altrimenti oggi
    const selectedDate = dateInput.value || dateStr;
    const dateToUse = selectedDate || today;

    // Fai scraping dell'endpoint menù mensile (HTML affidabile, no CORS issues)
    const fetchUrl = MENU_MESI_URL + `?municipio=${MUNICIPIO}&cicloScolastico=${CICLO}&dataSelezionata=${dateToUse}`;

    try {
      const response = await fetch(fetchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
          'Accept': 'text/html, text/plain, */*',
          'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
          'Referer': 'https://www.comune.roma.it/',
          'Cache-Control': 'no-cache'
        }
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const html = await response.text();

      if (!html || !html.trim()) throw new Error('Risposta vuota');

      // Parsing HTML per estrarre i menu giornalieri
      // Il formato è: "Giorno DD/MM/AAAA" seguito dai pasti
      const today = new Date(dateToUse);
      const giorno = String(today.getDate()).padStart(2, '0');
      const mese = String(today.getMonth() + 1).padStart(2, '0');
      const anno = today.getFullYear();
      const todayKey = `${giorno}/${mese}/${anno}`;

      // Estrae tutti i blocchi giorno dalla HTML
      // Formato: "Lunedì 02/11/2026" o "Martedì 10/11/2026" ecc.
      const giornoRegex = /(Lunedi|Martedi|Mercoledi|Giovedi|Venerdì|Sabato|Domenica)\s+(\d{2}\/\d{2}\/\d{4})/g;
      const giorniTrovati = [];

      let match;
      while ((match = giornoRegex.exec(html)) !== null) {
        giorniTrovati.push({
          nomeGiorno: match[1],
          data: match[2],
          testoCompleto: match[0]
        });
      }

      // Cerca la data selezionata nella lista
      const menuGiorno = giorniTrovati.find(g => g.data === todayKey);

      // Estrai i pasti dal testo del giorno trovato
      let lines = [];
      if (menuGiorno) {
        // Il testo del giorno include tutto, dobbiamo estrarre le linee del menu
        // Formato: "Menu mensile Spuntino ...", "Menu mensile Pranzo ...", ecc.
        const pastiRegex = /Menu mensile (Spuntino|Pranzo|Contorno|Frutta|Note)[^\n]*/g;
        let pastiMatch;
        while ((pastiMatch = pastiRegex.exec(menuGiorno.testoCompleto)) !== null) {
          lines.push(pastiMatch[1] + ': ' + pastiMatch[0].replace('Menu mensile ', '').trim());
        }
        // Se non trova pasti specifici, usa tutto il testo
        if (lines.length === 0) {
          lines = extractTextFromHtml(menuGiorno.testoCompleto);
        }
      } else {
        lines = ['Nessun dato disponibile per questa data.'];
      }

      // Determina l'etichetta da mostrare
      let label;
      if (menuGiorno) {
        label = `${menuGiorno.nomeGiorno} ${menuGiorno.data}`;
      } else {
        label = 'Menù Mese Corrent';
      }

      // Se non c'è dati, mostra messaggio
      if (!menuGiorno) {
        renderHtml(['Nessun dato disponibile per questa data.'], label);
        return;
      }

      // Renderizza il menù nella UI standard
      menuDate.textContent = label;
      menuGrid.innerHTML = '';

      const styles = ['var(--cream)', '#dbeafe', 'var(--mint)', 'var(--pink-light)', 'var(--blue-light)'];

      lines.forEach((line, i) => {
        const item = document.createElement('div');
        item.className = 'menu-item';
        item.style.cssText = `background: ${styles[i % styles.length]}; border-color: transparent;`;
        item.innerHTML = `
          <span class="emoji">🍽️</span>
          <span class="item-value">${escapeHtml(line)}</span>
        `;
        menuGrid.appendChild(item);
      });

      resultCard.style.display = 'flex';
      rawBox.style.display = 'none';
      rawToggle.style.display = 'inline-block';

      // Mostra anche l'indice del mese sotto il menù
      if (giorniTrovati.length > 0) {
        const meseInfo = document.createElement('div');
        meseInfo.style.marginTop = '10px';
        meseInfo.style.fontSize = '0.8em';
        meseInfo.style.color = '#666';
        meseInfo.textContent = `Menu mese corrente: ${giorniTrovati.length} giorni disponibili (seleziona una data sopra)`;
        menuGrid.appendChild(meseInfo);
      }

    } catch (err) {
      console.error('Errore scraping menù mensile:', err);
      setError(true, 'Non sono riuscita a caricare il menù. Verifica la connessione e riprova.');
    } finally {
      loader.style.display = 'none';
      loader.textContent = 'Caricamento menù…';
      btn.disabled = false;
    }
  }
      console.error('Errore scraping menù mensile:', err);
      setError(true, 'Non sono riuscita a caricare il menù. Verifica la connessione e riprova.');
    } finally {
      loader.style.display = 'none';
      loader.textContent = 'Caricamento menù…';
      btn.disabled = false;
    }
  }

  // ================= EVENTI =================
  btn.addEventListener('click', () => loadMenu(dateInput.value));

  rawToggle.addEventListener('click', () => {
    const show = rawBox.style.display === 'none';
    rawBox.style.display = show ? 'block' : 'none';
    rawToggle.querySelector('button').textContent = show ? 'Nascondi sorgente' : 'Visualizza sorgente';
  });

  loadMenu(today);
})();