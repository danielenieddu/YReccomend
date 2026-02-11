function resolveLabel(originalLabel) {
  return originalLabel;
}

const FallbackTheme = {
  defaults: { icon: 'assets/icons/default.svg', color: '#888' },
  types: {} 
};

const API = {
  async fetchRecs(userId, k) {
    const res = await fetch('data/mock_recs.json');
    if (!res.ok) throw new Error('mock_recs.json non trovato');
    const data = await res.json();
    
    //prende Top K
    data.recommendations = data.recommendations
        .sort((a, b) => b.score - a.score) 
        .slice(0, k); 
        
    console.log('[UI] caricati', data.recommendations.length, 'item (Richiesti:', k, ')');
    return data;
  },
  async fetchTheme() {
    try {
      const r = await fetch('data/theme.json');
      if (!r.ok) return FallbackTheme;
      return await r.json();
    } catch (e) {
      console.warn("Impossibile caricare theme.json, uso fallback.");
      return FallbackTheme;
    }
  }
};

const state = {
  svg: null, g: null, defs: null, bg: null, zoom: null, width: 0, height: 0,
  scales: {
    size: d3.scalePow().exponent(2).domain([0, 1]).range([10, 70]),
    relevanceColor: d3.scaleLinear()
      .domain([0, 0.4, 0.7, 0.85, 1]) 
      .range(['#ef4444', '#f97316', '#eab308', '#84cc16', '#00ff9d']) 
      .interpolate(d3.interpolateHcl) 
  },
  sizeSettings: { exp: 2, minR: 15, maxR: 75 },
  layoutMode: 'concentric',
  confidence: 3, 
  pulseCount: 3, 
  storyMode: false,
  tooltip: null,
  rawData: null,
  theme: null,
  filters: { types: new Set() },
  pulseTimer: null,
  selectedNodeId: null,
  isGraphExpanded: false 
};

function cleanupUI() {
  d3.selectAll('#filtersPanel').remove();
  d3.selectAll('#prefsPanel').remove();
  d3.selectAll('#graphPanel').remove(); 
  d3.selectAll('.tooltip').remove();
}

function initSVG() {
  cleanupUI(); 

  const chartContainer = document.getElementById('chart');
  chartContainer.style.overflow = 'hidden'; 
  chartContainer.style.background = 'radial-gradient(circle at center, #1e293b 0%, #0f172a 100%)';
  
  state.width = chartContainer.clientWidth;
  state.height = chartContainer.clientHeight;
  
  d3.select('#chart').selectAll('*').remove();

  state.svg = d3.select('#chart')
    .append('svg')
    .attr('width', state.width)
    .attr('height', state.height)
    .style('font-family', '"Inter", system-ui, sans-serif');

  state.defs = state.svg.append('defs');
  defineGlowFilter();
  defineDropShadow(); 

  state.defs.append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '-0 -5 10 10')
      .attr('refX', 20) 
      .attr('refY', 0)
      .attr('orient', 'auto')
      .attr('markerWidth', 8)
      .attr('markerHeight', 8)
      .append('path')
      .attr('d', 'M 0, -5 L 10, 0 L 0, 5')
      .attr('fill', '#cbd5e1'); 

  state.bg = state.svg.append('rect')
    .attr('class', 'bg-close')
    .attr('x', 0).attr('y', 0)
    .attr('width', state.width)
    .attr('height', state.height)
    .attr('fill', 'transparent')
    .on('click', () => hideInfoCard());

  state.g = state.svg.append('g');

  state.zoom = d3.zoom()
    .scaleExtent([0.5, 6])
    .on('zoom', e => state.g.attr('transform', e.transform));
  state.svg.call(state.zoom);

  state.tooltip = d3.select('body').append('div')
    .attr('class', 'tooltip')
    .style('opacity', 0)
    .style('position', 'absolute')
    .style('background', 'rgba(15, 23, 42, 0.95)')
    .style('color', '#f1f5f9')
    .style('padding', '8px 12px')
    .style('border', '1px solid rgba(255,255,255,0.1)')
    .style('border-radius', '6px')
    .style('font-size', '12px')
    .style('pointer-events', 'none')
    .style('box-shadow', '0 4px 6px rgba(0,0,0,0.3)')
    .style('z-index', '100');

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') hideInfoCard();
  }, { passive: true });
}

function resetView() {
    state.svg.transition()
        .duration(750)
        .call(state.zoom.transform, d3.zoomIdentity);
}

function defineGradient(id, startColor, endColor) {
    if (state.defs.select(`#${id}`).node()) return;
    const gradient = state.defs.append('radialGradient')
        .attr('id', id)
        .attr('cx', '30%') 
        .attr('cy', '30%')
        .attr('r', '70%');

    gradient.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', startColor)
        .attr('stop-opacity', 1);
    
    gradient.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', endColor)
        .attr('stop-opacity', 1);
}

function defineIconPattern(id, iconHref, color) {
    const brightColor = d3.color(color).brighter(0.3).hex();
    const darkColor = d3.color(color).darker(0.8).hex(); 
    defineGradient(`grad-${id}`, brightColor, darkColor); 
    
    const pat = state.defs.append('pattern')
        .attr('id', id)
        .attr('patternUnits', 'objectBoundingBox')
        .attr('patternContentUnits', 'objectBoundingBox')
        .attr('width', 1)
        .attr('height', 1);

    pat.append('rect')
        .attr('x', 0).attr('y', 0)
        .attr('width', 1).attr('height', 1)
        .attr('fill', `url(#grad-${id})`); 

    pat.append('image')
        .attr('href', iconHref)
        .attr('x', 0.20)
        .attr('y', 0.20)
        .attr('width', 0.60) 
        .attr('height', 0.60)
        .attr('preserveAspectRatio', 'xMidYMid meet')
        .style('filter', 'drop-shadow(0px 2px 2px rgba(0,0,0,0.5))') 
        .on('error', function() {});
}

