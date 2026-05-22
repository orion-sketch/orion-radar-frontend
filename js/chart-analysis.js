/**
 * ORION RADAR PRO — chart-analysis.js  v3
 * Filtros: ativo, direção, setup, confluência, score
 */
'use strict';

const SIGNALS_URL = '/api/signals';
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
    console.warn('[ORION] Mock ativo:', err.message);
    loadMock();
  }
  if (!state.selAsset && state.assets.length > 0) state.selAsset = state.assets[0];
  renderAll();
}

function loadMock() {
  state.signals = {
    XAUUSD:{ tfs:{
      M5: {dir:'buy',  score:72,entry:4517.00,tp:4522.00,tp2:4528.00,sl:4513.00,setup:'ORDER_BLOCK',conf:['CONTEXT','EMA','FIBO']},
      M15:{dir:'buy',  score:81,entry:4517.00,tp:4528.00,tp2:4540.00,sl:4509.00,setup:'ENGULFING',conf:['CONTEXT','CONFIRM','EMA','FIBO']},
      H1: {dir:'buy',  score:88,entry:4517.00,tp:4545.00,tp2:4570.00,sl:4495.00,setup:'LIQ_SWEEP',conf:['CONTEXT','CONFIRM','EMA','FIBO','VWAP']},
      H4: {dir:'buy',  score:76,entry:4517.00,tp:4580.00,tp2:4630.00,sl:4470.00,setup:'BOS',conf:['CONTEXT','EMA','DELTA']},
      D:  {dir:'neutral',score:54,entry:4517.00,tp:4650.00,tp2:0,sl:4400.00,setup:'BOS',conf:['EMA']},
      W:  {dir:'buy',  score:65,entry:4517.00,tp:4750.00,tp2:0,sl:4300.00,setup:'ENGULFING',conf:['EMA','DELTA']},
    }},
    BTCUSD:{ tfs:{
      M5: {dir:'sell',score:68,entry:82000,tp:81500,tp2:81000,sl:82600,setup:'ENGULFING',conf:['CONTEXT','DELTA']},
      M15:{dir:'sell',score:77,entry:82000,tp:81000,tp2:80200,sl:83000,setup:'ORDER_BLOCK',conf:['CONTEXT','CONFIRM','EMA']},
      H1: {dir:'sell',score:83,entry:82000,tp:80000,tp2:78500,sl:83800,setup:'LIQ_SWEEP',conf:['CONTEXT','CONFIRM','EMA','FIBO']},
      H4: {dir:'neutral',score:50,entry:82000,tp:85000,tp2:0,sl:78000,setup:'BOS',conf:['EMA']},
      D:  {dir:'buy', score:61,entry:82000,tp:88000,tp2:92000,sl:76000,setup:'ENGULFING',conf:['EMA','DELTA']},
      W:  {dir:'buy', score:70,entry:82000,tp:95000,tp2:0,sl:68000,setup:'BOS',conf:['EMA','DELTA','VWAP']},
    }},
    EURUSD:{ tfs:{
      M5: {dir:'neutral',score:48,entry:1.1620,tp:1.1638,tp2:0,sl:1.1605,setup:'BOS',conf:['EMA']},
      M15:{dir:'sell',score:62,entry:1.1620,tp:1.1590,tp2:1.1560,sl:1.1645,setup:'ENGULFING',conf:['CONTEXT','EMA']},
      H1: {dir:'sell',score:71,entry:1.1620,tp:1.1560,tp2:1.1510,sl:1.1670,setup:'ORDER_BLOCK',conf:['CONTEXT','CONFIRM','EMA']},
      H4: {dir:'sell',score:79,entry:1.1620,tp:1.1500,tp2:1.1440,sl:1.1700,setup:'LIQ_SWEEP',conf:['CONTEXT','CONFIRM','EMA','FIBO']},
      D:  {dir:'sell',score:85,entry:1.1620,tp:1.1400,tp2:1.1280,sl:1.1750,setup:'ENGULFING',conf:['CONTEXT','CONFIRM','EMA','FIBO','VWAP']},
      W:  {dir:'neutral',score:52,entry:1.1620,tp:1.1900,tp2:0,sl:1.1300,setup:'BOS',conf:['EMA']},
    }},
    GBPUSD:{ tfs:{
      M5: {dir:'buy',score:55,entry:1.3367,tp:1.3390,tp2:0,sl:1.3345,setup:'BOS',conf:['EMA','DELTA']},
      M15:{dir:'buy',score:63,entry:1.3367,tp:1.3410,tp2:1.3445,sl:1.3330,setup:'ENGULFING',conf:['CONTEXT','EMA','FIBO']},
      H1: {dir:'buy',score:74,entry:1.3367,tp:1.3450,tp2:1.3510,sl:1.3290,setup:'ORDER_BLOCK',conf:['CONTEXT','CONFIRM','EMA','FIBO']},
      H4: {dir:'buy',score:80,entry:1.3367,tp:1.3520,tp2:1.3610,sl:1.3220,setup:'LIQ_SWEEP',conf:['CONTEXT','CONFIRM','EMA','FIBO','VWAP']},
      D:  {dir:'buy',score:91,entry:1.3367,tp:1.3650,tp2:1.3850,sl:1.3100,setup:'ENGULFING',conf:['CONTEXT','CONFIRM','EMA','FIBO','VWAP']},
      W:  {dir:'buy',score:86,entry:1.3367,tp:1.3900,tp2:0,sl:1.2900,setup:'BOS',conf:['CONTEXT','EMA','DELTA','VWAP']},
    }},
  };
  state.assets = Object.keys(state.signals);
}

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

