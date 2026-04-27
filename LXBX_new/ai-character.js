// AI小人 — pixi-live2d-display v2

const _LIVE2D_SCRIPTS = [
  'https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js',
  'https://cdn.jsdelivr.net/gh/dylanNew/live2d/webgl/Live2D/lib/live2d.min.js',
  'https://cdn.jsdelivr.net/npm/pixi.js@6/dist/browser/pixi.min.js',
  'https://cdn.jsdelivr.net/npm/pixi-live2d-display/dist/index.min.js',
];

const _LIVE2D_MODELS = {
  chitose: 'https://cdn.jsdelivr.net/npm/live2d-widget-model-chitose@1.0.5/assets/chitose.model.json',
  nico:    'https://cdn.jsdelivr.net/npm/live2d-widget-model-nico@1.0.5/assets/nico.model.json',
  miku:    'https://cdn.jsdelivr.net/npm/live2d-widget-model-miku@1.0.5/assets/miku.model.json',
  wanko:   'https://cdn.jsdelivr.net/npm/live2d-widget-model-wanko@1.0.5/assets/wanko.model.json',
  tororo:  'https://cdn.jsdelivr.net/npm/live2d-widget-model-tororo@1.0.5/assets/tororo.model.json',
  hijiki:  'https://cdn.jsdelivr.net/npm/live2d-widget-model-hijiki@1.0.5/assets/hijiki.model.json',
};

const _GREETINGS_STUDY = [
  '今天复习了哪些知识点呢？','坚持每天学一点，进步看得见！',
  '试试给自己定个小目标吧~','学累了可以做做数学速算放松！',
  '知识农场的作物熟了，记得去收获哦~','今天的成语冒险挑战了吗？',
];
const _GREETINGS_ENCOURAGE = [
  '你已经很棒了，继续加油！','每一次努力都不会白费的~',
  '相信自己，你可以的！','今天比昨天又进步了呢！',
];
const _GREETINGS_FUN = [
  '点我点我！我会做动作哦~','嘿！别光看我，快去学习呀~',
  '我在这里陪你，不孤单！','休息一下也很重要哦~',
  '你知道吗？我是7个AI的合体！',
];
const _ALL_GREETINGS = [..._GREETINGS_STUDY, ..._GREETINGS_ENCOURAGE, ..._GREETINGS_FUN];

const _CLICK_RESPONSES = [
  '嘿嘿，被你发现了！','再点我就害羞了啦~',
  '去AI伴学问问题吧！','去知识农场浇浇水？',
  '积分够了可以换头像哦！','试试成语冒险吧，很有趣！',
  '数学速算最快多少秒？','我可以帮你制定学习计划哦~',
];

window._live2dScriptsReady = window._live2dScriptsReady || false;
window._live2dScriptCallbacks = window._live2dScriptCallbacks || [];

function _loadLive2DScripts(cb) {
  if (window._live2dScriptsReady) { cb(); return; }
  window._live2dScriptCallbacks.push(cb);
  if (window._live2dScriptCallbacks.length > 1) return;
  let i = 0;
  const next = () => {
    if (i >= _LIVE2D_SCRIPTS.length) {
      window._live2dScriptsReady = true;
      window._live2dScriptCallbacks.forEach(fn => fn());
      window._live2dScriptCallbacks = [];
      return;
    }
    const existing = [...document.querySelectorAll('script')].find(s => s.src === _LIVE2D_SCRIPTS[i]);
    if (existing) { i++; next(); return; }
    const s = document.createElement('script');
    s.src = _LIVE2D_SCRIPTS[i++];
    s.onload = next;
    s.onerror = next;
    document.head.appendChild(s);
  };
  next();
}

function _getLive2DSettings() {
  try {
    const u = JSON.parse(localStorage.getItem('zhibanUser') || '{}');
    return u.live2d || {};
  } catch { return {}; }
}

class AICharacter {
  constructor() {
    this.clickCount = 0;
    this.timer = null;
    _loadLive2DScripts(() => this._init());
  }