function defineGlowFilter() {
  if (state.defs.select('#glow').node()) return;
  const f = state.defs.append('filter')
    .attr('id', 'glow')
    .attr('x', '-50%').attr('y', '-50%')
    .attr('width', '200%').attr('height', '200%');
  
  f.append('feGaussianBlur')
    .attr('stdDeviation', '4') 
    .attr('result', 'coloredBlur');
    
  const m = f.append('feMerge');
  m.append('feMergeNode').attr('in', 'coloredBlur');
  m.append('feMergeNode').attr('in', 'SourceGraphic');
}

function defineDropShadow() {
    if (state.defs.select('#drop-shadow').node()) return;
    const filter = state.defs.append('filter')
        .attr('id', 'drop-shadow')
        .attr('height', '130%');
    
    filter.append('feGaussianBlur')
        .attr('in', 'SourceAlpha')
        .attr('stdDeviation', 3)
        .attr('result', 'blur');

    filter.append('feOffset')
        .attr('in', 'blur')
        .attr('dx', 2)
        .attr('dy', 3)
        .attr('result', 'offsetBlur');
    
    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'offsetBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');
}

//legge direttamente l'etichetta fornita dal backend
function identifyStrategy(expl) {
  if (expl && expl.strategy_label) {
      return expl.strategy_label;
  }
  return 'Affinità Globale';
}

function applyPanelStyle(panel) {
    panel.style.background = 'rgba(30, 41, 59, 0.75)'; 
    panel.style.backdropFilter = 'blur(12px)';
    panel.style.webkitBackdropFilter = 'blur(12px)';
    panel.style.border = '1px solid rgba(255, 255, 255, 0.08)';
    panel.style.borderRadius = '12px';
    panel.style.boxShadow = '0 8px 32px rgba(0,0,0,0.4)';
    panel.style.padding = '16px';
    panel.style.color = '#f8fafc';
    panel.style.fontFamily = '"Inter", system-ui, sans-serif';
    panel.style.fontSize = '13px';
    panel.style.transition = 'all 0.3s ease';
}

//gestisce il k.g. con anche l opzione full screen 
function buildGraphPanel() {
  d3.selectAll('#graphPanel').remove();

  let panel = document.createElement('div');
  panel.id = 'graphPanel';
  
  panel.style.position = 'absolute';
  panel.style.background = 'rgba(15, 23, 42, 0.90)'; 
  panel.style.backdropFilter = 'blur(16px)';        
  panel.style.webkitBackdropFilter = 'blur(16px)';
  panel.style.border = '1px solid rgba(255, 255, 255, 0.1)';
  panel.style.borderRadius = '16px';                  
  panel.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)'; 
  panel.style.padding = '20px';                       
  panel.style.color = '#f1f5f9';
  panel.style.fontFamily = '"Inter", system-ui, sans-serif';
  panel.style.display = 'flex';     
  panel.style.flexDirection = 'column';
  panel.style.zIndex = '900'; 
  panel.style.transition = 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)'; 

  resetPanelDimensions(panel);

  document.body.appendChild(panel);
  
  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.marginBottom = '12px';
  header.style.borderBottom = '1px solid rgba(255,255,255,0.1)'; 
  header.style.paddingBottom = '8px';
  header.style.flexShrink = '0';

  const title = document.createElement('div');
  title.style.fontWeight = '700';
  title.style.textTransform = 'uppercase';
  title.style.fontSize = '11px'; 
  title.style.letterSpacing = '1px';
  title.style.color = '#94a3b8'; 
  title.innerHTML = '<span style="color:#e2e8f0">Knowledge Graph</span> <span style="color:#60a5fa">Path</span>';
  
  const expandBtn = document.createElement('button');
  expandBtn.innerHTML = '⤢'; 
  expandBtn.title = "Espandi a tutto schermo";
  expandBtn.style.background = 'transparent';
  expandBtn.style.border = '1px solid rgba(255,255,255,0.2)';
  expandBtn.style.color = '#cbd5e1';
  expandBtn.style.borderRadius = '4px';
  expandBtn.style.cursor = 'pointer';
  expandBtn.style.width = '24px';
  expandBtn.style.height = '24px';
  expandBtn.style.display = 'flex';
  expandBtn.style.alignItems = 'center';
  expandBtn.style.justifyContent = 'center';
  expandBtn.style.fontSize = '14px';
  expandBtn.style.transition = 'all 0.2s';

  expandBtn.onmouseover = () => { expandBtn.style.background = 'rgba(255,255,255,0.1)'; expandBtn.style.color = 'white'; };
  expandBtn.onmouseout = () => { expandBtn.style.background = 'transparent'; expandBtn.style.color = '#cbd5e1'; };
  
  expandBtn.onclick = () => {
    state.isGraphExpanded = !state.isGraphExpanded;
    
    if (state.isGraphExpanded) {
        panel.style.position = 'fixed';
        panel.style.zIndex = '2000'; 
        
        panel.style.top = '20px';
        panel.style.left = '20px';
        panel.style.right = '20px';  
        panel.style.bottom = '20px'; 
        
        panel.style.width = 'auto';  
        panel.style.height = 'auto'; 
        
        expandBtn.innerHTML = '✕'; 
        expandBtn.title = "Riduci";
    } else {
        resetPanelDimensions(panel);
        expandBtn.innerHTML = '⤢';
        expandBtn.title = "Espandi a tutto schermo";
    }

    setTimeout(() => {
        refreshGraphContent();
    }, 350);
  };

  header.appendChild(title);
  header.appendChild(expandBtn);
  panel.appendChild(header);

  const graphContainer = document.createElement('div');
  graphContainer.id = 'graphVizContainer';
  graphContainer.style.width = '100%';
  graphContainer.style.flex = '1'; 
  graphContainer.style.background = 'transparent'; 
  graphContainer.style.borderRadius = '8px';
  graphContainer.style.display = 'flex';
  graphContainer.style.alignItems = 'center';
  graphContainer.style.justifyContent = 'center';
  graphContainer.style.overflow = 'hidden'; 
  graphContainer.style.position = 'relative';
  
  graphContainer.innerHTML = '<div style="text-align:center; opacity:0.6"><span style="display:block; font-size:24px; margin-bottom:10px">☍</span></div>';
  
  panel.appendChild(graphContainer);
}

