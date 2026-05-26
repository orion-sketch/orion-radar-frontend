/**
 * ORION RADAR PRO — chart-analysis.js  v3
 * Filtros: ativo, direção, setup, confluência, score
 */
'use strict';

const BACKEND_URL  = 'https://orion-radar-backend.onrender.com';
const SIGNALS_URL  = BACKEND_URL + '/signals';
const TF_MAP = { M5:'5min', M15:'15min', H1:'1h', H4:'4h', D:'1day', W:'1week' };

const state = {
  signals:     {},
  assets:      [],
  selAsset:    null,
  selTF:       'H1',
  minScore:    0,
  filterDir:   'all',   // 'all' | 'buy' | 'sell'
  filterSetup: 'all',   // 'all' | setup name
  filterConf:  'all',   // 'all' | confluência
  chart:       null,
  candleSeries:null,
  lastUpdated: null,
};

const ALL_SETUPS = ['ENGULFING','ORDER_BLOCK','LIQ_SWEEP','INSIDE_BAR','BOS','SECOND_ENTRY','CHOCH_CONF','BREAKOUT_CONF'];
const ALL_CONFS  = ['CONTEXT','CONFIRM','EMA','FIBO','VOLUME','DELTA','VWAP'];
const ALL_IND    = ['RSI','EMA','MACD','BB','VWAP','ATR','STOCH','SAR'];

// ─── FETCH & NORMALISE ────────────────────────────────────────────
async function fetchSignals() {
  try {
    const res  = await fetch(SIGNALS_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const raw  = Array.isArray(data) ? data : Array.isArray(data.signals) ? data.signals : [];
    state.lastUpdated = data.updated_at || null;
    if (raw.length === 0) throw new Error('signals vazio');

    const grouped = {};
    raw.forEach(sig => {
      const sym = (sig.symbol || '').toUpperCase();
      const tf  = (sig.timeframe || sig.tf || 'H1').toUpperCase();
      if (!sym) return;
      if (!grouped[sym]) grouped[sym] = { tfs: {} };
      grouped[sym].tfs[tf] = {
        dir:   (sig.direction || sig.dir || 'neutral').toLowerCase(),
        score:  Number(sig.score) || 0,
        entry:  Number(sig.entry) || 0,
        tp:     Number(sig.tp1 || sig.tp) || 0,
        tp2:    Number(sig.tp2) || 0,
        sl:     Number(sig.sl) || 0,
        setup:  sig.setup || '',
        conf:   Array.isArray(sig.indicators) ? sig.indicators
              : Array.isArray(sig.confluences) ? sig.confluences : [],
      };
    });
    state.signals = grouped;
    state.assets  = Object.keys(grouped);
  } catch (err) {
    console.warn('[ORION] Sem sinais:', err.message);
    state.signals = {};
    state.assets  = [];
  }
  if (!state.selAsset && state.assets.length > 0) state.selAsset = state.assets[0];
  renderAll();
}

// loadMock removido — sem dados falsos

// ─── FILTROS ─────────────────────────────────────────────────────
function assetPassesFilter(sym) {
  const tfData = state.signals[sym]?.tfs[state.selTF]
               || Object.values(state.signals[sym]?.tfs || {})[0];
  if (!tfData) return false;
  if (tfData.score < state.minScore) return false;
  if (state.filterDir !== 'all' && tfData.dir !== state.filterDir) return false;
  if (state.filterSetup !== 'all' && (tfData.setup||'').toUpperCase() !== state.filterSetup) return false;
  if (state.filterConf !== 'all' && !tfData.conf.includes(state.filterConf)) return false;
  return true;
}

// ─── OHLCV — candles reais via backend /ohlcv (Finnhub) ─────────
async function fetchOHLCV(symbol, tf) {
  try {
    // TF fallback — M2/M3/M4 não suportados pelo Yahoo Finance
    const TF_MAP = { 'M1':'M5','M2':'M5','M3':'M5','M4':'M5','M5':'M5',
                     'M15':'M15','M30':'M30','H1':'H1','H4':'H4','D':'D','W':'W' };
    const fetchTf = TF_MAP[tf] || 'M5';
    const url = `${BACKEND_URL}/ohlcv?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(fetchTf)}`;
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.candles || !data.candles.length) throw new Error('sem candles');
    return data.candles;
  } catch(err) {
    console.warn('[ORION] fetchOHLCV falhou:', err.message, '— sem candles');
    return [];
  }
}

