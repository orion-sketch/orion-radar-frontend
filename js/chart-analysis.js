/**
 * ORION RADAR PRO — chart-analysis.js  v2
 *
 * Formato real do backend GET /signals:
 * {
 *   ok: true,
 *   updated_at: "...",
 *   count: N,
 *   signals: [
 *     { symbol, timeframe, direction, score, entry, tp, tp1, tp2, sl, indicators }
 *   ]
 * }
 */

'use strict';

const SIGNALS_URL = '/api/signals';

const TF_MAP = {
  M5:'5min', M15:'15min', H1:'1h', H4:'4h', D:'1day', W:'1week'
};

const state = {
  signals:      {},
  assets:       [],
  selAsset:     null,
  selTF:        'H1',
  minScore:     0,
  chart:        null,
  candleSeries: null,
  lastUpdated:  null,
};

// ─── FETCH & NORMALISE ────────────────────────────────────────────────────────

async function fetchSignals() {
  try {
    const res  = await fetch(SIGNALS_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const raw = Array.isArray(data)
      ? data
      : Array.isArray(data.signals) ? data.signals : [];

    state.lastUpdated = data.updated_at || null;
    if (raw.length === 0) throw new Error('signals vazio');

    const grouped = {};
    raw.forEach(sig => {
      const sym = (sig.symbol || '').toUpperCase();
      const tf  = (sig.timeframe || sig.tf || 'H1').toUpperCase();
      if (!sym) return;
      if (!grouped[sym]) grouped[sym] = { tfs: {} };
      grouped[sym].tfs[tf] = {
        dir:  (sig.direction || sig.dir || 'neutral').toLowerCase(),
        score: Number(sig.score) || 0,
        entry: Number(sig.entry) || 0,
        tp:    Number(sig.tp1 || sig.tp) || 0,
        tp2:   Number(sig.tp2) || 0,
        sl:    Number(sig.sl) || 0,
        conf:  Array.isArray(sig.indicators) ? sig.indicators
             : Array.isArray(sig.confluences) ? sig.confluences : [],
      };
    });

    state.signals = grouped;
    state.assets  = Object.keys(grouped);
    console.log('[ORION] Sinais:', state.assets.length, 'ativos');

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
      M5: {dir:'buy',  score:72,entry:2318.40,tp:2322.00,tp2:2326.00,sl:2316.00,conf:['RSI','EMA','MACD']},
      M15:{dir:'buy',  score:81,entry:2318.40,tp:2325.00,tp2:2332.00,sl:2314.00,conf:['RSI','EMA','MACD','BB']},
      H1: {dir:'buy',  score:88,entry:2318.40,tp:2335.00,tp2:2345.00,sl:2308.00,conf:['RSI','EMA','MACD','BB','VWAP']},
      H4: {dir:'buy',  score:76,entry:2318.40,tp:2350.00,tp2:2370.00,sl:2295.00,conf:['EMA','MACD','BB']},
      D:  {dir:'neutral',score:54,entry:2318.40,tp:2380.00,tp2:0,sl:2260.00,conf:['EMA']},
      W:  {dir:'buy',  score:65,entry:2318.40,tp:2450.00,tp2:0,sl:2200.00,conf:['EMA','BB']},
    }},
    BTCUSD:{ tfs:{
      M5: {dir:'sell', score:68,entry:61240,tp:60800,tp2:60400,sl:61600,conf:['RSI','MACD']},
      M15:{dir:'sell', score:77,entry:61240,tp:60400,tp2:59900,sl:62000,conf:['RSI','MACD','EMA']},
      H1: {dir:'sell', score:83,entry:61240,tp:59800,tp2:58800,sl:62500,conf:['RSI','MACD','EMA','BB']},
      H4: {dir:'neutral',score:50,entry:61240,tp:64000,tp2:0,sl:58000,conf:['EMA']},
      D:  {dir:'buy',  score:61,entry:61240,tp:68000,tp2:72000,sl:55000,conf:['EMA','BB']},
      W:  {dir:'buy',  score:70,entry:61240,tp:80000,tp2:0,sl:48000,conf:['EMA','BB','MACD']},
    }},
    EURUSD:{ tfs:{
      M5: {dir:'neutral',score:48,entry:1.0821,tp:1.0840,tp2:0,sl:1.0805,conf:['RSI']},
      M15:{dir:'sell', score:62,entry:1.0821,tp:1.0790,tp2:1.0760,sl:1.0845,conf:['RSI','EMA']},
      H1: {dir:'sell', score:71,entry:1.0821,tp:1.0760,tp2:1.0720,sl:1.0870,conf:['RSI','EMA','MACD']},
      H4: {dir:'sell', score:79,entry:1.0821,tp:1.0700,tp2:1.0650,sl:1.0900,conf:['RSI','EMA','MACD','BB']},
      D:  {dir:'sell', score:85,entry:1.0821,tp:1.0620,tp2:1.0500,sl:1.0950,conf:['RSI','EMA','MACD','BB','VWAP']},
      W:  {dir:'neutral',score:52,entry:1.0821,tp:1.1000,tp2:0,sl:1.0600,conf:['EMA']},
    }},
    GBPUSD:{ tfs:{
      M5: {dir:'buy',score:55,entry:1.2640,tp:1.2670,tp2:0,sl:1.2615,conf:['EMA','RSI']},
      M15:{dir:'buy',score:63,entry:1.2640,tp:1.2700,tp2:1.2740,sl:1.2600,conf:['EMA','RSI','BB']},
      H1: {dir:'buy',score:74,entry:1.2640,tp:1.2750,tp2:1.2820,sl:1.2560,conf:['EMA','RSI','BB','MACD']},
      H4: {dir:'buy',score:80,entry:1.2640,tp:1.2850,tp2:1.2950,sl:1.2480,conf:['EMA','RSI','BB','MACD','VWAP']},
      D:  {dir:'buy',score:91,entry:1.2640,tp:1.3000,tp2:1.3200,sl:1.2300,conf:['EMA','RSI','BB','MACD','VWAP']},
      W:  {dir:'buy',score:86,entry:1.2640,tp:1.3200,tp2:0,sl:1.2000,conf:['EMA','BB','MACD','VWAP']},
    }},
  };
  state.assets = Object.keys(state.signals);
}