function resetPanelDimensions(panel) {
  panel.style.position = 'absolute';
  panel.style.top = '120px'; 
  panel.style.right = '20px';
  panel.style.left = 'auto'; 
  panel.style.bottom = 'auto';
  panel.style.height = '35%'; 
  panel.style.width = '320px';
  panel.style.zIndex = '900';
}

function refreshGraphContent() {
    if (state.selectedNodeId) {
        const allNodes = makeNodes(state.rawData);
        const currentNode = allNodes.find(n => n.id === state.selectedNodeId);
        if (currentNode) {
            drawMiniGraph(currentNode.explanation?.path_example, currentNode.explanation?.shared_entities);
        } else {
            drawGlobalOverview();
        }
    } else {
        drawGlobalOverview();
    }
}

function drawGlobalOverview() {
  const el = document.getElementById('graphVizContainer');
  if(!el || !state.rawData) return;

  d3.select(el).selectAll('*').remove();

  const width = el.clientWidth || 320;
  const height = el.clientHeight || 200;

  const isBig = state.isGraphExpanded;
  const kItems = isBig ? 30 : 15; 
  const dist = isBig ? 200 : 70;  
  const charge = isBig ? -300 : -40; 
  const nodeBaseR = isBig ? 8 : 4;   
  const fontSizeUser = isBig ? '16px' : '11px';
  const fontSizeItem = isBig ? '12px' : '9px';

  const svg = d3.select(el).append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`);

  const topItems = state.rawData.recommendations.slice(0, kItems);

  const nodes = [
    { id: 'USER', label: 'Tu', type: 'user', r: isBig ? 25 : 12, fx: width/2, fy: height/2 }, 
    ...topItems.map(item => ({
      id: item.item_id,
      label: item.label,
      type: 'item',
      score: item.score,
      r: nodeBaseR + (item.score * (isBig ? 12 : 5))
    }))
  ];

  const links = topItems.map(item => ({
    source: item.item_id,
    target: 'USER'
  }));

  const sim = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id).distance(dist)) 
    .force('charge', d3.forceManyBody().strength(charge)) 
    .force('collide', d3.forceCollide().radius(d => d.r + 5))
    .force('center', d3.forceCenter(width / 2, height / 2));

  const link = svg.append('g')
    .attr('stroke', '#334155')
    .selectAll('line')
    .data(links)
    .enter().append('line')
    .attr('stroke-width', isBig ? 2 : 1)
    .attr('opacity', 0.5);

  const node = svg.append('g')
    .selectAll('circle')
    .data(nodes)
    .enter().append('circle')
    .attr('r', d => d.r)
    .attr('fill', d => {
        if(d.type === 'user') return '#3b82f6'; 
        return state.scales.relevanceColor(d.score);
    })
    .attr('stroke', '#1e293b')
    .attr('stroke-width', isBig ? 3 : 1.5)
    .style('cursor', d => d.type === 'item' ? 'pointer' : 'default');

  const labels = svg.append('g')
    .selectAll('text')
    .data(nodes)
    .enter().append('text')
    .text(d => {
        if(d.type === 'user') return 'TU';
        const cut = isBig ? 25 : 10;
        return d.label.length > cut ? d.label.substring(0, cut-2)+'..' : d.label;
    })
    .attr('font-size', d => d.type === 'user' ? fontSizeUser : fontSizeItem)
    .attr('font-weight', d => d.type === 'user' ? 'bold' : 'normal')
    .attr('fill', '#94a3b8')
    .attr('text-anchor', 'middle')
    .attr('dy', d => d.r + (isBig ? 20 : 12))
    .attr('opacity', d => d.type === 'user' || d.score > 0.85 || isBig ? 1 : 0); 

  sim.on('tick', () => {
    link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    node.attr('cx', d => d.x).attr('cy', d => d.y);
    labels.attr('x', d => d.x).attr('y', d => d.y);
  });
}

function drawMiniGraph(path, sharedEntities = []) {
  const el = document.getElementById('graphVizContainer');
  if(!el) return;

  d3.select(el).selectAll('*').remove();
  
  if(!path) {
      drawGlobalOverview();
      return;
  }
  
  d3.select(el).html('');

  const width = el.clientWidth || 320;
  const height = el.clientHeight || 200;

  const isBig = state.isGraphExpanded;
  const linkDist = isBig ? 250 : 80;
  const chargeStr = isBig ? -800 : -200;
  const iconSize = isBig ? 400 : 180; 
  const fontSizeLabel = isBig ? '14px' : '11px';
  const fontSizeLink = isBig ? '11px' : '9px';

  const svg = d3.select(el).append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`); 
    
  const defs = svg.append('defs');
  defs.append('marker')
      .attr('id', 'arrowhead-mini')
      .attr('viewBox', '-0 -5 10 10')
      .attr('refX', isBig ? 24 : 16) 
      .attr('refY', 0)
      .attr('orient', 'auto')
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .append('path')
      .attr('d', 'M 0, -5 L 10, 0 L 0, 5')
      .attr('fill', '#64748b'); 

  const sharedLabels = new Set(sharedEntities.map(se => String(se.label).toLowerCase()));

  const nodeShape = (role) => {
      switch(role) {
          case 'source_entity': return d3.symbolCircle;
          case 'target_item':   return d3.symbolSquare; 
          case 'history_item':  return d3.symbolSquare; 
          case 'context_entity': return d3.symbolDiamond; 
          default: return d3.symbolCircle;
      }
  };
  
  const nodes = (Array.isArray(path) ? path : []).map((step, i) => {
    const original = step.label; 
    const label = resolveLabel(original); 
    const type = step.type;
    const role = step.role; 
    const relation = step.relation;
    
    const isShared = [...sharedLabels].some(sl => original.toLowerCase().includes(sl));
    
    return { id: i, label, type, role, relation, isShared, x: null, y: null };
  });
  
  const realLinks = nodes.slice(1).map((d, i) => ({ 
      source: nodes[i].id, 
      target: d.id, 
      label: d.relation || 'LINK'
  })).filter(l => l.source !== 0 || (nodes[0] && nodes[0].relation !== 'self_loop')); 

  const finalNodes = nodes.filter(n => !(n.relation === 'self_loop' && n.id === 0));

  const sim = d3.forceSimulation(finalNodes)
    .force('link', d3.forceLink(realLinks).id(d => d.id).distance(linkDist)) 
    .force('charge', d3.forceManyBody().strength(chargeStr)) 
    .force('center', d3.forceCenter(width / 2, height / 2)); 

  const link = svg.append('g')
    .attr('stroke', '#475569') 
    .selectAll('line')
    .data(realLinks)
    .enter().append('line')
    .attr('stroke-width', 1)
     .attr('marker-end', 'url(#arrowhead-mini)'); 

  const node = svg.append('g')
    .selectAll('.mini-node')
    .data(finalNodes)
    .enter().append('path') 
    .attr('d', d => d3.symbol(nodeShape(d.role), d.isShared ? (isBig?600:300) : iconSize)()) 
    .attr('fill', d => {
        if (d.role === 'source_entity') return '#3b82f6'; 
        if (d.role === 'target_item' || d.role === 'history_item') return '#a855f7'; 
        if (d.isShared) return '#f59e0b'; 
        return '#10b981'; 
    })
    .attr('stroke', '#1e293b') 
    .attr('stroke-width', 1.5);
  
  const linkLabels = svg.append('g')
    .selectAll('.link-label')
    .data(realLinks)
    .enter().append('text')
    .attr('class', 'link-label')
    .text(d => d.label.toLowerCase())
    .attr('font-size', fontSizeLink) 
    .attr('fill', '#94a3b8')
    .attr('text-anchor', 'middle')
    .style('user-select', 'none');

  const labels = svg.append('g')
    .selectAll('text')
    .data(finalNodes)
    .enter().append('text')
    .text(d => {
        const cut = isBig ? 40 : 18;
        return d.label.length > cut ? d.label.slice(0, cut-2) + '…' : d.label;
    })
    .attr('font-size', fontSizeLabel) 
    .attr('text-anchor', 'middle')
    .attr('dy', isBig ? 36 : 24) 
    .attr('fill', '#e2e8f0')
    .attr('font-weight', d => d.isShared ? '700' : '400');

  sim.on('tick', () => {
    link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    linkLabels.attr('x', d => (d.source.x + d.target.x) / 2).attr('y', d => (d.source.y + d.target.y) / 2 - 3); 
    node.attr('transform', d => `translate(${d.x},${d.y})`);
    labels.attr('x', d => d.x).attr('y', d => d.y);
  });
}

