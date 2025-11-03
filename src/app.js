/* global d3 */

// === Tema di fallback se /api/theme non esiste ===
const FallbackTheme = {
  defaults: { icon: '/public/assets/icons/default.svg', color: '#888' },
  types: {
        'movie': { color: '#0070c0', icon: '/public/assets/icons/film.svg' },
        'actor': { color: '#e09812', icon: '/public/assets/icons/actor.svg' },
        'director': { color: '#2a9d8f', icon: '/public/assets/icons/director.svg' },
        'genre': { color: '#e63946', icon: '/public/assets/icons/genre.svg' }
    }
};

// === API helper ===
const API = {
  async fetchRecs(userId, k) {
    // --- MANTENUTO IL CARICAMENTO MOCK PER ORA ---
    const res = await fetch('/public/data/mock_recs.json');
    if (!res.ok) throw new Error('mock_recs.json non trovato');
    const data = await res.json();
    
    data.recommendations = data.recommendations
                                .sort((a, b) => b.score - a.score) 
                                .slice(0, k);
    console.log('[UI] caricati', data.recommendations.length, 'item');
    return data;
  },
  async fetchTheme() {
    try {
      const r = await fetch('/api/theme');
      if (!r.ok) {
        console.warn('[UI] /api/theme non presente, uso fallback');
        return FallbackTheme;
      }
      const theme = await r.json();
      console.log('[UI] theme caricato');
      return theme;
    } catch (e) {
      console.warn('[UI] errore theme, uso fallback', e);
      return FallbackTheme;
    }
  }
};

// === Stato globale UI ===
const state = {
  svg: null, g: null, defs: null, bg: null, zoom: null, width: 0, height: 0,
  scales: {
    size: d3.scalePow().exponent(2).domain([0, 1]).range([10, 70]), // NOTA: Questo implementa già la scala dimensionale richiesta
    opacity: d3.scaleLinear().domain([0, 1]).range([0.35, 1]),
    // === MODIFICA RICHIESTA: Scala di colore da Giallo a Verde ===
    // Un punteggio basso (0) sarà giallo, un punteggio alto (1) sarà verde.
    // Usiamo colori standard per una buona visibilità.
    relevanceColor: d3.scaleLinear().domain([0, 1]).range(['#ffc107', '#28a745']) 
  },
  sizeSettings: { exp: 2, minR: 10, maxR: 70 },
  layoutMode: 'concentric', // 'concentric' | 'grid' | 'cluster'
  storyMode: false,
  tooltip: null,
  rawData: null,
  theme: null,
  filters: { clusters: new Set() },
  pulseTimer: null,
  selectedNodeId: null
};

// === Setup SVG + zoom ===
function initSVG() {
  const el = document.getElementById('chart');
  state.width = el.clientWidth;
  state.height = el.clientHeight;

  d3.select('#chart').selectAll('*').remove();

  state.svg = d3.select('#chart')
    .append('svg')
    .attr('width', state.width)
    .attr('height', state.height);

  // defs (patterns + glow filter)
  state.defs = state.svg.append('defs');
  defineGlowFilter();
  
  // DEFS per la freccia nel Mini-Graph
  state.defs.append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '-0 -5 10 10')
      .attr('refX', 20) 
      .attr('refY', 0)
      .attr('orient', 'auto')
      .attr('markerWidth', 10)
      .attr('markerHeight', 10)
      .append('path')
      .attr('d', 'M 0, -5 L 10, 0 L 0, 5')
      .attr('fill', '#999');

  // background per chiudere l’infocard cliccando “vuoto”
  state.bg = state.svg.append('rect')
    .attr('class', 'bg-close')
    .attr('x', 0).attr('y', 0)
    .attr('width', state.width)
    .attr('height', state.height)
    .attr('fill', 'transparent')
    .on('click', () => hideInfoCard());

  // contenitore del grafo
  state.g = state.svg.append('g');

  // zoom & pan
  state.zoom = d3.zoom()
    .scaleExtent([0.5, 6])
    .on('zoom', e => state.g.attr('transform', e.transform));
  state.svg.call(state.zoom);

  // tooltip
  state.tooltip = d3.select('body').append('div')
    .attr('class', 'tooltip')
    .style('opacity', 0);

  // ESC per chiudere infocard
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') hideInfoCard();
  }, { passive: true });
}

/** Resetta zoom al default */
function resetView() {
    state.svg.transition()
        .duration(750)
        .call(state.zoom.transform, d3.zoomIdentity);
}