// ─── OHLCV ───────────────────────────────────────────────────────
async function fetchOHLCV(symbol, tf) {
  try {
    const key = window.TWELVEDATA_KEY || '';
    if (!key) throw new Error('sem chave');
    const tdSym = symbol.slice(0,3) + '/' + symbol.slice(3);
    const url   = `https://api.twelvedata.com/time_series?symbol=${tdSym}&interval=${TF_MAP[tf]||'1h'}&outputsize=80&apikey=${key}`;
    const res   = await fetch(url);
    const data  = await res.json();
    if (!data.values) throw new Error('sem values');
    return data.values.reverse().map(v => ({
      time:  Math.floor(new Date(v.datetime).getTime()/1000),
      open:  parseFloat(v.open), high: parseFloat(v.high),
      low:   parseFloat(v.low),  close:parseFloat(v.close),
    }));
  } catch(_) { return buildFake(symbol, tf); }
}

function buildFake(symbol, tf) {
  const sig  = state.signals[symbol]?.tfs[tf];
  const base = sig?.entry || 1.0;
  const sl   = sig?.sl || 0;
  const tp   = sig?.tp || 0;
  const rangeTP = tp ? Math.abs(tp - base) : 0;
  const rangeSL = sl ? Math.abs(sl - base) : 0;
  const range   = Math.max(rangeTP, rangeSL, base * 0.0005);
  const vol  = range * 0.6;
  const step = {M5:300,M15:900,H1:3600,H4:14400,D:86400,W:604800}[tf]||3600;
  const now  = Math.floor(Date.now()/1000);
  const isUp = sig?.dir !== 'sell';
  let p = isUp ? base - range * 1.5 : base + range * 1.5;
  return Array.from({length:80},(_,i)=>{
    const time  = now-(79-i)*step;
    const open  = p;
    const bias  = isUp ? 0.52 : 0.48;
    const move  = (Math.random()-(1-bias))*vol;
    const close = open+move;
    const high  = Math.max(open,close)+Math.random()*vol*0.3;
    const low   = Math.min(open,close)-Math.random()*vol*0.3;
    p = close;
    return {time,open,high,low,close};
  });
}

// ─── CHART ───────────────────────────────────────────────────────
function cc() {
  const b = document.body;
  if (b.classList.contains('theme-sepia'))
    return {bg:'#120e08',grid:'#1c1610',text:'#806040',up:'#60d888',dn:'#d86040',border:'#2a2010'};
  if (b.classList.contains('theme-light'))
    return {bg:'#ffffff',grid:'#f0f4f8',text:'#5a8aaa',up:'#0a7a48',dn:'#aa2a10',border:'#c8d8e8'};
  return {bg:'#080d12',grid:'#0f1e2c',text:'#4a7090',up:'#2de89a',dn:'#e84a2d',border:'#162030'};
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
  showLoading(true);
  const candles=await fetchOHLCV(sym,tf);
  if(candles.length){
    state.candleSeries.setData(candles);
    plotMarkers(sym,tf,candles);

    const sig=state.signals[sym]?.tfs[tf];
    if(sig){
      const prices=[sig.entry,sig.tp,sig.tp2,sig.sl].filter(Boolean);
      const candlePrices=candles.flatMap(c=>[c.high,c.low]);
      const allPrices=[...prices,...candlePrices];
      const minP=Math.min(...allPrices);
      const maxP=Math.max(...allPrices);
      const pad=(maxP-minP)*0.2;
      state.candleSeries.applyOptions({
        autoscaleInfoProvider:()=>({
          priceRange:{minValue:minP-pad,maxValue:maxP+pad},
          margins:{above:20,below:20}
        })
      });
    }
    state.chart.timeScale().fitContent();
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
    state.selTF=btn.dataset.tf;
    document.querySelectorAll('.tf-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    renderAll();
    if(state.selAsset)loadChart(state.selAsset,state.selTF);
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
