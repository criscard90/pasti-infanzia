(() => {
  // ================= CONFIGURAZIONE =================
  const BASE_URL = 'https://www.comune.roma.it/servizi/mesis-portal-reports-war/elencoMenuGiorno.do';
  const MUNICIPIO = '8';
  const CICLO = '4';
  // Sostituisci con l'URL del tuo Cloudflare Worker (es. https://pasti-proxy.tuonome.workers.dev/proxy?target=)
  const PROXY_URL = 'https://pasti.cristian-cardillo-it.workers.dev/proxy?target=';

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
  dateInput.value = today;

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

    const apiDate = isoToApiDate(dateStr);
    const comuneUrl = `${BASE_URL}?municipio=${MUNICIPIO}&cicloScolastico=${CICLO}&giornoSelezionato=${encodeURIComponent(apiDate)}`;
    const fetchUrl = PROXY_URL + encodeURIComponent(comuneUrl);

    const tryFetch = async (requestUrl) => {
      const response = await fetch(requestUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
          'Referer': 'https://www.comune.roma.it/',
          'Cache-Control': 'no-cache'
        }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      if (!text || !text.trim()) throw new Error('Risposta vuota');
      return { text, contentType: response.headers.get('content-type') || '' };
    };

    try {
      const data = await tryFetch(fetchUrl);

      const isJson = data.contentType.includes('application/json');
      if (isJson) {
        try {
          renderJson(JSON.parse(data.text), dateLabel(dateStr));
        } catch {
          renderHtml(extractTextFromHtml(data.text), dateLabel(dateStr));
        }
      } else {
        renderHtml(extractTextFromHtml(data.text), dateLabel(dateStr));
      }
    } catch (err) {
      console.error(err);
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