function buildFiltersPanel(nodesAll, colorFor) {
  d3.selectAll('#filtersPanel').remove();

  const availableTypes = Array.from(new Set(nodesAll.map(n => n.type)));

  let panel = document.createElement('div');
  panel.id = 'filtersPanel';
  panel.style.position = 'absolute';
  panel.style.left = '20px';
  panel.style.top = '120px';
  panel.style.zIndex = '10';
  applyPanelStyle(panel); 
  document.body.appendChild(panel);
  
  const title = document.createElement('div');
  title.style.fontWeight = '700';
  title.style.marginBottom = '12px';
  title.style.textTransform = 'uppercase';
  title.style.fontSize = '11px';
  title.style.letterSpacing = '1px';
  title.style.color = '#94a3b8';
  title.textContent = 'Filtra per Tipo'; 
  panel.appendChild(title);

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '8px';
  actions.style.marginBottom = '12px';

  const btnStyle = 'background: rgba(255,255,255,0.1); border: none; color: white; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 11px;';

  const btnAll = document.createElement('button');
  btnAll.textContent = 'Tutti';
  btnAll.style.cssText = btnStyle;
  btnAll.onmouseover = () => btnAll.style.background = 'rgba(255,255,255,0.2)';
  btnAll.onmouseout = () => btnAll.style.background = 'rgba(255,255,255,0.1)';
  btnAll.onclick = () => {
    state.filters.types = new Set(availableTypes);
    buildFiltersPanel(nodesAll, colorFor);
    renderNodesFiltered();
  };

  const btnNone = document.createElement('button');
  btnNone.textContent = 'Nessuno';
  btnNone.style.cssText = btnStyle;
  btnNone.onmouseover = () => btnNone.style.background = 'rgba(255,255,255,0.2)';
  btnNone.onmouseout = () => btnNone.style.background = 'rgba(255,255,255,0.1)';
  btnNone.onclick = () => {
    state.filters.types.clear();
    buildFiltersPanel(nodesAll, colorFor);
    renderNodesFiltered();
  };

  actions.appendChild(btnAll);
  actions.appendChild(btnNone);
  panel.appendChild(actions);

  availableTypes.sort().forEach(typeStr => {
    const row = document.createElement('label');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '8px';
    row.style.margin = '6px 0';
    row.style.cursor = 'pointer';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = state.filters.types.has(typeStr);
    cb.style.accentColor = '#3b82f6'; 
    cb.onchange = () => {
      if (cb.checked) state.filters.types.add(typeStr);
      else state.filters.types.delete(typeStr);
      renderNodesFiltered();
    };

    const typeColor = colorFor(typeStr) || '#888';
    const dot = document.createElement('div');
    dot.style.width = '8px';
    dot.style.height = '8px';
    dot.style.borderRadius = '50%';
    dot.style.background = typeColor;

    const span = document.createElement('span');
    const displayLabel = typeStr.charAt(0).toUpperCase() + typeStr.slice(1);
    span.textContent = displayLabel;
    span.style.fontSize = '12px';
    span.style.opacity = state.filters.types.has(typeStr) ? '1' : '0.5';

    row.appendChild(cb);
    row.appendChild(dot);
    row.appendChild(span);
    panel.appendChild(row);
  });
}