// buildFake removido — dados reais via /ohlcv apenas

// ─── CHART ───────────────────────────────────────────────────────
function cc() {
  const b = document.body;
  if (b.classList.contains('theme-sepia'))
    return {bg:'#120e08',grid:'#1c1610',text:'#806040',up:'#60d888',dn:'#d86040',border:'#2a2010'};
  if (b.classList.contains('theme-light'))
    return {bg:'#ffffff',grid:'#f0f4f8',text:'#5a8aaa',up:'#0a7a48',dn:'#aa2a10',border:'#c8d8e8'};
  return {bg:'#080d12',grid:'#0f1e2c',text:'#4a7090',up:'#2de89a',dn:'#e84a2d',border:'#162030'};
}

function updateWatermark(){
  const el=document.getElementById('chart-watermark');
  if(!el)return;
  const sym=state.selAsset||'—';
  const tf=state.selTF||'—';
  el.textContent=`${sym} / ${tf}`;
}

function initChart() {
  const el = document.getElementById('chart-container');
  if (!el || !window.LightweightCharts) return;
  if (state.chart) { state.chart.remove(); state.chart = null; }
  const c = cc();
  state.chart = LightweightCharts.createChart(el, {
    width:el.clientWidth, height:el.clientHeight||320,
    layout:{background:{type:'solid',color:c.bg},textColor:c.text,fontFamily:"'Share Tech Mono',monospace",fontSize:11},
    grid:{vertLines:{color:c.grid},horzLines:{color:c.grid}},
    crosshair:{mode:LightweightCharts.CrosshairMode.Normal},
    rightPriceScale:{borderColor:c.border,autoScale:true},
    timeScale:{borderColor:c.border,timeVisible:true,secondsVisible:false},
  });
  state.candleSeries = state.chart.addCandlestickSeries({
    upColor:c.up,downColor:c.dn,borderUpColor:c.up,borderDownColor:c.dn,wickUpColor:c.up,wickDownColor:c.dn,
  });
  new ResizeObserver(e=>{
    if(!state.chart)return;
    const{width,height}=e[0].contentRect;
    state.chart.applyOptions({width,height});
  }).observe(el);

  // Injeta watermark no container se nao existir
  if(!document.getElementById('chart-watermark')){
    const wm=document.createElement('div');
    wm.id='chart-watermark';
    wm.style.cssText='position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);'+
      'font-family:\'Rajdhani\',sans-serif;font-size:48px;font-weight:700;'+
      'color:rgba(39,212,99,0.06);letter-spacing:4px;pointer-events:none;'+
      'white-space:nowrap;z-index:0;user-select:none;';
    el.style.position='relative';
    el.appendChild(wm);
  }
  updateWatermark();

  window.orionChart={applyTheme(){initChart();if(state.selAsset)loadChart(state.selAsset,state.selTF);}};
}

const _pl=[];
function clearPL(){_pl.forEach(p=>{try{state.candleSeries.removePriceLine(p);}catch(_){}});_pl.length=0;}
function addPL(price,label,color,dashed){
  if(!state.candleSeries||!price)return;
  _pl.push(state.candleSeries.createPriceLine({
    price,color,lineWidth:2,
    lineStyle:dashed?LightweightCharts.LineStyle.Dashed:LightweightCharts.LineStyle.Solid,
    axisLabelVisible:true,title:label,
  }));
}