  _init() {
    const cfg = _getLive2DSettings();
    // 新用户没设置过 live2d，或主动关闭，直接不显示
    if (cfg.visible === false) return;
    if (!cfg.modelId) return;   // ← 没设置过形象就不显示
    const pos = cfg.pos || 'right';
    const modelId = cfg.modelId;
    const modelUrl = _LIVE2D_MODELS[modelId] || _LIVE2D_MODELS.chitose;

    const wrap = document.createElement('div');
    wrap.id = 'ai-character';
    Object.assign(wrap.style, {
      position:'fixed',bottom:'0',
      [pos==='left'?'left':'right']:'12px',
      zIndex:'1000',cursor:'pointer',width:'120px',height:'190px',
    });

    const bubble = document.createElement('div');
    bubble.id = 'ai-speech-bubble';
    Object.assign(bubble.style, {
      position:'absolute',bottom:'185px',
      [pos==='left'?'left':'right']:'0',
      background:'white',border:'1px solid #e2e8f0',
      borderRadius:'12px',padding:'10px 12px',
      maxWidth:'170px',fontSize:'12px',lineHeight:'1.5',
      boxShadow:'0 4px 15px rgba(0,0,0,0.08)',
      display:'none',zIndex:'1001',pointerEvents:'none',
      color:'#334155',fontFamily:'system-ui,sans-serif',
    });
    bubble.innerHTML = '<span id="ai-bubble-text"></span>';
    wrap.appendChild(bubble);

    const canvas = document.createElement('canvas');
    canvas.width = 120; canvas.height = 190;
    canvas.style.display = 'block';
    wrap.appendChild(canvas);
    document.body.appendChild(wrap);
    wrap.addEventListener('click', (e) => { if (!this._dragged) this._handleClick(); });
    this._makeDraggable(wrap);

    if (typeof PIXI === 'undefined' || typeof PIXI.live2d === 'undefined') {
      this._fallback(wrap, canvas); return; // fallback = 直接移除
    }

    const app = new PIXI.Application({view:canvas,width:120,height:190,transparent:true,backgroundAlpha:0});
    PIXI.live2d.Live2DModel.from(modelUrl).then(model => {
      app.stage.addChild(model);
      model.x=60;model.y=190;model.anchor.set(0.5,1);
      const scale = Math.min(120/model.internalModel.originalWidth,190/model.internalModel.originalHeight)*1.1;
      model.scale.set(scale);
      this._model = model;
      this.timer = setInterval(() => {
        if(Math.random()>.6) this._randomMotion();
        if(Math.random()>.75) this._showGreeting();
      }, 12000);
      setTimeout(() => this._showGreeting(), 2000);
    }).catch(() => this._fallback(wrap, canvas));
  }

  _handleClick() {
    this.clickCount++;
    this._showGreeting(_CLICK_RESPONSES[this.clickCount % _CLICK_RESPONSES.length]);
    this._randomMotion();
  }

  _makeDraggable(el) {
    let startX, startY, origX, origY, isDragging = false;
    this._dragged = false;

    const onStart = (e) => {
      const ev = e.touches ? e.touches[0] : e;
      startX = ev.clientX; startY = ev.clientY;
      const rect = el.getBoundingClientRect();
      origX = rect.left; origY = rect.top;
      isDragging = true; this._dragged = false;
      el.style.transition = 'none';
    };

    const onMove = (e) => {
      if (!isDragging) return;
      const ev = e.touches ? e.touches[0] : e;
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) this._dragged = true;
      if (!this._dragged) return;
      e.preventDefault();
      el.style.position = 'fixed';
      el.style.left = (origX + dx) + 'px';
      el.style.top = (origY + dy) + 'px';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    };

    const onEnd = () => {
      isDragging = false;
      el.style.transition = '';
      // Snap to edges
      const rect = el.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      if (midX < window.innerWidth / 2) {
        el.style.left = '4px'; el.style.right = 'auto';
      } else {
        el.style.left = 'auto'; el.style.right = '4px';
      }
      // Keep within viewport vertically
      let top = rect.top;
      if (top < 0) top = 0;
      if (top + rect.height > window.innerHeight) top = window.innerHeight - rect.height;
      el.style.top = top + 'px';
      el.style.bottom = 'auto';
    };

    el.addEventListener('mousedown', onStart);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    el.addEventListener('touchstart', onStart, { passive: false });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  }

  _randomMotion() {
    if(!this._model) return;
    try{this._model.motion('tap_body');}catch(_){}
  }

  _showGreeting(text) {
    const bubble=document.getElementById('ai-speech-bubble');
    const span=document.getElementById('ai-bubble-text');
    if(!bubble||!span) return;
    span.textContent = text || _ALL_GREETINGS[Math.floor(Math.random()*_ALL_GREETINGS.length)];
    bubble.style.display='block';
    clearTimeout(this._bubbleTimer);
    this._bubbleTimer = setTimeout(()=>{bubble.style.display='none';},4000);
  }

  _fallback(wrap, canvas) {
    // 加载失败静默处理，不显示任何内容
    wrap.remove();
  }

  showGreeting(text){this._showGreeting(text);}
  triggerAction(){this._randomMotion();}
  getCharacterOptions(){return[];}
  saveCharacter(){}
  stopAutoActions(){clearInterval(this.timer);}
}

let aiCharacter;
document.addEventListener('DOMContentLoaded',()=>{
  aiCharacter=new AICharacter();
  window.aiCharacter=aiCharacter;
});
if(typeof window!=='undefined'){window.AICharacter=AICharacter;}