function buildPrefsPanel() {
  d3.selectAll('#prefsPanel').remove();

  let panel = document.createElement('div');
  panel.id = 'prefsPanel';
  panel.style.position = 'absolute';
  panel.style.left = '20px';
  panel.style.top = '320px'; 
  panel.style.zIndex = '10';
  applyPanelStyle(panel);
  document.body.appendChild(panel);
  
  const head = document.createElement('div');
  head.style.fontWeight = '700';
  head.style.marginBottom = '12px';
  head.style.textTransform = 'uppercase';
  head.style.fontSize = '11px';
  head.style.letterSpacing = '1px';
  head.style.color = '#94a3b8';
  head.textContent = 'Configurazione Vista';
  panel.appendChild(head);

  const confContainer = document.createElement('div');
  confContainer.style.marginBottom = '12px';
  confContainer.style.paddingBottom = '12px';
  confContainer.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
  
  const confHeader = document.createElement('div');
  confHeader.style.display = 'flex';
  confHeader.style.justifyContent = 'space-between';
  confHeader.style.fontSize = '11px';
  confHeader.style.marginBottom = '6px';
  
  const confLabel = document.createElement('span'); 
  confLabel.textContent = 'Filtro Rilevanza';
  
  const confValue = document.createElement('span');
  const getConfText = (v) => (v==1 ? 'Alta (>90%)' : v==2 ? 'Media (>75%)' : 'Bassa (Tutti)');
  const getConfColor = (v) => (v==1 ? '#4ade80' : v==2 ? '#fbbf24' : '#f472b6');
  
  confValue.textContent = getConfText(state.confidence);
  confValue.style.fontWeight = 'bold';
  confValue.style.color = getConfColor(state.confidence);

  confHeader.appendChild(confLabel); 
  confHeader.appendChild(confValue);
  
  const confInput = document.createElement('input');
  confInput.type = 'range'; 
  confInput.min = 1; 
  confInput.max = 3; 
  confInput.step = 1; 
  confInput.value = state.confidence;
  confInput.style.width = '100%';
  confInput.style.accentColor = getConfColor(state.confidence);
  confInput.style.cursor = 'pointer';

  confInput.oninput = () => {
      const val = Number(confInput.value);
      confValue.textContent = getConfText(val);
      confValue.style.color = getConfColor(val);
      confInput.style.accentColor = getConfColor(val);
  };
  
  confInput.onchange = () => {
      state.confidence = Number(confInput.value);
      renderNodesFiltered();
  };
  
  confContainer.appendChild(confHeader);
  confContainer.appendChild(confInput);
  panel.appendChild(confContainer);

  //Layout
  const rowLayout = document.createElement('div');
  rowLayout.style.marginBottom = '10px';
  const lblLayout = document.createElement('div');
  lblLayout.textContent = 'Modalità Layout';
  lblLayout.style.fontSize = '11px'; lblLayout.style.marginBottom='4px';
  
  const selLayout = document.createElement('select');
  selLayout.style.width = '100%';
  selLayout.style.background = 'rgba(0,0,0,0.3)';
  selLayout.style.color = 'white';
  selLayout.style.border = '1px solid rgba(255,255,255,0.2)';
  selLayout.style.padding = '4px';
  selLayout.style.borderRadius = '4px';

  ['concentric','grid','cluster'].forEach(v => {
    const o = document.createElement('option');
    o.value = v; o.textContent = (v === 'concentric' ? 'Orbitali' : v === 'grid' ? 'Griglia' : 'Cluster');
    if (v === state.layoutMode) o.selected = true;
    selLayout.appendChild(o);
  });
  selLayout.onchange = () => { state.layoutMode = selLayout.value; renderNodesFiltered(); };
  rowLayout.appendChild(lblLayout); rowLayout.appendChild(selLayout);
  panel.appendChild(rowLayout);

  const createSlider = (label, min, max, step, val, onChange) => {
      const container = document.createElement('div');
      container.style.marginBottom = '10px';
      const header = document.createElement('div');
      header.style.display = 'flex';
      header.style.justifyContent = 'space-between';
      header.style.fontSize = '11px';
      
      const l = document.createElement('span'); l.textContent = label;
      const v = document.createElement('span'); v.textContent = val;
      header.appendChild(l); header.appendChild(v);
      
      const inp = document.createElement('input');
      inp.type = 'range'; inp.min=min; inp.max=max; inp.step=step; inp.value=val;
      inp.style.width = '100%';
      inp.style.accentColor = '#3b82f6';
      
      inp.oninput = () => { v.textContent = inp.value; };
      inp.onchange = () => onChange(Number(inp.value));
      
      container.appendChild(header);
      container.appendChild(inp);
      return container;
  };

  panel.appendChild(createSlider('Evidenzia Top', 1, 5, 1, state.pulseCount, (v) => {
      state.pulseCount = v; 
      renderNodesFiltered();
  }));

  panel.appendChild(createSlider('Distanza Nodi', 40, 110, 1, state.sizeSettings.maxR, (v) => {
      state.sizeSettings.maxR = v; renderNodesFiltered();
  }));
  
  const resetBtn = document.createElement('button');
  resetBtn.textContent = 'Centra Vista';
  resetBtn.style.cssText = 'width: 100%; background: rgba(59, 130, 246, 0.2); border: 1px solid rgba(59, 130, 246, 0.5); color: #60a5fa; padding: 6px; border-radius: 4px; cursor: pointer; margin-top: 8px; font-size:12px;';
  resetBtn.onmouseover = () => resetBtn.style.background = 'rgba(59, 130, 246, 0.3)';
  resetBtn.onmouseout = () => resetBtn.style.background = 'rgba(59, 130, 246, 0.2)';
  resetBtn.onclick = resetView;
  panel.appendChild(resetBtn);

  const rowStory = document.createElement('label');
  rowStory.style.display = 'flex'; rowStory.style.alignItems='center'; rowStory.style.gap='8px'; rowStory.style.marginTop='12px'; rowStory.style.cursor='pointer';
  const chkStory = document.createElement('input');
  chkStory.type = 'checkbox'; chkStory.checked = state.storyMode;
  chkStory.style.accentColor = '#10b981';
  chkStory.onchange = () => { state.storyMode = chkStory.checked; };
  rowStory.appendChild(chkStory);
  
  const txtStory = document.createElement('span');
  txtStory.innerHTML = 'Attiva <b>Story Mode</b>';
  txtStory.style.fontSize = '12px';
  rowStory.appendChild(txtStory);
  
  panel.appendChild(rowStory);
}

function makeNodes(dataA) {
  return dataA.recommendations.map(r => ({
    id: r.item_id,
    label: r.label,
    type: r.type,
    score: r.score,
    explanation: r.explanation,
    strategy: identifyStrategy(r.explanation), 
    cluster: identifyStrategy(r.explanation), 
    hovered: false,
    isExcluded: false 
  }));
}