function plotMarkers(sym,tf,candles){
  const sig=state.signals[sym]?.tfs[tf];
  if(!sig||!candles.length)return;
  const c=cc();
  const last=candles[candles.length-1].time;
  const isBuy=sig.dir!=='sell';
  const mkrs=[];

  if(sig.entry)mkrs.push({
    time:last,
    position:isBuy?'belowBar':'aboveBar',
    color:'#ffffff',shape:'circle',
    text:`ENTRY ${fmtPrice(sig.entry)}`,size:2
  });
  if(sig.tp)mkrs.push({
    time:last,
    position:isBuy?'aboveBar':'belowBar',
    color:c.up,
    shape:isBuy?'arrowUp':'arrowDown',
    text:`TP1 ${fmtPrice(sig.tp)}`,size:2
  });
  if(sig.tp2&&sig.tp2!==sig.tp)mkrs.push({
    time:last,
    position:isBuy?'aboveBar':'belowBar',
    color:c.up,
    shape:isBuy?'arrowUp':'arrowDown',
    text:`TP2 ${fmtPrice(sig.tp2)}`,size:2
  });
  if(sig.sl)mkrs.push({
    time:last,
    position:isBuy?'belowBar':'aboveBar',
    color:c.dn,
    shape:isBuy?'arrowDown':'arrowUp',
    text:`SL ${fmtPrice(sig.sl)}`,size:2
  });

  state.candleSeries.setMarkers(mkrs);
  clearPL();
  addPL(sig.entry,'ENTRADA','#ffffff',true);
  addPL(sig.tp,'TP1',c.up,false);
  if(sig.tp2&&sig.tp2!==sig.tp)addPL(sig.tp2,'TP2',c.up,true);
  addPL(sig.sl,'SL',c.dn,false);
}

async function loadChart(sym,tf){
  if(!state.chart||!state.candleSeries)return;
  updateWatermark();
  showLoading(true);
  const candles=await fetchOHLCV(sym,tf);
  if(candles.length){
    // 1. Reset completo — sem autoscaleInfoProvider residual
    state.candleSeries.applyOptions({autoscaleInfoProvider:undefined});
    state.chart.priceScale('right').applyOptions({autoScale:true});
    state.candleSeries.setData(candles);
    plotMarkers(sym,tf,candles);

    const sig=state.signals[sym]?.tfs[tf];
    if(sig){
      // 2. Calcula range Y ideal: Entry no centro, TP e SL visiveis com padding generoso
      const entry  = sig.entry;
      const topRef = Math.max(sig.tp||entry, sig.tp2||entry);
      const botRef = sig.sl || entry;
      const distUp   = Math.abs(topRef - entry);
      const distDown = Math.abs(entry - botRef);
      const span     = Math.max(distUp, distDown, 0.001);
      const pad  = span * 0.4;
      const minP = Math.min(topRef, botRef, entry) - pad;
      const maxP = Math.max(topRef, botRef, entry) + pad;

      // 3. Mostra apenas as ultimas N velas no eixo X (foco na acao recente)
      const showCandles = tf==='M5'?60 : tf==='M15'?48 : tf==='H1'?72 : 50;
      const visibleSlice = candles.slice(-showCandles);
      if(visibleSlice.length>=2){
        state.chart.timeScale().setVisibleRange({
          from: visibleSlice[0].time,
          to:   visibleSlice[visibleSlice.length-1].time,
        });
      }

      // 4. Trava escala Y no range calculado — sem autoScale interferindo
      state.chart.priceScale('right').applyOptions({autoScale:false});
      state.candleSeries.applyOptions({
        autoscaleInfoProvider:()=>({
          priceRange:{minValue:minP, maxValue:maxP},
          margins:{above:0,below:0}
        })
      });
    } else {
      state.chart.timeScale().fitContent();
      state.chart.priceScale('right').applyOptions({autoScale:true});
    }
  }
  showLoading(false);
}

function showLoading(show){const el=document.getElementById('chart-loading');if(el)el.style.display=show?'flex':'none';}