// NUOVO: Aggiungi Gradienti per l'effetto 3D/Sfumatura
function defineGradient(id, startColor, endColor) {
    if (state.defs.select(`#${id}`).node()) return;
    const gradient = state.defs.append('radialGradient')
        .attr('id', id)
        .attr('cx', '50%')
        .attr('cy', '50%')
        .attr('r', '50%');

    gradient.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', startColor);
    
    gradient.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', endColor);
}

// === Pattern immagine+colore per tipo (MODIFICATO per usare la sfumatura) ===
function defineIconPattern(id, iconHref, color) {
    // 1. Definisci la sfumatura per il colore base del tipo
    const darkerColor = d3.color(color).darker(0.6).hex(); 
    defineGradient(`grad-${id}`, color, darkerColor); 
    
    // 2. Definisci il pattern che usa la sfumatura
    const pat = state.defs.append('pattern')
        .attr('id', id)
        .attr('patternUnits', 'objectBoundingBox')
        .attr('patternContentUnits', 'objectBoundingBox')
        .attr('width', 1)
        .attr('height', 1);

    // Usa la sfumatura come sfondo
    pat.append('rect')
        .attr('x', 0).attr('y', 0)
        .attr('width', 1).attr('height', 1)
        .attr('fill', `url(#grad-${id})`); 

    // Aggiungi l'icona
    pat.append('image')
        .attr('href', iconHref)
        .attr('x', 0.15)
        .attr('y', 0.15)
        .attr('width', 0.70)
        .attr('height', 0.70)
        .attr('preserveAspectRatio', 'xMidYMid meet')
        .on('error', function() {
            console.warn('[UI] icona non trovata per pattern', id, '→ solo sfumatura');
        });
}

// === Effetto glow per il selezionato ===
function defineGlowFilter() {
  if (state.defs.select('#glow').node()) return;
  const f = state.defs.append('filter')
    .attr('id', 'glow')
    .attr('x', '-50%').attr('y', '-50%')
    .attr('width', '200%').attr('height', '200%');
  f.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'coloredBlur');
  const m = f.append('feMerge');
  m.append('feMergeNode').attr('in', 'coloredBlur');
  m.append('feMergeNode').attr('in', 'SourceGraphic');
}

function buildLegend(theme) {
  d3.select('.legend').remove();
  const legend = d3.select('body').append('div').attr('class', 'legend');
  legend.append('div').style('font-weight', 600).text('Legenda');
  Object.entries(theme.types || {}).forEach(([type, cfg]) => {
    const row = legend.append('div')
      .style('display', 'flex')
      .style('gap', '8px')
      .style('align-items', 'center')
      .style('margin', '4px 0');
    row.append('img').attr('src', cfg.icon).attr('width', 18).attr('height', 18);
    row.append('span').text(type);
  });
}

// === Categorizzazione (per filtri) ===
function categorize(expl) {
  const text = (expl?.brief || '').toLowerCase();
  const shared = (expl?.shared_entities || []).map(e => e.type?.toLowerCase());
  if (text.includes('attori') || shared.includes('actor')) return 'Attori in comune';
  if (text.includes('regista') || shared.includes('director')) return 'Regista correlato';
  if (text.includes('genere') || shared.includes('genre')) return 'Genere simile';
  return 'Affinità di profilo';
}