// ─── OHLCV ───────────────────────────────────────────────────────────────────

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

  // vol baseado no range real do sinal para escala correta
  const sl   = sig?.sl  || 0;
  const tp   = sig?.tp  || 0;
  const rangeTP = tp  ? Math.abs(tp  - base) : 0;
  const rangeSL = sl  ? Math.abs(sl  - base) : 0;
  const range   = Math.max(rangeTP, rangeSL, base * 0.0005);
  const vol  = range * 0.6;

  const step = {M5:300,M15:900,H1:3600,H4:14400,D:86400,W:604800}[tf]||3600;
  const now  = Math.floor(Date.now()/1000);

  // Começa fora do range do sinal para dar contexto visual
  const isUp = sig?.dir !== 'sell';
  let p = isUp ? base - range * 1.5 : base + range * 1.5;

  return Array.from({length:80},(_,i)=>{
    const time  = now-(79-i)*step;
    const open  = p;
    const bias  = isUp ? 0.52 : 0.48; // leve tendência na direção do sinal
    const move  = (Math.random()-( 1 - bias))*vol;
    const close = open+move;
    const high  = Math.max(open,close)+Math.random()*vol*0.3;
    const low   = Math.min(open,close)-Math.random()*vol*0.3;
    p = close;
    return {time,open,high,low,close};
  });
}