// ─── UTILS ───────────────────────────────────────────────────────
function fmtPrice(n){
  if(!n)return'—';
  return n<100?n.toFixed(5).replace(/0+$/,'').replace(/\.$/,''):n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function calcRR(e,tp,sl){
  if(!e||!tp||!sl)return'—';
  const rwd=Math.abs(tp-e),rsk=Math.abs(sl-e);
  return rsk===0?'—':'1 : '+(rwd/rsk).toFixed(2);
}
function getSummaryDir(sym){
  const c={buy:0,sell:0,neutral:0};
  Object.values(state.signals[sym]?.tfs||{}).forEach(t=>c[t.dir]++);
  if(c.buy>c.sell&&c.buy>c.neutral)return'buy';
  if(c.sell>c.buy&&c.sell>c.neutral)return'sell';
  return'neutral';
}
function dirLabel(d){return d==='buy'?'BUY':d==='sell'?'SELL':'NEUTRO';}
function setText(id,val){const el=document.getElementById(id);if(el)el.textContent=val;}

// ─── FILTER BAR ──────────────────────────────────────────────────
function renderFilterBar(){
  const bar=document.getElementById('filter-bar');
  if(!bar)return;

  // Direção
  ['all','buy','sell'].forEach(d=>{
    const btn=bar.querySelector(`[data-dir="${d}"]`);
    if(btn)btn.classList.toggle('active',state.filterDir===d);
  });

  // Setup dropdown
  const setupSel=bar.querySelector('#filter-setup');
  if(setupSel&&setupSel.options.length<=1){
    ALL_SETUPS.forEach(s=>{
      const o=document.createElement('option');
      o.value=s;o.textContent=s;
      setupSel.appendChild(o);
    });
  }

  // Confluência dropdown
  const confSel=bar.querySelector('#filter-conf');
  if(confSel&&confSel.options.length<=1){
    ALL_CONFS.forEach(s=>{
      const o=document.createElement('option');
      o.value=s;o.textContent=s;
      confSel.appendChild(o);
    });
  }
}

function injectFilterBar(){
  // Injeta a barra de filtros na sidebar, logo abaixo do rank
  const rankSection=document.querySelector('.sidebar-section');
  if(!rankSection||document.getElementById('filter-bar'))return;

  const bar=document.createElement('section');
  bar.className='sidebar-section';
  bar.id='filter-bar';
  bar.innerHTML=`
    <div class="section-label">// FILTROS</div>

    <div class="filter-group">
      <div class="filter-label">DIREÇÃO</div>
      <div class="filter-btns">
        <button class="filter-btn active" data-dir="all">TODOS</button>
        <button class="filter-btn buy" data-dir="buy">BUY</button>
        <button class="filter-btn sell" data-dir="sell">SELL</button>
      </div>
    </div>

    <div class="filter-group">
      <div class="filter-label">SETUP</div>
      <select id="filter-setup" class="filter-select">
        <option value="all">TODOS</option>
      </select>
    </div>

    <div class="filter-group">
      <div class="filter-label">CONFLUÊNCIA</div>
      <select id="filter-conf" class="filter-select">
        <option value="all">TODAS</option>
      </select>
    </div>

    <div class="filter-group">
      <div class="filter-label">PONTUAÇÃO MÍN: <span id="score-filter-val">0</span></div>
      <input type="range" min="0" max="95" value="0" step="5" id="score-filter-range" class="rank-slider">
      <div class="rank-labels"><span>0</span><span>50</span><span>95+</span></div>
    </div>
  `;

  // Injeta CSS inline para os novos elementos
  if(!document.getElementById('filter-bar-style')){
    const style=document.createElement('style');
    style.id='filter-bar-style';
    style.textContent=`
      .filter-group{margin-bottom:12px;}
      .filter-label{font-size:10px;font-weight:700;color:var(--muted,#8fa8c4);letter-spacing:.5px;text-transform:uppercase;margin-bottom:6px;}
      .filter-btns{display:flex;gap:6px;}
      .filter-btn{flex:1;height:28px;border:1px solid rgba(255,255,255,0.1);border-radius:7px;background:rgba(255,255,255,0.04);color:#8fa8c4;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;transition:all .15s;}
      .filter-btn.active{background:rgba(51,103,227,0.25);border-color:#3367e3;color:#fff;}
      .filter-btn.buy.active{background:rgba(39,212,99,0.2);border-color:#27d463;color:#27d463;}
      .filter-btn.sell.active{background:rgba(239,68,68,0.2);border-color:#ef4444;color:#ef4444;}
      .filter-select{width:100%;height:32px;border:1px solid rgba(255,255,255,0.1);border-radius:7px;background:rgba(4,14,28,0.8);color:#fff;padding:0 10px;font-size:12px;font-family:inherit;outline:none;cursor:pointer;}
      .filter-select option{background:#0a1828;color:#fff;}
      #score-filter-val{color:#fff;font-weight:900;}
    `;
    document.head.appendChild(style);
  }

  rankSection.after(bar);

  // Events
  bar.querySelectorAll('[data-dir]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      state.filterDir=btn.dataset.dir;
      bar.querySelectorAll('[data-dir]').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      renderWatchlist();
    });
  });

  document.getElementById('filter-setup')?.addEventListener('change',e=>{
    state.filterSetup=e.target.value;
    renderWatchlist();
  });

  document.getElementById('filter-conf')?.addEventListener('change',e=>{
    state.filterConf=e.target.value;
    renderWatchlist();
  });

  document.getElementById('score-filter-range')?.addEventListener('input',e=>{
    state.minScore=parseInt(e.target.value,10);
    setText('score-filter-val',state.minScore||'0');
    // Sync com o slider original se existir
    const orig=document.getElementById('rank-slider');
    if(orig)orig.value=state.minScore;
    setText('rank-num',state.minScore);
    renderWatchlist();
  });

  renderFilterBar();
}