// === Pannello filtri (FUNZIONANTE) ===
function buildFiltersPanel(nodesAll) {
  const clusters = Array.from(new Set(nodesAll.map(n => n.cluster)));
  if (state.filters.clusters.size === 0) clusters.forEach(c => state.filters.clusters.add(c));

  let panel = document.getElementById('filtersPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'filtersPanel';
    panel.style.position = 'absolute';
    panel.style.left = '16px';
    panel.style.top = '72px';
    panel.style.background = '#ffffff';
    panel.style.border = '1px solid #e5e5e5';
    panel.style.borderRadius = '8px';
    panel.style.boxShadow = '0 4px 14px rgba(0,0,0,.08)'; 
    panel.style.padding = '8px 10px';
    panel.style.fontFamily = 'system-ui, Arial, sans-serif';
    panel.style.fontSize = '13px';
    panel.style.zIndex = '10';
    document.body.appendChild(panel);
  }
  panel.innerHTML = '';

  const title = document.createElement('div');
  title.style.fontWeight = '600';
  title.style.marginBottom = '6px';
  title.textContent = 'Filtri motivo';
  panel.appendChild(title);

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '8px';
  actions.style.marginBottom = '6px';

  const btnAll = document.createElement('button');
  btnAll.textContent = 'Tutti';
  btnAll.classList.add('ui-btn', 'ui-btn-small');
  btnAll.onclick = () => {
    state.filters.clusters = new Set(clusters);
    buildFiltersPanel(nodesAll);
    renderNodesFiltered();
  };

  const btnNone = document.createElement('button');
  btnNone.textContent = 'Nessuno';
  btnNone.classList.add('ui-btn', 'ui-btn-small');
  btnNone.onclick = () => {
    state.filters.clusters.clear();
    buildFiltersPanel(nodesAll);
    renderNodesFiltered();
  };

  actions.appendChild(btnAll);
  actions.appendChild(btnNone);
  panel.appendChild(actions);

  clusters.forEach(c => {
    const row = document.createElement('label');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '6px';
    row.style.margin = '4px 0';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = state.filters.clusters.has(c);
    cb.onchange = () => {
      if (cb.checked) state.filters.clusters.add(c);
      else state.filters.clusters.delete(c);
      renderNodesFiltered();
    };

    const span = document.createElement('span');
    span.textContent = c;

    row.appendChild(cb);
    row.appendChild(span);
    panel.appendChild(row);
  });
}

// === Pannello preferenze (FUNZIONANTE) ===
function buildPrefsPanel() {
  let panel = document.getElementById('prefsPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'prefsPanel';
    panel.style.position = 'absolute';
    panel.style.left = '16px';
    panel.style.top = '260px';
    panel.style.background = '#ffffff';
    panel.style.border = '1px solid #e5e5e5';
    panel.style.borderRadius = '8px';
    panel.style.boxShadow = '0 4px 14px rgba(0,0,0,.08)'; 
    panel.style.padding = '10px 12px';
    panel.style.fontFamily = 'system-ui, Arial, sans-serif';
    panel.style.fontSize = '13px';
    panel.style.zIndex = '10';
    document.body.appendChild(panel);
  }
  panel.innerHTML = '';

  const head = document.createElement('div');
  head.style.fontWeight = '600';
  head.style.marginBottom = '8px';
  head.textContent = 'Preferenze';
  panel.appendChild(head);

  // Layout
  const rowLayout = document.createElement('div');
  rowLayout.classList.add('pref-row');
  const lblLayout = document.createElement('label');
  lblLayout.textContent = 'Layout';
  const selLayout = document.createElement('select');
  selLayout.classList.add('ui-select');
  ['concentric','grid','cluster'].forEach(v => {
    const o = document.createElement('option');
    o.value = v; o.textContent = (v === 'concentric' ? 'Concentrici' : v === 'grid' ? 'Griglia' : 'Cluster');
    if (v === state.layoutMode) o.selected = true;
    selLayout.appendChild(o);
  });
  selLayout.onchange = () => { state.layoutMode = selLayout.value; renderNodesFiltered(); };
  rowLayout.appendChild(lblLayout); rowLayout.appendChild(selLayout);
  panel.appendChild(rowLayout);

  // Scala importanza (esponente)
  const rowExp = document.createElement('div');
  rowExp.classList.add('pref-row-slider');
  const lblExp = document.createElement('label'); lblExp.textContent = 'Scala importanza';
  const sldExp = document.createElement('input');
  sldExp.type = 'range'; sldExp.min = '1'; sldExp.max = '4'; sldExp.step = '0.1';
  sldExp.value = String(state.sizeSettings.exp);
  const outExp = document.createElement('div'); outExp.textContent = state.sizeSettings.exp.toFixed(1);
  sldExp.oninput = () => { outExp.textContent = Number(sldExp.value).toFixed(1); };
  sldExp.onchange = () => { state.sizeSettings.exp = Number(sldExp.value); renderNodesFiltered(); };
  rowExp.appendChild(lblExp); rowExp.appendChild(sldExp); rowExp.appendChild(outExp);
  panel.appendChild(rowExp);

  // Dimensione massima
  const rowMax = document.createElement('div');
  rowMax.classList.add('pref-row-slider');
  const lblMax = document.createElement('label'); lblMax.textContent = 'Distanza Item';
  const sldMax = document.createElement('input');
  sldMax.type = 'range'; sldMax.min = '40'; sldMax.max = '110'; sldMax.step = '1';
  sldMax.value = String(state.sizeSettings.maxR);
  const outMax = document.createElement('div'); outMax.textContent = state.sizeSettings.maxR.toString();
  sldMax.oninput = () => { outMax.textContent = sldMax.value; };
  sldMax.onchange = () => { state.sizeSettings.maxR = Number(sldMax.value); renderNodesFiltered(); };
  rowMax.appendChild(lblMax); rowMax.appendChild(sldMax); rowMax.appendChild(outMax);
  panel.appendChild(rowMax);
  
  // Pulsante Reset View
  const resetBtn = document.createElement('button');
  resetBtn.textContent = 'Reset Zoom/Vista';
  resetBtn.classList.add('ui-btn');
  resetBtn.style.marginTop = '10px';
  resetBtn.onclick = resetView;
  panel.appendChild(resetBtn);


  // Story mode
  const rowStory = document.createElement('label');
  rowStory.classList.add('pref-row-checkbox');
  const chkStory = document.createElement('input');
  chkStory.type = 'checkbox'; chkStory.checked = state.storyMode;
  chkStory.onchange = () => { state.storyMode = chkStory.checked; };
  rowStory.appendChild(chkStory);
  rowStory.appendChild(document.createTextNode('Story Mode'));
  panel.appendChild(rowStory);
}