function auraColor(score) {
    const solidColor = state.scales.relevanceColor(score);
    const color = d3.color(solidColor);
    const op = d3.scaleLinear().domain([0.0, 1.0]).range([0.3, 0.7]); 
    return color.copy({opacity: op(score)}).toString();
}

function renderNodesFiltered() {
  if (!state.rawData || !state.theme) return;

  state.scales.size = d3.scalePow()
    .exponent(state.sizeSettings.exp)
    .domain([0, 1])
    .range([state.sizeSettings.minR, state.sizeSettings.maxR]);

  const nodesAll = makeNodes(state.rawData);

  state.defs.selectAll('pattern').remove();
  const defaults = state.theme?.defaults || FallbackTheme.defaults;
  const typesCfg = state.theme?.types || {};
  const iconFor  = t => (typesCfg[t] && typesCfg[t].icon)  || defaults.icon;
  const colorFor = t => (typesCfg[t] && typesCfg[t].color) || defaults.color;

  const typesSet = [...new Set(nodesAll.map(n => n.type))];
  typesSet.forEach(t => defineIconPattern(`pat-${t}`, iconFor(t), colorFor(t)));

  buildFiltersPanel(nodesAll, colorFor);
  buildPrefsPanel();

  if(!document.getElementById('graphPanel')) buildGraphPanel();

  let minScore = 0;
  if (state.confidence === 1) minScore = 0.90;      
  else if (state.confidence === 2) minScore = 0.75; 

  nodesAll.forEach(n => {
      const matchesScore = n.score >= minScore;
      const matchesType = state.filters.types.has(n.type);
      n.isExcluded = !(matchesScore && matchesType);
  });

  const nodes = nodesAll.sort((a, b) => {
      if (a.isExcluded !== b.isExcluded) {
          return a.isExcluded ? 1 : -1; 
      }
      return b.score - a.score; 
  });

  const sidebarOffset = 120;
  const cx = (state.width / 2) + sidebarOffset; 
  const cy = (state.height / 2) - 40; 
  const minSide = Math.min(state.width - sidebarOffset, state.height);

  if (state.layoutMode === 'concentric') {
    const maxR = 0.35 * minSide; 
    const N = nodes.length;
    nodes.forEach((n, i) => {
        n.targetR = (N > 1 ? i / (N - 1) : 0) * maxR;
    });
    nodes.forEach((n, i) => {
      const ang = (i * 137.5) * (Math.PI / 180); 
      const r0 = n.targetR * 0.5;
      n.tx = cx + Math.cos(ang) * r0;
      n.ty = cy + Math.sin(ang) * r0;
      if (n.x === undefined) { n.x = n.tx; n.y = n.ty; }
    });
  } else if (state.layoutMode === 'grid') {
    const N = nodes.length;
    const cols = Math.ceil(Math.sqrt(N * 1.5));
    const cell = state.sizeSettings.maxR * 1.8 + 20;
    nodes.forEach((n, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      n.gx = cx + (c - cols/2) * cell;
      n.gy = cy + (r - (N/cols)/2) * cell;
      if (n.x === undefined) { n.x = n.gx; n.y = n.gy; }
    });
  } else { 
    //organizza in Cluster
    const groups = Array.from(new Set(nodes.map(n => n.strategy)));
    const radius = 0.30 * minSide;
    const centers = {};
    groups.forEach((g, idx) => {
      const ang = (2 * Math.PI * idx) / groups.length - Math.PI/2;
      centers[g] = { x: cx + Math.cos(ang) * radius, y: cy + Math.sin(ang) * radius };
    });
    nodes.forEach(n => {
      const c = centers[n.strategy];
      n.center = c;
      if (n.x === undefined) { 
          n.x = c.x + (Math.random()-0.5)*50; 
          n.y = c.y + (Math.random()-0.5)*50; 
      }
    });
  }

  let sim = null;
  const padding = 100;
  
  if (state.layoutMode === 'concentric') {
    sim = d3.forceSimulation(nodes)
      .force('radial', d3.forceRadial(d => d.targetR, cx, cy).strength(0.8))
      .force('collision', d3.forceCollide().radius(d => state.scales.size(d.score) * 1.3))
      .force('keepInBox', () => {
          nodes.forEach(node => {
              if (node.y > state.height - padding) node.vy -= 0.5; 
              if (node.x < 280) node.vx += 0.5; 
          });
      })
      .force('charge', d3.forceManyBody().strength(-15))
      .alpha(1).alphaDecay(0.05)
      .on('tick', ticked);
  } else if (state.layoutMode === 'grid') {
    sim = d3.forceSimulation(nodes)
      .force('x', d3.forceX(d => d.gx).strength(0.8))
      .force('y', d3.forceY(d => d.gy).strength(0.8))
      .force('collision', d3.forceCollide().radius(d => state.scales.size(d.score) * 1.1))
      .alpha(1).alphaDecay(0.1)
      .on('tick', ticked);
  } else { 
    sim = d3.forceSimulation(nodes)
      .force('x', d3.forceX(d => d.center.x).strength(0.15))
      .force('y', d3.forceY(d => d.center.y).strength(0.15))
      .force('collision', d3.forceCollide().radius(d => state.scales.size(d.score) * 1.2))
      .force('charge', d3.forceManyBody().strength(-25))
      .alpha(1).alphaDecay(0.05)
      .on('tick', ticked);
  }
  
  const sel = state.g.selectAll('.node')
    .data(nodes, d => d.id);

  sel.exit().remove(); 

  const enter = sel.enter().append('g')
    .attr('class', 'node')
    .style('cursor', 'pointer')
    .attr('opacity', 0); 

  enter.transition().duration(500).attr('opacity', 1);

  const pulse = enter.append('g').attr('class', 'pulse');

  pulse.append('circle')
    .attr('class', 'aura')
    .attr('r', d => state.scales.size(d.score) * 1.3) 
    .attr('fill', 'none')
    .attr('stroke', d => auraColor(d.score))
    .attr('stroke-width', 2)
    .attr('stroke-opacity', 0.5); 

  pulse.append('circle')
    .attr('class', 'core')
    .attr('r', d => state.scales.size(d.score) * 0.9) 
    .attr('fill', d => {
      const pid = `pat-${d.type}`;
      const exists = !!state.svg.select(`#${pid}`).node();
      return exists ? `url(#grad-pat-${d.type})` : colorFor(d.type);
    })
    .attr('filter', 'url(#drop-shadow)') 
    .attr('stroke', d => state.scales.relevanceColor(d.score)) 
    .attr('stroke-width', d => 3 + d.score * 4) 
    .attr('r', d => state.scales.size(d.score));

  const txt = enter.append('text')
    .attr('class', 'node-label') 
    .attr('text-anchor', 'middle')
    .attr('dy', d => state.scales.size(d.score) + 18)
    .attr('font-size', d => Math.max(10, state.scales.size(d.score)/3 + 6) + 'px') 
    .attr('font-weight', '500')
    .attr('fill', '#e2e8f0') 
    .style('text-shadow', '0px 2px 4px rgba(0,0,0,0.9)') 
    .style('pointer-events', 'none')
    .text(d => d.label.length > 25 ? d.label.slice(0, 23) + '…' : d.label);

  enter.on('mouseenter', (ev, d) => {
      if (d.isExcluded) return; 

      d.hovered = true;
      state.tooltip.style('opacity', 1)
        .html(`<div style="border-bottom:1px solid #334155; padding-bottom:4px; margin-bottom:4px; font-weight:700; color:${state.scales.relevanceColor(d.score)}">${d.label}</div>
               <div style="font-size:11px; color:#94a3b8">Match: ${(d.score * 100).toFixed(0)}%</div>
               <div style="font-size:10px; color:#60a5fa; margin-top:2px; text-transform:uppercase; font-weight:bold">${d.type}</div>
               <div style="font-style:italic; margin-top:4px;">${d.explanation?.brief || ''}</div>`);
      
      d3.select(ev.currentTarget).select('.core')
        .transition().duration(200)
        .attr('filter', 'url(#glow)') 
        .attr('stroke', '#ffffff');
        
      ticked();
    })
    .on('mousemove', ev => {
      state.tooltip.style('left', (ev.pageX + 16) + 'px')
                      .style('top', (ev.pageY + 16) + 'px');
    })
    .on('mouseleave', (ev, d) => {
      if (d.isExcluded) return;

      d.hovered = false;
      state.tooltip.style('opacity', 0);
      
      d3.select(ev.currentTarget).select('.core')
        .transition().duration(300)
        .attr('filter', 'url(#drop-shadow)') 
        .attr('stroke', state.scales.relevanceColor(d.score));
        
      ticked();
    })
    .on('click', (_, d) => {
      if (d.isExcluded) return; 
      state.selectedNodeId = d.id;
      highlightSelected(d.id);
      showInfoCard(d);
      drawMiniGraph(d.explanation?.path_example, d.explanation?.shared_entities);
    });

  const all = enter.merge(sel);
  
  all.transition()
      .duration(500)
      .style('opacity', d => d.isExcluded ? 0.08 : 1) 
      .style('filter', d => d.isExcluded ? 'grayscale(100%) blur(1px)' : 'none') 
      .attr('pointer-events', d => d.isExcluded ? 'none' : 'auto'); 

  if (state.pulseTimer) { state.pulseTimer.stop(); state.pulseTimer = null; }
  
  const visibleNodes = nodes.filter(n => !n.isExcluded);
  const topIds = new Set(visibleNodes.slice(0, state.pulseCount).map(d => d.id));
  
  if (topIds.size > 0) {
    state.pulseTimer = d3.timer((elapsed) => {
      const t = elapsed / 1000; 
      all.each(function(d) {
        if (!d.isExcluded && topIds.has(d.id)) {
          const target = d3.select(this).select('.pulse');
          const scalePulse = 1 + 0.05 * Math.sin(1.5 * t);
          target.attr('transform', `scale(${scalePulse})`);
          
          d3.select(this).select('.aura')
            .attr('stroke-dashoffset', t * 10);
        }
      });
    });
  }

  function ticked() {
    all.attr('transform', d => {
      const s = (d.hovered && !d.isExcluded) ? 1.15 : 1; 
      return `translate(${d.x},${d.y}) scale(${s})`;
    });
  }

  if (!state.selectedNodeId) {
      drawGlobalOverview();
  }
}