// ─── WATCHLIST ───────────────────────────────────────────────────
function renderWatchlist(){
  const list=document.getElementById('wl-list');
  if(!list)return;
  list.innerHTML='';
  let visible=0;

  const query=(document.getElementById('search-input')?.value||'').trim().toUpperCase();

  state.assets.forEach(sym=>{
    if(query&&!sym.includes(query))return;
    if(!assetPassesFilter(sym))return;

    const tfData=state.signals[sym]?.tfs[state.selTF]
               ||Object.values(state.signals[sym]?.tfs||{})[0];
    if(!tfData)return;

    const dir=getSummaryDir(sym);
    const score=tfData.score;
    visible++;

    const card=document.createElement('div');
    card.className=`wl-card dir-${dir}${sym===state.selAsset?' active':''}`;
    card.innerHTML=`
      <div class="wl-card-top">
        <span class="wl-sym">${sym}</span>
        <span class="wl-badge badge-${dir}">${dirLabel(dir)}</span>
      </div>
      <div class="wl-card-bottom">
        <span class="wl-score-num">${score}</span>
        <span class="wl-score-tf">${tfData.setup||state.selTF}</span>
      </div>
      <div class="wl-bar-track"><div class="wl-bar-fill" style="width:${score}%"></div></div>`;

    card.addEventListener('click',()=>{state.selAsset=sym;renderAll();loadChart(sym,state.selTF);});
    list.appendChild(card);
  });

  if(visible===0){
    const msg=document.createElement('div');
    msg.className='wl-no-signals';
    msg.textContent=query?`SEM RESULTADO: ${query}`:`NENHUM SINAL COM ESSES FILTROS`;
    list.appendChild(msg);
  }
  setText('wl-count',`${visible}/${state.assets.length}`);
}