function makeNodes(dataA) {
  return dataA.recommendations.map(r => ({
    id: r.item_id,
    label: r.label,
    type: r.type,
    score: r.score,
    explanation: r.explanation,
    cluster: categorize(r.explanation),
    hovered: false
  }));
}

// === MODIFICA ===
// CANCELLATA la vecchia funzione 'getRelevanceColor'
// Sarà usata 'state.scales.relevanceColor' al suo posto.

// helper aura color: RESTITUISCE IL COLORE CON OPACITÀ DINAMICA
function auraColor(score) {
    // MODIFICATO: Usa la nuova scala di colori Giallo->Verde
    const solidColor = state.scales.relevanceColor(score);
    const color = d3.color(solidColor);
    const op = d3.scaleLinear().domain([0.0, 1.0]).range([0.5, 1.0]);
    return color.copy({opacity: op(score)}).toString();
}

// === Render (layout concentrici / griglia / cluster) + pulsazione top-3
function renderNodesFiltered() {
  if (!state.rawData || !state.theme) return;

  // aggiorna scala dimensioni in base alle preferenze
  state.scales.size = d3.scalePow()
    .exponent(state.sizeSettings.exp)
    .domain([0, 1])
    .range([state.sizeSettings.minR, state.sizeSettings.maxR]);

  const nodesAll = makeNodes(state.rawData);

  // reset defs/patterns (non rimuovere il filtro glow)
  state.defs.selectAll('pattern').remove();
  const defaults = state.theme?.defaults || FallbackTheme.defaults;
  const typesCfg = state.theme?.types || {};
  const iconFor  = t => (typesCfg[t] && typesCfg[t].icon)  || defaults.icon;
  const colorFor = t => (typesCfg[t] && typesCfg[t].color) || defaults.color;

    // RIGENERAZIONE DEI PATTERN CON LE SFUMATURE
  const typesSet = [...new Set(nodesAll.map(n => n.type))];
  typesSet.forEach(t => defineIconPattern(`pat-${t}`, iconFor(t), colorFor(t)));

  buildLegend(state.theme);
  buildFiltersPanel(nodesAll);
  buildPrefsPanel();

  // Applica filtri 
  const visibleNodes = nodesAll.filter(n => state.filters.clusters.has(n.cluster));
  
  let nodes = nodesAll; 
  nodes = [...nodes].sort((a, b) => b.score - a.score);

  if (nodes.length === 0) {
      state.g.selectAll('.node').remove();
      if (state.pulseTimer) { state.pulseTimer.stop(); state.pulseTimer = null; }
      return;
  }
  
  // Re-inizializza posizione per la simulazione
  const minSide = Math.min(state.width, state.height);
  const cx = state.width / 2, cy = state.height / 2;

  if (state.layoutMode === 'concentric') {
    const maxR = 0.45 * minSide;
    const N = nodes.length;
    nodes.forEach((n, i) => n.targetR = (N > 1 ? i / (N - 1) : 0) * maxR);
    nodes.forEach((n, i) => {
      const ang = (i / Math.max(1, N)) * 2 * Math.PI;
      const r0 = n.targetR * 0.2;
      n.x = cx + Math.cos(ang) * r0;
      n.y = cy + Math.sin(ang) * r0;
    });
  } else if (state.layoutMode === 'grid') {
    const N = nodes.length;
    const cols = Math.ceil(Math.sqrt(N));
    const rows = Math.ceil(N / cols);
    const cell = state.sizeSettings.maxR * 2 + 20;
    const gridW = cols * cell;
    const gridH = rows * cell;
    const startX = cx - gridW / 2 + cell / 2;
    const startY = cy - gridH / 2 + cell / 2;
    nodes.forEach((n, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      n.gx = startX + c * cell;
      n.gy = startY + r * cell;
      n.x = n.gx;
      n.y = n.gy;
    });
  } else { // 'cluster'
    const groups = Array.from(new Set(nodes.map(n => n.cluster)));
    const radius = 0.25 * minSide;
    const centers = {};
    groups.forEach((g, idx) => {
      const ang = (2 * Math.PI * idx) / groups.length;
      centers[g] = { x: cx + Math.cos(ang) * radius, y: cy + Math.sin(ang) * radius };
    });
    nodes.forEach(n => {
      const c = centers[n.cluster];
      const jitter = (state.sizeSettings.maxR) * 0.5;
      n.x = c.x + (Math.random() - 0.5) * jitter;
      n.y = c.y + (Math.random() - 0.5) * jitter;
      n.center = c;
    });
  }


  // Simulation per layout
  let sim = null;
  if (state.layoutMode === 'concentric') {
    sim = d3.forceSimulation(nodes)
      .force('radial', d3.forceRadial(d => d.targetR, cx, cy).strength(0.9))
      .force('center', d3.forceCenter(cx, cy))
      .force('collision', d3.forceCollide().radius(d => state.scales.size(d.score) * 1.25))
      .force('charge', d3.forceManyBody().strength(-8))
      .alpha(1).alphaDecay(0.06)
      .on('tick', ticked);
  } else if (state.layoutMode === 'grid') {
    sim = d3.forceSimulation(nodes)
      .force('x', d3.forceX(d => d.gx).strength(1))
      .force('y', d3.forceY(d => d.gy).strength(1))
      .force('collision', d3.forceCollide().radius(d => state.scales.size(d.score) * 1.1))
      .alpha(1).alphaDecay(0.12)
      .on('tick', ticked);
  } else { // cluster
    sim = d3.forceSimulation(nodes)
      .force('x', d3.forceX(d => d.center.x).strength(0.25))
      .force('y', d3.forceY(d => d.center.y).strength(0.25))
      .force('collision', d3.forceCollide().radius(d => state.scales.size(d.score) * 1.15))
      .force('charge', d3.forceManyBody().strength(-10))
      .alpha(1).alphaDecay(0.08)
      .on('tick', ticked);
  }
  
  // Bind nodi
  const sel = state.g.selectAll('.node')
    .data(nodes, d => d.id);

  sel.exit().remove();

  const enter = sel.enter().append('g')
    .attr('class', 'node')
    .style('cursor', 'pointer');

  // --- gruppo interno che può pulsare (useremo per i top3 visibili)
  const pulse = enter.append('g').attr('class', 'pulse');

  // AURA colorata (pulsante con il gruppo)
  pulse.append('circle')
    .attr('class', 'aura')
    .attr('r', d => state.scales.size(d.score) * 1.22)
    .attr('fill', 'none')
    .attr('stroke', d => auraColor(d.score)) // MODIFICATO: usa la nuova funzione aura
    .attr('stroke-width', 5)
    .attr('stroke-opacity', d => state.filters.clusters.has(d.cluster) ? d3.scaleLinear().domain([0.0, 1.0]).range([0.4, 0.8])(d.score) : 0.15); 

  // Cerchio principale con pattern (classe .core) — bounce all’ingresso
  pulse.append('circle')
    .attr('class', 'core')
    .attr('r', d => state.scales.size(d.score) * 0.8)
    .attr('fill', d => {
      const pid = `pat-${d.type}`;
      const exists = !!state.svg.select(`#${pid}`).node();
      // Usa l'URL del gradiente definito sopra
      return exists ? `url(#grad-pat-${d.type})` : colorFor(d.type);
    })
    .attr('fill-opacity', d => state.scales.opacity(d.score))
    // === MODIFICA RICHIESTA: Colore bordo (stroke) basato sulla pertinenza ===
    .attr('stroke', d => state.scales.relevanceColor(d.score)) 
    .attr('stroke-width', 2.5)
    .transition()
    .duration(900)
    .ease(d3.easeElasticOut.amplitude ? d3.easeElasticOut.amplitude(1.2).period(0.3) : d3.easeElasticOut)
    .attr('r', d => state.scales.size(d.score));

  // Etichetta fissa (non pulsante)
  enter.append('text')
    .attr('class', 'node-label') 
    .attr('text-anchor', 'middle')
    .attr('dy', d => state.scales.size(d.score) + 16)
    .attr('font-size', '12px')
    // CORREZIONE LEGGIBILITÀ: Rimosso lo stroke bianco, solo fill
    .attr('stroke', 'none') 
    .attr('stroke-width', 0)
    .attr('fill', '#f3f4f6') 
    .text(d => d.label.length > 28 ? d.label.slice(0, 26) + '…' : d.label);

  // Hover/tooltip
  enter.on('mouseenter', (ev, d) => {
      d.hovered = true;
      state.tooltip.style('opacity', 1)
        .html(`<b>${d.label}</b><br/>Pertinenza: ${(d.score * 100).toFixed(1)}%<br/><i>${d.explanation?.brief || ''}</i>`);
      ticked();
    })
    .on('mousemove', ev => {
      state.tooltip.style('left', (ev.pageX + 12) + 'px')
                   .style('top', (ev.pageY + 12) + 'px');
    })
    .on('mouseleave', (ev, d) => {
      d.hovered = false;
      state.tooltip.style('opacity', 0);
      ticked();
    })
    .on('click', (_, d) => {
      state.selectedNodeId = d.id;
      highlightSelected(d.id);
      showInfoCard(d);
    });

  const all = enter.merge(sel);
  
  // TRANSITIONS MIGLIORATE: Per fluidità al cambio layout
  all.transition()
      .duration(300)
      .style('opacity', d => state.filters.clusters.has(d.cluster) ? 1 : 0.15) 
      .attr('pointer-events', d => state.filters.clusters.has(d.cluster) ? 'auto' : 'none'); 

  // === TIMER DI PULSAZIONE — SOLO i 3 più pertinenti (e visibili) ===
  if (state.pulseTimer) { state.pulseTimer.stop(); state.pulseTimer = null; }
  const top3Ids = new Set(visibleNodes.slice(0, 3).map(d => d.id));
  if (top3Ids.size > 0) {
    state.pulseTimer = d3.timer((elapsed) => {
      const t = elapsed / 1000; 
      const freq = 1.0; 
      const amp  = 0.10; 
      all.each(function(d) {
        const target = d3.select(this).select('.pulse');
        if (top3Ids.has(d.id)) {
          const scalePulse = 1 + amp * Math.sin(2 * Math.PI * freq * t);
          target.attr('transform', `scale(${scalePulse})`);
        } else {
          target.attr('transform', 'scale(1)');
        }
      });
    });
  } else {
    all.select('.pulse').attr('transform', 'scale(1)');
  }

  function ticked() {
    all.attr('transform', d => {
      const s = d.hovered ? 1.20 : 1; 
      return `translate(${d.x},${d.y}) scale(${s})`;
    });
  }
}