function highlightSelected(id) {
  state.g.selectAll('.node').each(function(d) {
    if (d.isExcluded) return; 

    const core = d3.select(this).select('circle.core');
    const label = d3.select(this).select('text');
    
    if (!core.node()) return;
    
    if (id && d.id === id) {
      core.attr('filter', 'url(#glow)')
          .attr('stroke', '#fff')
          .attr('stroke-width', 4);
      label.attr('font-weight', 'bold').attr('fill', '#fff');
      d3.select(this).raise();
    } else {
      core.attr('filter', 'url(#drop-shadow)')
          .attr('stroke', state.scales.relevanceColor(d.score))
          .attr('stroke-width', 3 + d.score * 4); 
      label.attr('font-weight', '500').attr('fill', '#e2e8f0');
    }
  });
}

function styleInfoCard() {
    const card = document.getElementById('infocard');
    if(card) {
        card.style.background = 'rgba(15, 23, 42, 0.95)';
        card.style.backdropFilter = 'blur(15px)';
        card.style.color = '#f1f5f9';
        card.style.border = '1px solid rgba(255,255,255,0.15)';
        card.style.boxShadow = '0 10px 40px rgba(0,0,0,0.6)';
        card.style.borderRadius = '16px';
        card.style.padding = '24px';
        
        card.style.position = 'absolute';
        card.style.right = '20px';
        card.style.left = 'auto';
        
        card.style.top = 'auto'; 
        card.style.bottom = '30px'; 
        card.style.height = 'auto'; 
        card.style.maxHeight = '45%'; 
        
        card.style.width = '320px';
        card.style.transform = 'none'; 
        card.style.margin = '0';
        card.style.overflowY = 'auto'; 
        card.style.zIndex = '1000'; 
        
        if(!card.classList.contains('styled')) card.classList.add('styled');
    }
}

