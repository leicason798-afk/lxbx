/* ════════════════════════════════════════════════════════════
   灵犀伴学 · 等级 & 徽章系统 (全站共享模块)
   
   使用方法：在页面 </body> 前加：
     <script src="level-system.js"></script>
   
   模块会自动：
   - 注入导航栏等级徽章（如页面有 #navAvatar）
   - 监听积分变化，达到阈值时弹出升级庆祝
   - 提供 window.LevelSystem 全局 API
   ════════════════════════════════════════════════════════════ */

(function(){
  'use strict';

  /* ═══ 等级定义 ═══ */
  var LEVELS = [
    {idx:0, name:'学徒',   min:0,     color:'#94a3b8', gradient:'linear-gradient(135deg,#cbd5e1,#94a3b8)', icon:'📖', desc:'踏上学习之路的新手'},
    {idx:1, name:'书童',   min:500,   color:'#60a5fa', gradient:'linear-gradient(135deg,#93c5fd,#3b82f6)', icon:'📚', desc:'勤奋好学的小书童'},
    {idx:2, name:'学者',   min:1500,  color:'#18b47d', gradient:'linear-gradient(135deg,#6ee7b7,#10b981)', icon:'🎓', desc:'博闻强识的学者'},
    {idx:3, name:'博士',   min:3500,  color:'#a855f7', gradient:'linear-gradient(135deg,#d8b4fe,#a855f7)', icon:'🔬', desc:'学识渊博的博士'},
    {idx:4, name:'院士',   min:7000,  color:'#f59e0b', gradient:'linear-gradient(135deg,#fcd34d,#f59e0b)', icon:'🏛️', desc:'德高望重的院士'},
    {idx:5, name:'圣贤',   min:15000, color:'#ef4444', gradient:'linear-gradient(135deg,#fda4af,#ef4444,#f59e0b)', icon:'✨', desc:'智慧超群的圣贤'}
  ];

  /* ═══ 徽章定义 ═══ */
  var BADGES = [
    // 启程类
    {id:'first_chat',    name:'初出茅庐', icon:'🌱', desc:'完成第一次 AI 对话',           reward:50,  check:function(s){return (s.totalQuestions||0)>=1;}},
    {id:'first_exam',    name:'小试牛刀', icon:'🎯', desc:'参加第一场模拟考试',           reward:50,  check:function(s){return (s.examCount||0)>=1;}},
    {id:'first_checkin', name:'打卡初体验',icon:'✅', desc:'完成第一次打卡',               reward:30,  check:function(s){return (s.checkinDays||0)>=1;}},
    // 坚持类
    {id:'streak_7',      name:'学海无涯', icon:'🔥', desc:'连续学习 7 天',                 reward:100, check:function(s){return (s.streak||0)>=7;}},
    {id:'streak_30',     name:'坚持之心', icon:'💎', desc:'连续打卡 30 天',                 reward:300, check:function(s){return (s.streak||0)>=30;}},
    // 学科类
    {id:'math_100',      name:'数学小能手',icon:'🧮', desc:'数学速算累计答对 100 题',       reward:100, check:function(s){return (s.mathCorrect||0)>=100;}},
    {id:'idiom_50',      name:'成语达人', icon:'📜', desc:'成语冒险通关 50 次',             reward:100, check:function(s){return (s.idiomWins||0)>=50;}},
    {id:'chat_100',      name:'求知若渴', icon:'💬', desc:'与 AI 对话累计 100 次',           reward:100, check:function(s){return (s.totalQuestions||0)>=100;}},
    // 成绩类
    {id:'error_master',  name:'错题克星', icon:'📝', desc:'攻克 50 道错题',                 reward:150, check:function(s){return (s.masteredErrors||0)>=50;}},
    {id:'perfect_score', name:'满分王者', icon:'👑', desc:'单次考试获得 100 分',             reward:200, check:function(s){return (s.maxScore||0)>=100;}},
    {id:'top_ranker',    name:'榜上有名', icon:'🏆', desc:'进入排行榜前 10 名',             reward:150, check:function(s){return (s.bestRank||999)<=10 && (s.bestRank||0)>0;}},
    // 时长类
    {id:'study_3h',      name:'专注一刻', icon:'⏱️', desc:'累计专注学习 3 小时',             reward:80,  check:function(s){return (s.studyHours||0)>=3;}},
    {id:'study_10h',     name:'时间管理师',icon:'⏰', desc:'累计专注学习 10 小时',           reward:200, check:function(s){return (s.studyHours||0)>=10;}},
    // 等级类
    {id:'level_up',      name:'初次蜕变', icon:'🌟', desc:'首次升级',                       reward:80,  check:function(s){return (s.level||0)>=1;}},
    {id:'level_master',  name:'学有所成', icon:'🎖️', desc:'达到学者及以上等级',             reward:300, check:function(s){return (s.level||0)>=2;}},
  ];

  /* ═══ 工具函数 ═══ */
  function getUser(){
    try{return JSON.parse(localStorage.getItem('zhibanUser')||'{}');}
    catch(e){return {};}
  }
  function saveUser(u){
    try{
      localStorage.setItem('zhibanUser',JSON.stringify(u));
      if(window.sbUsers && u.points!==undefined){
        sbUsers.update({points:u.points}).catch(function(){});
      }
    }catch(e){}
  }

  /* 收集用户统计数据（用于徽章检测） */
  function collectUserStats(){
    var u=getUser();
    var stats={
      points:u.points||0,
      level:getLevelInfo(u.points||0).idx,
      streak:0,
      checkinDays:0,
      totalQuestions:0,
      mathCorrect:0,
      idiomWins:0,
      masteredErrors:0,
      maxScore:0,
      bestRank:999,
      examCount:0,
      studyHours:u.studyHours||0
    };
    // 打卡连续天数 & 总打卡天数
    try{
      var checkins=JSON.parse(localStorage.getItem('zhibanCheckins')||'{}');
      stats.checkinDays=Object.keys(checkins).filter(function(k){return checkins[k]>0;}).length;
      var d=new Date(),s=0;
      while(true){
        var y=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
        if(checkins[y]&&checkins[y]>0){s++;d.setDate(d.getDate()-1);}
        else break;
      }
      stats.streak=s;
    }catch(e){}
    // AI 对话次数
    try{
      var hist=JSON.parse(localStorage.getItem('zhibanChatHistory')||'[]');
      var total=0;
      hist.forEach(function(sess){
        if(sess.messages)total+=sess.messages.filter(function(m){return m.role==='user';}).length;
      });
      stats.totalQuestions=total;
    }catch(e){}
    // 数学速算正确数
    try{
      var mathStats=JSON.parse(localStorage.getItem('zhibanMathStats')||'{}');
      stats.mathCorrect=mathStats.totalCorrect||0;
    }catch(e){}
    // 成语冒险通关
    try{
      var idiomStats=JSON.parse(localStorage.getItem('zhibanIdiomStats')||'{}');
      stats.idiomWins=idiomStats.wins||0;
    }catch(e){}
    // 错题攻克
    try{
      var eb=JSON.parse(localStorage.getItem('zhibanErrorBook')||'[]');
      stats.masteredErrors=eb.filter(function(e){return e.mastered;}).length;
    }catch(e){}
    // 考试最高分 & 考试次数 & 排名
    try{
      var lb=JSON.parse(localStorage.getItem('zhibanLeaderboard')||'[]');
      var myName=u.userName||'匿名用户';
      var mine=lb.filter(function(r){return r.name===myName;});
      stats.examCount=mine.length;
      if(mine.length){
        stats.maxScore=Math.max.apply(null,mine.map(function(r){return r.score||0;}));
      }
      // 最高排名（在全站数据中的位置）
      var sorted=lb.slice().sort(function(a,b){return (b.score||0)-(a.score||0);});
      var myRank=sorted.findIndex(function(r){return r.name===myName;});
      if(myRank>=0)stats.bestRank=myRank+1;
    }catch(e){}
    return stats;
  }

  /* ═══ 等级计算 ═══ */
  function getLevelInfo(points){
    points=points||0;
    var current=LEVELS[0];
    for(var i=LEVELS.length-1;i>=0;i--){
      if(points>=LEVELS[i].min){current=LEVELS[i];break;}
    }
    var next=LEVELS[current.idx+1]||null;
    var progress=100;
    if(next){
      var span=next.min-current.min;
      progress=Math.min(100,Math.max(0,(points-current.min)/span*100));
    }
    return {
      idx:current.idx,
      name:current.name,
      color:current.color,
      gradient:current.gradient,
      icon:current.icon,
      desc:current.desc,
      min:current.min,
      next:next,
      progress:progress,
      pointsToNext:next?(next.min-points):0
    };
  }

  /* ═══ 徽章查询 ═══ */
  function getEarnedBadges(){
    try{return JSON.parse(localStorage.getItem('zhibanBadges')||'[]');}
    catch(e){return [];}
  }
  function saveEarnedBadges(list){
    localStorage.setItem('zhibanBadges',JSON.stringify(list));
  }

  /* 检查徽章触发，返回新获得的徽章列表 */
  function checkAndUnlockBadges(){
    var stats=collectUserStats();
    var earned=getEarnedBadges();
    var newly=[];
    BADGES.forEach(function(b){
      if(earned.indexOf(b.id)===-1 && b.check(stats)){
        earned.push(b.id);
        newly.push(b);
      }
    });
    if(newly.length){
      saveEarnedBadges(earned);
      // 奖励积分
      var u=getUser();
      var totalReward=newly.reduce(function(s,b){return s+b.reward;},0);
      u.points=(u.points||0)+totalReward;
      saveUser(u);
      // 记录积分日志
      try{
        var log=JSON.parse(localStorage.getItem('zhibanPointsLog')||'[]');
        newly.forEach(function(b){
          log.push({t:new Date().toISOString(),d:b.reward,r:'徽章「'+b.name+'」'});
        });
        if(log.length>200)log=log.slice(-200);
        localStorage.setItem('zhibanPointsLog',JSON.stringify(log));
      }catch(e){}
      // 弹出通知
      newly.forEach(function(b,i){
        setTimeout(function(){showBadgeToast(b);},i*1200);
      });
    }
    return newly;
  }

  /* ═══ 内置头像渲染数据（支持全部三种头像类型，无需依赖各页面函数） ═══ */
  var _AVATAR_BG = ['#fff7ed','#fce7f3','#fef3c7','#e0e7ff','#ecfdf5','#dbeafe'];
  var _ANIMAL_PATHS = [
    // 0: Fox
    '<circle cx="32" cy="36" r="20" fill="#fb923c"/><circle cx="32" cy="38" r="14" fill="#fff"/><polygon points="16,22 12,6 24,18" fill="#fb923c"/><polygon points="48,22 52,6 40,18" fill="#fb923c"/><polygon points="16,22 14,10 22,18" fill="#fff" opacity=".5"/><polygon points="48,22 50,10 42,18" fill="#fff" opacity=".5"/><circle cx="25" cy="34" r="2.8" fill="#1e293b"/><circle cx="39" cy="34" r="2.8" fill="#1e293b"/><circle cx="26" cy="33" r="1" fill="#fff"/><circle cx="40" cy="33" r="1" fill="#fff"/><ellipse cx="32" cy="39" rx="2.5" ry="2" fill="#1e293b"/><ellipse cx="23" cy="40" rx="4" ry="2" fill="#fca5a5" opacity=".25"/><ellipse cx="41" cy="40" rx="4" ry="2" fill="#fca5a5" opacity=".25"/>',
    // 1: Bunny
    '<circle cx="32" cy="40" r="18" fill="#fef9c3"/><circle cx="32" cy="40" r="18" fill="#fff" opacity=".5"/><ellipse cx="25" cy="14" rx="5" ry="14" fill="#fef9c3" stroke="#fde047" stroke-width=".5"/><ellipse cx="25" cy="14" rx="3" ry="10" fill="#fda4af" opacity=".4"/><ellipse cx="39" cy="14" rx="5" ry="14" fill="#fef9c3" stroke="#fde047" stroke-width=".5"/><ellipse cx="39" cy="14" rx="3" ry="10" fill="#fda4af" opacity=".4"/><circle cx="26" cy="37" r="2.5" fill="#1e293b"/><circle cx="38" cy="37" r="2.5" fill="#1e293b"/><circle cx="27" cy="36" r="1" fill="#fff"/><circle cx="39" cy="36" r="1" fill="#fff"/><ellipse cx="32" cy="42" rx="2" ry="1.5" fill="#fda4af"/>',
    // 2: Bear
    '<circle cx="32" cy="36" r="20" fill="#d4a574"/><circle cx="20" cy="20" r="7" fill="#d4a574"/><circle cx="44" cy="20" r="7" fill="#d4a574"/><circle cx="20" cy="20" r="4" fill="#f5deb3"/><circle cx="44" cy="20" r="4" fill="#f5deb3"/><circle cx="32" cy="40" r="10" fill="#f5deb3"/><circle cx="26" cy="34" r="2.8" fill="#1e293b"/><circle cx="38" cy="34" r="2.8" fill="#1e293b"/><circle cx="27" cy="33" r="1" fill="#fff"/><circle cx="39" cy="33" r="1" fill="#fff"/><ellipse cx="32" cy="39" rx="3.5" ry="2.5" fill="#1e293b"/>',
    // 3: Penguin
    '<ellipse cx="32" cy="36" rx="18" ry="22" fill="#334155"/><ellipse cx="32" cy="40" rx="12" ry="14" fill="#fff"/><circle cx="25" cy="30" r="3.5" fill="#fff"/><circle cx="39" cy="30" r="3.5" fill="#fff"/><circle cx="25" cy="30" r="1.8" fill="#1e293b"/><circle cx="39" cy="30" r="1.8" fill="#1e293b"/><circle cx="26" cy="29" r=".7" fill="#fff"/><circle cx="40" cy="29" r=".7" fill="#fff"/><polygon points="32,35 28,39 36,39" fill="#fbbf24"/>',
    // 4: Frog
    '<circle cx="32" cy="38" r="19" fill="#86efac"/><circle cx="22" cy="22" r="9" fill="#86efac"/><circle cx="42" cy="22" r="9" fill="#86efac"/><circle cx="22" cy="22" r="5" fill="#fff"/><circle cx="42" cy="22" r="5" fill="#fff"/><circle cx="22" cy="22" r="2.5" fill="#1e293b"/><circle cx="42" cy="22" r="2.5" fill="#1e293b"/><circle cx="23" cy="21" r="1" fill="#fff"/><circle cx="43" cy="21" r="1" fill="#fff"/><path d="M24 42 Q32 48 40 42" stroke="#1e293b" stroke-width="1.5" fill="none" stroke-linecap="round"/>',
    // 5: Cat
    '<circle cx="32" cy="38" r="19" fill="#94a3b8"/><circle cx="32" cy="40" r="13" fill="#e2e8f0"/><polygon points="16,24 12,6 24,22" fill="#94a3b8"/><polygon points="48,24 52,6 40,22" fill="#94a3b8"/><polygon points="16,24 14,10 22,20" fill="#fda4af" opacity=".3"/><polygon points="48,24 50,10 42,20" fill="#fda4af" opacity=".3"/><circle cx="25" cy="35" r="2.5" fill="#1e293b"/><circle cx="39" cy="35" r="2.5" fill="#1e293b"/><circle cx="26" cy="34" r="1" fill="#fff"/><circle cx="40" cy="34" r="1" fill="#fff"/><ellipse cx="32" cy="40" rx="2" ry="1.5" fill="#fda4af"/>'
  ];

  function _builtinGenerateAvatarSVG(idx, size){
    idx = (idx||0) % _AVATAR_BG.length;
    return '<svg viewBox="0 0 64 64" width="'+size+'" height="'+size+'" xmlns="http://www.w3.org/2000/svg" style="border-radius:50%"><rect width="64" height="64" rx="32" fill="'+_AVATAR_BG[idx]+'"/>'+_ANIMAL_PATHS[idx]+'</svg>';
  }

  /* 兜底完整头像渲染 — 支持 customAvatar / premiumAvatar / avatarIndex 全部三种类型 */
  function _builtinRenderNavAvatar(){
    var u = getUser();
    var av = document.getElementById('navAvatar');
    if(!av) return;
    if(!u.isLoggedIn){
      av.innerHTML = '<svg class="w-5 h-5 text-ocean-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.25a8.25 8.25 0 0115 0"/></svg>';
      return;
    }
    // 1. 自定义上传头像
    if(u.customAvatar){
      av.innerHTML = '<img src="'+u.customAvatar+'" style="width:36px;height:36px;object-fit:cover;border-radius:50%">';
      return;
    }
    // 2. 高级头像（用当前页面的 PREMIUM_AVATARS；若页面无此数据则 emoji 占位）
    if(u.premiumAvatar){
      if(window.PREMIUM_AVATARS){
        var pa = window.PREMIUM_AVATARS.find(function(a){return a.id===u.premiumAvatar;});
        if(pa){av.innerHTML = pa.svg(36); return;}
      }
      av.innerHTML = '<div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#a78bfa,#6366f1);display:flex;align-items:center;justify-content:center;font-size:18px">⭐</div>';
      return;
    }
    // 3. 默认动物头像
    av.innerHTML = _builtinGenerateAvatarSVG(u.avatarIndex||0, 36);
  }

  /* ═══ 全站头像同步 ═══ */
  function refreshNavAvatar(){
    try{
      // 优先调用页面自己的同步函数（保留页面 PREMIUM_AVATARS 等定制行为）
      if(typeof window._syncNavUser === 'function'){
        window._syncNavUser();
      }else if(typeof window.syncNavUser === 'function'){
        window.syncNavUser();
      }else{
        _builtinRenderNavAvatar();
      }
      // 同步等级徽章
      updateNavBadge();
    }catch(e){console.warn('refreshNavAvatar',e);}
  }

  /* ═══ UI: 导航栏等级徽章 ═══ */
  function injectNavBadge(){
    var avatar=document.getElementById('navAvatar');
    if(!avatar)return;
    // 避免重复注入
    if(document.getElementById('navLevelBadge'))return;
    var info=getLevelInfo(getUser().points||0);
    var badge=document.createElement('div');
    badge.id='navLevelBadge';
    badge.title=info.name+' · '+(getUser().points||0)+' 积分';
    badge.style.cssText='position:absolute;bottom:-4px;right:-4px;width:20px;height:20px;border-radius:50%;background:'+info.gradient+';border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:10px;z-index:2;box-shadow:0 2px 6px rgba(0,0,0,.2);cursor:pointer;font-weight:700;color:#fff';
    badge.textContent=info.idx+1;
    // 把头像容器设为 relative
    if(getComputedStyle(avatar).position==='static'){
      avatar.style.position='relative';
    }
    avatar.appendChild(badge);
    // Hover 显示详细信息气泡
    var popup=null;
    badge.addEventListener('mouseenter',function(ev){
      if(popup)return;
      var u=getUser();
      var i=getLevelInfo(u.points||0);
      popup=document.createElement('div');
      popup.style.cssText='position:absolute;top:100%;right:0;margin-top:10px;background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:14px;padding:14px;width:220px;box-shadow:0 10px 30px rgba(0,0,0,.12);z-index:1000;font-family:inherit;color:#1e293b';
      var nextHtml=i.next?('<div style="margin-top:8px"><div style="display:flex;justify-content:space-between;font-size:10px;color:#64748b;margin-bottom:4px"><span>距离「'+i.next.name+'」</span><span>'+i.pointsToNext+' 分</span></div><div style="height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden"><div style="height:100%;width:'+i.progress+'%;background:'+i.gradient+';border-radius:3px;transition:width .3s"></div></div></div>'):'<div style="margin-top:8px;text-align:center;font-size:11px;color:#f59e0b;font-weight:600">✨ 已达到最高等级 ✨</div>';
      popup.innerHTML='<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><div style="width:40px;height:40px;border-radius:50%;background:'+i.gradient+';display:flex;align-items:center;justify-content:center;font-size:20px">'+i.icon+'</div><div><div style="font-weight:700;font-size:14px">'+i.name+'</div><div style="font-size:11px;color:#64748b">'+(u.points||0)+' 积分</div></div></div><div style="font-size:11px;color:#94a3b8">'+i.desc+'</div>'+nextHtml;
      avatar.appendChild(popup);
    });
    badge.addEventListener('mouseleave',function(){
      if(popup){popup.remove();popup=null;}
    });
  }

  /* ═══ UI: 徽章获得 Toast ═══ */
  function showBadgeToast(badge){
    var t=document.createElement('div');
    t.style.cssText='position:fixed;top:90px;right:20px;background:linear-gradient(135deg,#fff,#fef9c3);border:2px solid #f59e0b;border-radius:16px;padding:14px 18px;box-shadow:0 10px 30px rgba(245,158,11,.25);z-index:99999;max-width:300px;font-family:inherit;transform:translateX(120%);transition:transform .4s cubic-bezier(.4,0,.2,1);cursor:pointer';
    t.innerHTML='<div style="display:flex;align-items:center;gap:12px"><div style="font-size:32px">'+badge.icon+'</div><div style="flex:1;min-width:0"><div style="font-size:10px;color:#f59e0b;font-weight:600;margin-bottom:2px">🎉 解锁新徽章</div><div style="font-weight:700;color:#1e293b;font-size:14px">'+badge.name+'</div><div style="font-size:11px;color:#64748b;margin-top:2px">'+badge.desc+'</div><div style="font-size:11px;color:#f59e0b;font-weight:700;margin-top:4px">+'+badge.reward+' 积分</div></div></div>';
    document.body.appendChild(t);
    requestAnimationFrame(function(){t.style.transform='translateX(0)';});
    t.addEventListener('click',function(){t.style.transform='translateX(120%)';setTimeout(function(){t.remove();},400);});
    setTimeout(function(){if(t.parentNode){t.style.transform='translateX(120%)';setTimeout(function(){t.remove();},400);}},5000);
  }

  /* ═══ UI: 升级庆祝弹窗 ═══ */
  function showLevelUpModal(oldLevel,newLevel){
    var overlay=document.createElement('div');
    overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.7);backdrop-filter:blur(8px);z-index:99998;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .4s;font-family:inherit';
    var box=document.createElement('div');
    box.style.cssText='background:#fff;border-radius:24px;padding:36px 44px;text-align:center;max-width:400px;box-shadow:0 20px 60px rgba(0,0,0,.3);transform:scale(.7);transition:transform .5s cubic-bezier(.34,1.56,.64,1);position:relative;overflow:hidden';
    box.innerHTML=
      '<div style="position:absolute;inset:0;background:'+newLevel.gradient+';opacity:.08;pointer-events:none"></div>'+
      '<div style="font-size:11px;color:#64748b;letter-spacing:2px;margin-bottom:6px;position:relative">LEVEL UP</div>'+
      '<div style="font-size:80px;margin:12px 0;position:relative;animation:levelUpBounce 1s ease-out">'+newLevel.icon+'</div>'+
      '<div style="position:relative">'+
        '<div style="font-size:13px;color:#94a3b8;text-decoration:line-through;margin-bottom:4px">'+oldLevel.name+'</div>'+
        '<div style="font-size:28px;font-weight:700;background:'+newLevel.gradient+';-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:8px">'+newLevel.name+'</div>'+
        '<div style="font-size:13px;color:#64748b;margin-bottom:20px">'+newLevel.desc+'</div>'+
        '<button id="lvUpClose" style="background:'+newLevel.gradient+';color:#fff;border:none;padding:10px 32px;border-radius:12px;font-weight:600;cursor:pointer;font-family:inherit;font-size:14px;box-shadow:0 4px 16px rgba(0,0,0,.15)">继续加油</button>'+
      '</div>';
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    // 添加动画样式
    if(!document.getElementById('lvUpStyle')){
      var st=document.createElement('style');
      st.id='lvUpStyle';
      st.textContent='@keyframes levelUpBounce{0%{transform:scale(0) rotate(-180deg)}60%{transform:scale(1.2) rotate(10deg)}100%{transform:scale(1) rotate(0)}}';
      document.head.appendChild(st);
    }
    requestAnimationFrame(function(){
      overlay.style.opacity='1';
      box.style.transform='scale(1)';
    });
    function close(){
      overlay.style.opacity='0';
      box.style.transform='scale(.7)';
      setTimeout(function(){overlay.remove();},400);
    }
    box.querySelector('#lvUpClose').addEventListener('click',close);
    overlay.addEventListener('click',function(e){if(e.target===overlay)close();});
  }

  /* ═══ 统一积分变动 API ═══ */
  function addPoints(delta,reason){
    var u=getUser();
    var oldLv=getLevelInfo(u.points||0);
    u.points=Math.max(0,(u.points||0)+delta);
    saveUser(u);
    var newLv=getLevelInfo(u.points);
    // 写入积分日志
    try{
      var log=JSON.parse(localStorage.getItem('zhibanPointsLog')||'[]');
      log.push({t:new Date().toISOString(),d:delta,r:reason||''});
      if(log.length>200)log=log.slice(-200);
      localStorage.setItem('zhibanPointsLog',JSON.stringify(log));
    }catch(e){}
    // 升级检测
    if(newLv.idx>oldLv.idx){
      setTimeout(function(){showLevelUpModal(oldLv,newLv);},400);
    }
    // 刷新导航栏徽章
    updateNavBadge();
    // 检测徽章
    setTimeout(function(){checkAndUnlockBadges();},300);
    return {oldLv:oldLv,newLv:newLv,leveledUp:newLv.idx>oldLv.idx};
  }

  function updateNavBadge(){
    var badge=document.getElementById('navLevelBadge');
    if(!badge){injectNavBadge();return;}
    var u=getUser();
    var info=getLevelInfo(u.points||0);
    badge.style.background=info.gradient;
    badge.textContent=info.idx+1;
    badge.title=info.name+' · '+(u.points||0)+' 积分';
  }

  /* ═══ 导出全局 API ═══ */
  window.LevelSystem={
    LEVELS:LEVELS,
    BADGES:BADGES,
    getLevelInfo:getLevelInfo,
    getEarnedBadges:getEarnedBadges,
    getUser:getUser,
    addPoints:addPoints,
    checkAndUnlockBadges:checkAndUnlockBadges,
    collectUserStats:collectUserStats,
    updateNavBadge:updateNavBadge,
    showLevelUpModal:showLevelUpModal,
    showBadgeToast:showBadgeToast
  };

  /* ═══ 页面加载自动初始化 ═══ */
  function init(){
    // 等待头像元素出现（有些页面是 JS 动态渲染的）
    var attempts=0;
    var timer=setInterval(function(){
      attempts++;
      var av=document.getElementById('navAvatar');
      if(av||attempts>20){
        clearInterval(timer);
        if(av){
          injectNavBadge();
          refreshNavAvatar();
        }
      }
    },250);
    // 延迟检查徽章（等页面数据就绪）
    setTimeout(function(){
      try{checkAndUnlockBadges();}catch(e){console.warn('badge check',e);}
    },1500);
  }

  /* ═══ 跨页面同步：头像/积分/等级 ═══ */
  // pageshow: 处理浏览器前进后退缓存（bfcache）— 这是 storage 事件不能触发的关键场景
  window.addEventListener('pageshow', function(ev){
    refreshNavAvatar();
  });
  // visibilitychange: 切换标签页回来时刷新
  document.addEventListener('visibilitychange', function(){
    if(!document.hidden) refreshNavAvatar();
  });
  // storage: 跨标签页同步（同标签页内不会触发）
  window.addEventListener('storage', function(ev){
    if(ev.key==='zhibanUser') refreshNavAvatar();
  });
  // focus: 窗口重新获得焦点
  window.addEventListener('focus', refreshNavAvatar);

  // 暴露给页面手动调用（保存头像后立即刷新）
  window.LevelSystem.refreshNavAvatar = refreshNavAvatar;

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',init);
  }else{
    init();
  }
})();