// ─── DETAIL ──────────────────────────────────────────────────────
function renderDetail(){
  const sym=state.selAsset;
  const sig=state.signals[sym]?.tfs[state.selTF];
  setText('panel-sym',sym||'—');
  setText('panel-tf',state.selTF);
  setText('chart-asset-label',`${sym||'—'} | ${state.selTF}`);
  if(!sig)return;
  const dc=sig.dir;
  const scoreEl=document.getElementById('score-value');
  const scoreBar=document.getElementById('score-bar-fill');
  if(scoreEl){scoreEl.textContent=sig.score;scoreEl.className=`score-value c-${dc}`;}
  if(scoreBar){scoreBar.style.width=sig.score+'%';scoreBar.style.background=`var(--${dc})`;}
  const dirEl=document.getElementById('direction-badge');
  if(dirEl){dirEl.textContent=dirLabel(dc);dirEl.className=`direction-badge c-${dc}`;}
  setText('conf-count',`${sig.conf.length} / 5 indicadores`);

  // Mostra o setup na UI se houver elemento
  const setupEl=document.getElementById('setup-label');
  if(setupEl)setupEl.textContent=sig.setup||'—';

  renderMTF(sym);
  setText('lvl-entry',fmtPrice(sig.entry));
  setText('lvl-tp',fmtPrice(sig.tp));
  setText('lvl-sl',fmtPrice(sig.sl));
  setText('lvl-rr',calcRR(sig.entry,sig.tp,sig.sl));
  setText('lvl-tp-delta',sig.tp&&sig.entry?Math.abs(sig.tp-sig.entry).toFixed(2)+' pts':'');
  setText('lvl-sl-delta',sig.sl&&sig.entry?Math.abs(sig.sl-sig.entry).toFixed(2)+' pts':'');
  renderIndicators(sig.conf);
}

function renderMTF(sym){
  const grid=document.getElementById('mtf-grid');
  if(!grid)return;
  grid.innerHTML='';
  ['M5','M15','H1','H4'].forEach(tf=>{
    const t=state.signals[sym]?.tfs[tf];
    if(!t)return;
    const cell=document.createElement('div');
    cell.className='mtf-cell';
    cell.innerHTML=`<div class="mtf-name">${tf}</div><div class="mtf-dir c-${t.dir}">${dirLabel(t.dir)}</div><div class="mtf-score c-${t.dir}">${t.score}</div>`;
    grid.appendChild(cell);
  });
}

function renderIndicators(active){
  const row=document.getElementById('indicators-row');
  if(!row)return;
  row.innerHTML='<span class="ind-label">INDICADORES:</span>';
  ALL_IND.forEach(ind=>{
    const b=document.createElement('span');
    b.className='ind-badge'+(active.includes(ind)?' active':'');
    b.textContent=ind;
    row.appendChild(b);
  });
}

function renderAll(){renderWatchlist();renderDetail();}

// ─── EVENTS ──────────────────────────────────────────────────────
function initEvents(){
  document.getElementById('tf-selector')?.addEventListener('click',e=>{
    const btn=e.target.closest('.tf-btn');
    if(!btn)return;
    const requestedTF=btn.dataset.tf;
    const sym=state.selAsset;

    // Verifica se existe sinal nesse TF para o ativo selecionado
    const hasSig = sym && state.signals[sym]?.tfs[requestedTF];
    if(!hasSig && sym){
      // Mostra aviso visual no botao por 1.5s mas ainda carrega o grafico (sem marcadores)
      btn.style.opacity='0.4';
      setTimeout(()=>btn.style.opacity='',1500);
    }

    state.selTF=requestedTF;
    document.querySelectorAll('.tf-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    updateWatermark();
    renderAll();
    if(sym) loadChart(sym,state.selTF);
  });

  document.getElementById('rank-slider')?.addEventListener('input',e=>{
    state.minScore=parseInt(e.target.value,10);
    setText('rank-num',state.minScore);
    // Sync com novo slider de score
    const newRange=document.getElementById('score-filter-range');
    if(newRange)newRange.value=state.minScore;
    setText('score-filter-val',state.minScore||'0');
    renderWatchlist();
  });

  document.getElementById('search-input')?.addEventListener('input',()=>renderWatchlist());
  document.getElementById('search-input')?.addEventListener('keydown',e=>{
    if(e.key!=='Enter')return;
    const first=document.querySelector('.wl-card');
    if(first){first.click();e.target.value='';renderWatchlist();}
  });
}

function startPolling(){
  setInterval(async()=>{
    await fetchSignals();
    if(state.selAsset)loadChart(state.selAsset,state.selTF);
  },60_000);
}

async function init(){
  initEvents();
  initChart();
  injectFilterBar();
  await fetchSignals();
  if(state.selAsset)loadChart(state.selAsset,state.selTF);
  startPolling();
}

document.addEventListener('DOMContentLoaded',init);