function showInfoCard(d) {
  const card = document.getElementById('infocard');
  styleInfoCard();
  card.classList.remove('hidden');

  const shared = d.explanation?.shared_entities || [];
  
  const items = shared.map(se => {
    const readable = resolveLabel(se.label);
    return `<li style="margin-bottom:6px; color:#cbd5e1"><span style="color:#60a5fa; font-weight:600; text-transform:uppercase; font-size:10px; letter-spacing:0.5px">${se.type}</span> <span style="margin-left:4px">${readable}</span></li>`
  }).join('');

  const briefReason = d.explanation?.brief || 'Coerente con il tuo profilo.';
  const sharedSummary = shared.map(e => `${e.type}: ${resolveLabel(e.label)}`).join(', ');

  card.innerHTML = `
    <button id="closeInfo" type="button" style="
        position: absolute; 
        top: 10px; 
        right: 10px; 
        width: 40px; 
        height: 40px; 
        background: rgba(255,255,255,0.1); 
        border-radius: 50%;
        border: 1px solid rgba(255,255,255,0.2); 
        color: #fff; 
        font-size: 18px; 
        cursor: pointer; 
        z-index: 2147483647; 
        pointer-events: all !important;
        display: flex; 
        align-items: center; 
        justify-content: center;">
        ✕
    </button>
    
    <div style="font-size:10px; text-transform:uppercase; color:#94a3b8; letter-spacing:1px; margin-bottom:4px;">${d.strategy}</div>
    <h3 style="margin-top:0; padding-right:40px; font-size:22px; background: linear-gradient(to right, #fff, #94a3b8); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">${d.label}</h3>
    
    <div id="storyArea"></div>
    ${!state.storyMode ? `
      <div style="display:flex; align-items:center; gap:10px; margin: 12px 0;">
         <div style="height:4px; flex:1; background:#334155; border-radius:2px; overflow:hidden">
            <div style="height:100%; width:${d.score*100}%; background:${state.scales.relevanceColor(d.score)}"></div>
         </div>
         <span style="font-weight:bold; color:${state.scales.relevanceColor(d.score)}">${(d.score * 100).toFixed(0)}% Match</span>
      </div>
      <p style="color:#cbd5e1; font-style:italic; line-height:1.5">${d.explanation?.brief || 'Non specificato'}</p>
      ${shared.length ? `<div style="background:rgba(255,255,255,0.05); padding:12px; border-radius:8px; margin-top:12px;"><p style="margin:0 0 8px 0; font-size:11px; text-transform:uppercase; color:#94a3b8; letter-spacing:1px">Elementi chiave</p><ul style="padding-left:0; list-style:none; margin:0">${items}</ul></div>` : ''}
    ` : ''}
  `;

  if (state.storyMode) {
    const stepStyle = "font-size:14px; line-height:1.6; color:#e2e8f0";
    const steps = [
      `<div style="${stepStyle}"><b>Step 1: La Raccomandazione.</b><br>Ti consigliamo <span style="color:#fff; font-weight:700">"${d.label}"</span>. Il nostro sistema calcola una pertinenza del <span style="color:${state.scales.relevanceColor(d.score)}">${(d.score * 100).toFixed(0)}%</span>.</div>`,
      `<div style="${stepStyle}"><b>Step 2: Il Perché.</b><br>Strategia usata: <span style="color:#fbbf24">${d.strategy}</span>.<br>Motivo: ${briefReason}</div>`,
      `<div style="${stepStyle}"><b>Step 3: Le Connessioni.</b><br>${shared.length 
          ? `Abbiamo trovato collegamenti diretti nel Knowledge Graph: <span style="color:#60a5fa">${sharedSummary}</span>.` 
          : 'Basato su una somiglianza vettoriale del tuo profilo.'}</div>`,
    ];
    let idx = 0;
    const storyArea = document.getElementById('storyArea');
    function renderStep() {
      const btnStyle = "background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); color:white; padding:6px 12px; border-radius:6px; cursor:pointer; pointer-events:all;";
      storyArea.innerHTML = `
        <div style="min-height:80px; padding:10px 0;">${steps[idx]}</div>
        <div style="display:flex; gap:8px; margin-top:8px">
          <button id="prevStep" style="${btnStyle}" ${idx===0?'disabled style="opacity:0.3"':''}>Indietro</button>
          <button id="nextStep" style="${btnStyle}" ${idx===steps.length-1?'disabled style="opacity:0.3"':''}>Avanti</button>
        </div>
      `;
      const prev = storyArea.querySelector('#prevStep');
      const next = storyArea.querySelector('#nextStep');
      if(prev) prev.onclick = (e) => { e.stopPropagation(); idx = Math.max(0, idx - 1); renderStep(); };
      if(next) next.onclick = (e) => { e.stopPropagation(); idx = Math.min(steps.length - 1, idx + 1); renderStep(); };
    }
    renderStep();
  }
}

function hideInfoCard() {
  highlightSelected(null);
  const card = document.getElementById('infocard');
  if (!card.classList.contains('hidden')) {
    card.classList.add('hidden');
  }
  
  state.selectedNodeId = null;
  drawGlobalOverview();
}

async function load(userId, topK) {
  initSVG();
  const [dataA, theme] = await Promise.all([API.fetchRecs(userId, topK), API.fetchTheme()]); 
  state.rawData = dataA;
  state.theme = theme;
  const nodesAll = makeNodes(state.rawData);
  const availableTypes = new Set(nodesAll.map(n => n.type));
  state.filters.types = availableTypes;

  renderNodesFiltered();
}

function bindControls() {
  const user = document.getElementById('userId');
  const topK = document.getElementById('topK');
  const topKVal = document.getElementById('topKVal');
  if(document.getElementById('reload')) {
      document.getElementById('reload').addEventListener('click', () => load(+user.value, +topK.value));
  }
  if(topK) {
      topK.addEventListener('input', () => topKVal.textContent = topK.value);
  }
}

document.addEventListener('click', function(e) {
    const targetBtn = e.target.closest('#closeInfo');
    if (targetBtn) {
        e.preventDefault();
        e.stopPropagation();
        hideInfoCard();
    }
}, true);

document.addEventListener('DOMContentLoaded', async () => {
  bindControls();
  await load(1, 20);
});