// === Evidenzia selezionato (glow + stroke più spesso) — applicato alla .core
function highlightSelected(id) {
  state.g.selectAll('.node').each(function(d) {
    const core = d3.select(this).select('circle.core');
    if (!core.node()) return;
    if (id && d.id === d.id) {
      // === MODIFICA RICHIESTA: Usa la nuova scala Giallo->Verde
      const relevanceColor = state.scales.relevanceColor(d.score); 
      core.attr('filter', 'url(#glow)').attr('stroke-width', 4).attr('stroke', relevanceColor);
      d3.select(this).raise();
    } else {
      // === MODIFICA RICHIESTA: Usa la nuova scala Giallo->Verde
      const relevanceColor = state.scales.relevanceColor(d.score);
      core.attr('filter', null).attr('stroke-width', 2.5).attr('stroke', relevanceColor);
    }
  });
}

// === Infocard con Story Mode + mini-grafo evidenziato (COMPLETA E CORRETTA) ===
// ... (Nessuna modifica necessaria in showInfoCard, hideInfoCard, drawMiniGraph) ...
function showInfoCard(d) {
  const card = document.getElementById('infocard');
  card.classList.remove('hidden');

  const shared = d.explanation?.shared_entities || [];
  const items = shared.map(se => `<li><b>${se.type}</b>: ${se.label}</li>`).join('');

  // UI base
  card.innerHTML = `
    <button id="closeInfo" class="infocard-close" aria-label="Chiudi">✕</button>
    <h3>${d.label}</h3>
    <div id="storyArea"></div>
    ${!state.storyMode ? `
      <p><b>Pertinenza:</b> ${(d.score * 100).toFixed(1)}%</p>
      <p><b>Motivazione Breve:</b> ${d.explanation?.brief || 'Non specificato'}</p>
      ${shared.length ? `<p><b>Elementi in comune:</b></p><ul>${items}</ul>` : ''}
    ` : ''}
    <div id="miniGraph" style="width:100%;height:220px;margin-top:14px;"></div>
  `;

  // 
  // --- CORREZIONE BUG "X" ---
  // Aggiungi questa riga per collegare la 'X' alla funzione di chiusura
  // Questo deve essere fatto DOPO aver impostato card.innerHTML
  document.getElementById('closeInfo').addEventListener('click', () => hideInfoCard());
  // ------------------------
  

  // Story Mode: narrativa a step
  if (state.storyMode) {
    const briefReason = d.explanation?.brief || 'Coerente con il tuo profilo.';
    const sharedSummary = shared.map(e => `${e.type}: ${e.label}`).join(', ');
    const steps = [
      `<div><b>Step 1: La Raccomandazione.</b> Ti consiglio "${d.label}" con una pertinenza del ${(d.score * 100).toFixed(1)}%.</div>`,
      `<div><b>Step 2: La Categoria.</b> La ragione principale è: <b>${briefReason}</b>.</div>`,
      `<div><b>Step 3: Il Contesto KG.</b> ${shared.length 
          ? `L'algoritmo ha trovato i seguenti elementi chiave in comune che collegano il film alle tue preferenze: <b>${sharedSummary}</b>.` 
          : 'La raccomandazione si basa su una somiglianza generale del profilo, non specificando entità dirette.'}</div>`,
    ];
    let idx = 0;
    const storyArea = document.getElementById('storyArea');
    function renderStep() {
      storyArea.innerHTML = `
        <div style="min-height:64px">${steps[idx]}</div>
        <div style="display:flex; gap:8px; margin-top:8px">
          <button id="prevStep" class="ui-btn" ${idx===0?'disabled':''}>◀</button>
          <button id="nextStep" class="ui-btn" ${idx===steps.length-1?'disabled':''}>▶</button>
        </div>
      `;
      const prev = document.getElementById('prevStep');
      const next = document.getElementById('nextStep');
      prev && (prev.onclick = () => { idx = Math.max(0, idx - 1); renderStep(); });
      next && (next.onclick = () => { idx = Math.min(steps.length - 1, idx + 1); renderStep(); });
    }
    renderStep();
  }

  // mini-grafo con evidenziazione delle entità condivise
  drawMiniGraph(d.explanation?.path_example, shared);
}

function hideInfoCard() {
  highlightSelected(null);
  const card = document.getElementById('infocard');
  if (!card.classList.contains('hidden')) {
    card.classList.add('hidden');
  }
}
// === Mini-grafo (COMPLETA E CORRETTA PER LEGGIBILITÀ) ===
function drawMiniGraph(path, sharedEntities = []) {
  const el = document.getElementById('miniGraph');
  d3.select(el).selectAll('*').remove();

  const width = el.clientWidth || 360;
  const height = el.clientHeight || 220;

  const svg = d3.select(el).append('svg')
    .attr('width', width)
    .attr('height', height);

  const defs = svg.append('defs');
  defs.append('marker')
      .attr('id', 'arrowhead-mini')
      .attr('viewBox', '-0 -5 10 10')
      .attr('refX', 18) 
      .attr('refY', 0)
      .attr('orient', 'auto')
      .attr('markerWidth', 8)
      .attr('markerHeight', 8)
      .append('path')
      .attr('d', 'M 0, -5 L 10, 0 L 0, 5')
      .attr('fill', '#999');


  const sharedLabels = new Set(sharedEntities.map(se => String(se.label).toLowerCase()));

  const nodeShape = (role, type) => {
      if (role === 'user') return d3.symbolCircle;
      if (role === 'item') return d3.symbolSquare;
      if (type === 'actor') return d3.symbolTriangle; 
      if (type === 'director') return d3.symbolDiamond; 
      return d3.symbolCircle;
  };
  
  // Parsa il path: [relazione, tipo_nodo, id_nodo/etichetta]
  const nodes = (Array.isArray(path) ? path : [['self_loop', 'user', 'Utente'], ['RELATED', 'entity', 'Motivo'], ['ASSOCIATED_WITH', 'movie', 'Item']]).map((step, i) => {
    let label = String(step[2]); 
    let type = String(step[1]);
    // La relazione è quella che porta a questo nodo (dal nodo precedente)
    let relation = i > 0 ? String(step[0]) : null; // Usa la relazione dal path
    const low = type.toLowerCase();
    
    let role;
    if (low === 'user') role = 'user';
    else if (low === 'movie') role = 'item';
    else role = 'entity';
    
    const isShared = [...sharedLabels].some(sl => label.toLowerCase().includes(sl));
    
    return { id: i, label, type, relation, isShared, role, x: null, y: null };
  });
  
  const realLinks = nodes.slice(1).map((d, i) => ({ 
      source: nodes[i].id, 
      target: d.id, 
      label: d.relation || 'LINK'
})).filter(l => l.source !== 0 || (nodes[0] && nodes[0].type !== 'self_loop')); // Filtra i link che partono da self_loop

  // Rimuovi il primo nodo se è self_loop (comune nel tuo mock)
  const finalNodes = nodes.filter(n => !(n.type === 'self_loop' && n.id === 0));


  const sim = d3.forceSimulation(finalNodes)
    .force('link', d3.forceLink(realLinks).id(d => d.id).distance(100))
    .force('charge', d3.forceManyBody().strength(-200))
    .force('center', d3.forceCenter(width / 2, height / 2 + 30)); 

  const link = svg.append('g')
    .attr('stroke', '#999')
    .selectAll('line')
    .data(realLinks)
    .enter().append('line')
    .attr('stroke-width', 1.5)
     .attr('marker-end', 'url(#arrowhead-mini)'); 

  const node = svg.append('g')
    .selectAll('.mini-node')
    .data(finalNodes)
    .enter().append('path') 
    .attr('d', d => d3.symbol(nodeShape(d.role, d.type), d.isShared ? 300 : 200)()) 
    .attr('fill', d => d.role === 'user' ? '#4c8bf5' : d.role === 'item' ? '#7e57c2' : (d.isShared ? '#f39c12' : '#69b3a2'))
    .attr('stroke', d => d.isShared ? '#d35400' : '#2c3e50')
    .attr('stroke-width', d => d.isShared ? 2 : 1.2);
  
  const linkLabels = svg.append('g')
    .selectAll('.link-label')
    .data(realLinks)
    .enter().append('text')
    .attr('class', 'link-label')
    .text(d => d.label.length > 15 ? d.label.slice(0, 13) + '…' : d.label)
    .attr('font-size', '9px')
    .attr('fill', '#f3f4f6') // CORREZIONE: Colore testo chiaro
    .attr('text-anchor', 'middle')
    .style('user-select', 'none');

  const labels = svg.append('g')
    .selectAll('text')
    .data(finalNodes)
    .enter().append('text')
    .text(d => d.label.length > 20 ? d.label.slice(0, 18) + '…' : d.label)
    .attr('font-size', '11px')
    .attr('text-anchor', 'middle')
    .attr('dy', 25) 
    .attr('fill', '#f3f4f6') // CORREZIONE: Colore testo chiaro
    .attr('font-weight', d => d.isShared ? '700' : '400');

  sim.on('tick', () => {
    link.attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);
    
    linkLabels
        .attr('x', d => (d.source.x + d.target.x) / 2)
        .attr('y', d => (d.source.y + d.target.y) / 2 - 5); 

    node.attr('transform', d => `translate(${d.x},${d.y})`);

    labels.attr('x', d => d.x)
          .attr('y', d => d.y);
  });
}

// === Caricamento e binding controlli ===
async function load(userId, topK) {
  initSVG();
  // CORREZIONE CRITICA: Aggiunto await per caricare i dati prima di renderizzare
  const [dataA, theme] = await Promise.all([API.fetchRecs(userId, topK), API.fetchTheme()]); 
  state.rawData = dataA;
  state.theme = theme;
  renderNodesFiltered();
}

function bindControls() {
  const user = document.getElementById('userId');
  const topK = document.getElementById('topK');
  const topKVal = document.getElementById('topKVal');
  document.getElementById('reload').addEventListener('click', () => load(+user.value, +topK.value));
  topK.addEventListener('input', () => topKVal.textContent = topK.value);
}

document.addEventListener('DOMContentLoaded', async () => {
  bindControls();
  await load(1, 20);
});