// ─── CHART ───────────────────────────────────────────────────────────────────

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
    rightPriceScale:{borderColor:c.border},
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
    price,color,lineWidth:1,
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

  // ENTRY: abaixo da barra em BUY, acima em SELL
  if(sig.entry)mkrs.push({
    time:last,
    position:isBuy?'belowBar':'aboveBar',
    color:c.text,shape:'circle',
    text:`ENTRY ${fmtPrice(sig.entry)}`,size:1
  });

  // TP: acima em BUY (preço maior), abaixo em SELL (preço menor)
  if(sig.tp)mkrs.push({
    time:last,
    position:isBuy?'aboveBar':'belowBar',
    color:c.up,
    shape:isBuy?'arrowUp':'arrowDown',
    text:`TP1 ${fmtPrice(sig.tp)}`,size:1
  });
  if(sig.tp2&&sig.tp2!==sig.tp)mkrs.push({
    time:last,
    position:isBuy?'aboveBar':'belowBar',
    color:c.up,
    shape:isBuy?'arrowUp':'arrowDown',
    text:`TP2 ${fmtPrice(sig.tp2)}`,size:1
  });

  // SL: abaixo em BUY, acima em SELL
  if(sig.sl)mkrs.push({
    time:last,
    position:isBuy?'belowBar':'aboveBar',
    color:c.dn,
    shape:isBuy?'arrowDown':'arrowUp',
    text:`SL ${fmtPrice(sig.sl)}`,size:1
  });

  state.candleSeries.setMarkers(mkrs);
  clearPL();
  addPL(sig.entry,'ENTRADA',c.text,true);
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
    state.chart.timeScale().fitContent();

    // Auto-escala Y para incluir Entry, TP e SL nas linhas de preço
    const sig=state.signals[sym]?.tfs[tf];
    if(sig){
      const prices=[sig.entry,sig.tp,sig.tp2,sig.sl].filter(Boolean);
      const candlePrices=candles.flatMap(c=>[c.high,c.low]);
      const allPrices=[...prices,...candlePrices];
      const minP=Math.min(...allPrices);
      const maxP=Math.max(...allPrices);
      const pad=(maxP-minP)*0.15;
      state.candleSeries.applyOptions({
        autoscaleInfoProvider:()=>({
          priceRange:{minValue:minP-pad,maxValue:maxP+pad},
          margins:{above:15,below:15}
        })
      });
    }
  }
  showLoading(false);
}

function showLoading(show){const el=document.getElementById('chart-loading');if(el)el.style.display=show?'flex':'none';}

// ─── UTILS ───────────────────────────────────────────────────────────────────

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

// ─── WATCHLIST ────────────────────────────────────────────────────────────────

function renderWatchlist(){
  const list=document.getElementById('wl-list');
  if(!list)return;
  list.innerHTML='';
  let visible=0;

  const query=(document.getElementById('search-input')?.value||'').trim().toUpperCase();

  state.assets.forEach(sym=>{
    if(query&&!sym.includes(query))return;

    const tfData=state.signals[sym]?.tfs[state.selTF]
               ||Object.values(state.signals[sym]?.tfs||{})[0];
    if(!tfData)return;

    const dir=getSummaryDir(sym);
    const score=tfData.score;
    if(score<state.minScore)return;
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
        <span class="wl-score-tf">${state.selTF}</span>
      </div>
      <div class="wl-bar-track"><div class="wl-bar-fill" style="width:${score}%"></div></div>`;

    card.addEventListener('click',()=>{state.selAsset=sym;renderAll();loadChart(sym,state.selTF);});
    list.appendChild(card);
  });

  if(visible===0){
    const msg=document.createElement('div');
    msg.className='wl-no-signals';
    msg.textContent=query?`SEM RESULTADO: ${query}`:`NENHUM SINAL ≥ ${state.minScore}`;
    list.appendChild(msg);
  }
  setText('wl-count',`${state.assets.length}/999`);
}

// ─── DETAIL ──────────────────────────────────────────────────────────────────

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

const ALL_IND=['RSI','EMA','MACD','BB','VWAP','ATR','STOCH','SAR'];
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

// ─── EVENTS ──────────────────────────────────────────────────────────────────

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
    renderWatchlist();
  });

  // Busca filtra a watchlist em tempo real
  document.getElementById('search-input')?.addEventListener('input',()=>renderWatchlist());

  // Enter seleciona o primeiro card visível
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
  await fetchSignals();
  if(state.selAsset)loadChart(state.selAsset,state.selTF);
  startPolling();
}

document.addEventListener('DOMContentLoaded',init);
