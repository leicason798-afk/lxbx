// ============================================================
// supabase-sync.js — 灵犀伴学 数据同步模块
// 策略：Supabase 为主，localStorage 为缓存/离线备用
// ============================================================

const SUPABASE_URL = 'https://ixwvbwwielgtytjriofy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4d3Zid3dpZWxndHl0anJpb2Z5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyODgzMzIsImV4cCI6MjA5MDg2NDMzMn0.uAYEeLwEql9h9xlP82JDTus2YhZpRbgLiz-R4x5nBxQ';

// ============================================================
// 底层请求封装
// ============================================================
async function sbFetch(path, options = {}) {
  const { data: session } = await sbAuth.getSession();
  const token = session?.access_token || SUPABASE_ANON_KEY;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || 'return=representation',
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('[supabase-sync] 请求失败', path, err);
    return null; // 静默失败
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ============================================================
// Auth — 注册 / 登录 / 登出 / 获取当前用户
// ============================================================
const sbAuth = {
  // 获取本地 session
  async getSession() {
    const raw = localStorage.getItem('sb_session');
    if (!raw) return { data: null };
    try { return { data: JSON.parse(raw) }; } catch { return { data: null }; }
  },

  // 保存 session 到 localStorage
  _saveSession(session) {
    if (session) localStorage.setItem('sb_session', JSON.stringify(session));
    else localStorage.removeItem('sb_session');
  },

  // 邮箱注册
  async signUp(email, password, userName = '小学者') {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email, password,
        data: { user_name: userName }
      }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error_description || data.error);
    this._saveSession(data.session || data);
    return data;
  },

  // 邮箱登录
  async signIn(email, password) {
    const res = await fetch(
      `${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error_description || data.error);
    this._saveSession(data);
    return data;
  },

  // 登出
  async signOut() {
    const { data: session } = await this.getSession();
    if (session?.access_token) {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${session.access_token}`,
        },
      }).catch(() => {});
    }
    this._saveSession(null);
    localStorage.removeItem('zhibanUser');
  },

  // 获取当前登录用户 ID
  async getUserId() {
    const { data } = await this.getSession();
    return data?.user?.id || null;
  },

  // 刷新 token（token 过期时调用）
  async refreshSession() {
    const { data: session } = await this.getSession();
    if (!session?.refresh_token) return null;
    const res = await fetch(
      `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    const data = await res.json();
    if (data.access_token) this._saveSession(data);
    return data;
  },
};

// ============================================================
// Users — 用户资料
// ============================================================
const sbUsers = {
  // 读取当前用户资料（优先 Supabase，失败用缓存）
  async get() {
    try {
      const uid = await sbAuth.getUserId();
      if (!uid) return this._fromLocal();
      const rows = await sbFetch(`users?id=eq.${uid}&select=*`);
      const user = rows?.[0] || null;
      if (user) this._toLocal(user); // 更新本地缓存
      return user;
    } catch {
      return this._fromLocal();
    }
  },

  // 更新用户资料（字段名用 camelCase，内部自动转 snake_case）
  async update(fields) {
    const uid = await sbAuth.getUserId();
    if (!uid) { this._patchLocal(fields); return; }

    const snake = camelToSnake(fields);
    try {
      const rows = await sbFetch(
        `users?id=eq.${uid}`,
        { method: 'PATCH', body: JSON.stringify(snake) }
      );
      this._patchLocal(fields);
      return rows?.[0];
    } catch {
      this._patchLocal(fields); // 离线时仅更新本地
    }
  },

  // 把 Supabase 数据同步回 zhibanUser localStorage
  _toLocal(user) {
    const local = JSON.parse(localStorage.getItem('zhibanUser') || '{}');
    Object.assign(local, {
      isLoggedIn: true,
      userName: user.user_name,
      avatarIndex: user.avatar_index,
      points: user.points,
      studyDays: user.study_days,
      ownedAvatars: user.owned_avatars || [0],
      premiumAvatar: user.premium_avatar,
      customAvatar: user.custom_avatar,
      autoLogin: user.auto_login,
    });
    localStorage.setItem('zhibanUser', JSON.stringify(local));
  },

  _fromLocal() {
    const raw = localStorage.getItem('zhibanUser');
    return raw ? JSON.parse(raw) : null;
  },

  _patchLocal(fields) {
    const local = JSON.parse(localStorage.getItem('zhibanUser') || '{}');
    Object.assign(local, fields);
    localStorage.setItem('zhibanUser', JSON.stringify(local));
  },
};

// ============================================================
// ChatSessions — 对话记录
// ============================================================
const sbChat = {
  async getAll() {
    try {
      const uid = await sbAuth.getUserId();
      if (!uid) return this._fromLocal();
      const rows = await sbFetch(
        `chat_sessions?user_id=eq.${uid}&order=updated_at.desc&select=*`
      );
      if (rows) this._toLocal(rows);
      return rows || [];
    } catch {
      return this._fromLocal();
    }
  },

  async save(session) {
    // session: {id, title, messages}
    const uid = await sbAuth.getUserId();
    if (!uid) { this._upsertLocal(session); return; }
    try {
      const payload = {
        id: session.id,
        user_id: uid,
        title: session.title,
        messages: session.messages,
      };
      await sbFetch(`chat_sessions`, {
        method: 'POST',
        prefer: 'return=minimal',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(payload),
      });
      this._upsertLocal(session);
    } catch {
      this._upsertLocal(session);
    }
  },

  async delete(sessionId) {
    const uid = await sbAuth.getUserId();
    if (uid) {
      await sbFetch(`chat_sessions?id=eq.${sessionId}&user_id=eq.${uid}`,
        { method: 'DELETE', prefer: 'return=minimal' }).catch(() => {});
    }
    this._deleteLocal(sessionId);
  },

  _toLocal(rows) {
    const mapped = rows.map(r => ({
      id: r.id, title: r.title,
      time: r.updated_at, messages: r.messages,
    }));
    localStorage.setItem('zhibanChatHistory', JSON.stringify(mapped));
  },
  _fromLocal() {
    return JSON.parse(localStorage.getItem('zhibanChatHistory') || '[]');
  },
  _upsertLocal(session) {
    const list = this._fromLocal();
    const idx = list.findIndex(s => s.id === session.id);
    if (idx >= 0) list[idx] = session; else list.unshift(session);
    localStorage.setItem('zhibanChatHistory', JSON.stringify(list));
  },
  _deleteLocal(id) {
    const list = this._fromLocal().filter(s => s.id !== id);
    localStorage.setItem('zhibanChatHistory', JSON.stringify(list));
  },
};

// ============================================================
// ErrorBook — 错题本
// ============================================================
const sbErrorBook = {
  async getAll() {
    try {
      const uid = await sbAuth.getUserId();
      if (!uid) return this._fromLocal();
      const rows = await sbFetch(
        `error_book?user_id=eq.${uid}&order=created_at.desc&select=*`
      );
      if (rows) this._toLocal(rows);
      return rows?.map(toCamel) || [];
    } catch {
      return this._fromLocal();
    }
  },

  async add(item) {
    const uid = await sbAuth.getUserId();
    if (!uid) { this._addLocal(item); return; }
    try {
      const payload = {
        id: item.id,
        user_id: uid,
        subject: item.subject,
        question: item.question,
        options: item.options,
        correct_idx: item.correctIdx,
        user_idx: item.userIdx,
        source: item.source,
        mastered: item.mastered || false,
        review_count: item.reviewCount || 0,
      };
      await sbFetch(`error_book`, {
        method: 'POST', prefer: 'return=minimal',
        body: JSON.stringify(payload),
      });
      this._addLocal(item);
    } catch {
      this._addLocal(item);
    }
  },

  async update(id, fields) {
    const uid = await sbAuth.getUserId();
    if (uid) {
      const snake = camelToSnake(fields);
      await sbFetch(`error_book?id=eq.${id}&user_id=eq.${uid}`,
        { method: 'PATCH', body: JSON.stringify(snake) }).catch(() => {});
    }
    this._updateLocal(id, fields);
  },

  async delete(id) {
    const uid = await sbAuth.getUserId();
    if (uid) {
      await sbFetch(`error_book?id=eq.${id}&user_id=eq.${uid}`,
        { method: 'DELETE', prefer: 'return=minimal' }).catch(() => {});
    }
    this._deleteLocal(id);
  },

  _toLocal(rows) {
    localStorage.setItem('zhibanErrorBook', JSON.stringify(rows.map(toCamel)));
  },
  _fromLocal() {
    return JSON.parse(localStorage.getItem('zhibanErrorBook') || '[]');
  },
  _addLocal(item) {
    const list = this._fromLocal();
    list.unshift(item);
    localStorage.setItem('zhibanErrorBook', JSON.stringify(list));
  },
  _updateLocal(id, fields) {
    const list = this._fromLocal().map(i => i.id === id ? { ...i, ...fields } : i);
    localStorage.setItem('zhibanErrorBook', JSON.stringify(list));
  },
  _deleteLocal(id) {
    const list = this._fromLocal().filter(i => i.id !== id);
    localStorage.setItem('zhibanErrorBook', JSON.stringify(list));
  },
};

// ============================================================
// TimerStats — 计时器统计
// ============================================================
const sbTimer = {
  async get(date) {
    // date: 'YYYY-MM-DD'
    try {
      const uid = await sbAuth.getUserId();
      if (!uid) return this._fromLocal(date);
      const rows = await sbFetch(
        `timer_stats?user_id=eq.${uid}&stat_date=eq.${date}&select=*`
      );
      return rows?.[0] ? {
        sessions: rows[0].sessions,
        minutes: rows[0].minutes,
        points: rows[0].points,
      } : { sessions: 0, minutes: 0, points: 0 };
    } catch {
      return this._fromLocal(date);
    }
  },

  async upsert(date, stats) {
    // stats: {sessions, minutes, points}
    const uid = await sbAuth.getUserId();
    const local = JSON.parse(localStorage.getItem('zhibanTimerStats') || '{}');
    local[date] = stats;
    localStorage.setItem('zhibanTimerStats', JSON.stringify(local));

    if (!uid) return;
    try {
      await sbFetch(`timer_stats`, {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          user_id: uid,
          stat_date: date,
          sessions: stats.sessions,
          minutes: stats.minutes,
          points: stats.points,
        }),
      });
    } catch { /* 离线，已存本地 */ }
  },

  async getAll() {
    try {
      const uid = await sbAuth.getUserId();
      if (!uid) return JSON.parse(localStorage.getItem('zhibanTimerStats') || '{}');
      const rows = await sbFetch(
        `timer_stats?user_id=eq.${uid}&select=*`
      );
      const map = {};
      rows?.forEach(r => {
        map[r.stat_date] = { sessions: r.sessions, minutes: r.minutes, points: r.points };
      });
      localStorage.setItem('zhibanTimerStats', JSON.stringify(map));
      return map;
    } catch {
      return JSON.parse(localStorage.getItem('zhibanTimerStats') || '{}');
    }
  },

  _fromLocal(date) {
    const all = JSON.parse(localStorage.getItem('zhibanTimerStats') || '{}');
    return all[date] || { sessions: 0, minutes: 0, points: 0 };
  },
};

// ============================================================
// Goals — 学习目标
// ============================================================
const sbGoals = {
  async getAll() {
    try {
      const uid = await sbAuth.getUserId();
      if (!uid) return this._fromLocal();
      const rows = await sbFetch(
        `goals?user_id=eq.${uid}&order=created_at.desc&select=*`
      );
      if (rows) this._toLocal(rows);
      return rows?.map(toCamel) || [];
    } catch {
      return this._fromLocal();
    }
  },

  async save(goal) {
    const uid = await sbAuth.getUserId();
    if (!uid) { this._upsertLocal(goal); return; }
    try {
      await sbFetch(`goals`, {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          id: goal.id,
          user_id: uid,
          title: goal.title,
          link: goal.link,
          total_days: goal.totalDays,
          daily_target: goal.dailyTarget,
          start_date: goal.startDate,
          end_date: goal.endDate,
          checked_days: goal.checkedDays,
          completed: goal.completed,
          reward: goal.reward,
        }),
      });
      this._upsertLocal(goal);
    } catch {
      this._upsertLocal(goal);
    }
  },

  async delete(id) {
    const uid = await sbAuth.getUserId();
    if (uid) {
      await sbFetch(`goals?id=eq.${id}&user_id=eq.${uid}`,
        { method: 'DELETE', prefer: 'return=minimal' }).catch(() => {});
    }
    const list = this._fromLocal().filter(g => g.id !== id);
    localStorage.setItem('zhibanGoals', JSON.stringify(list));
  },

  _toLocal(rows) {
    localStorage.setItem('zhibanGoals', JSON.stringify(rows.map(toCamel)));
  },
  _fromLocal() {
    return JSON.parse(localStorage.getItem('zhibanGoals') || '[]');
  },
  _upsertLocal(goal) {
    const list = this._fromLocal();
    const idx = list.findIndex(g => g.id === goal.id);
    if (idx >= 0) list[idx] = goal; else list.push(goal);
    localStorage.setItem('zhibanGoals', JSON.stringify(list));
  },
};

// ============================================================
// Checkins — 打卡
// ============================================================
const sbCheckins = {
  async getAll() {
    try {
      const uid = await sbAuth.getUserId();
      if (!uid) return JSON.parse(localStorage.getItem('zhibanCheckins') || '{}');
      const rows = await sbFetch(
        `checkins?user_id=eq.${uid}&select=*`
      );
      const map = {};
      rows?.forEach(r => { map[r.checkin_date] = r.count; });
      localStorage.setItem('zhibanCheckins', JSON.stringify(map));
      return map;
    } catch {
      return JSON.parse(localStorage.getItem('zhibanCheckins') || '{}');
    }
  },

  async checkin(date) {
    // 每天打卡，count+1
    const local = JSON.parse(localStorage.getItem('zhibanCheckins') || '{}');
    local[date] = (local[date] || 0) + 1;
    localStorage.setItem('zhibanCheckins', JSON.stringify(local));

    const uid = await sbAuth.getUserId();
    if (!uid) return;
    try {
      // 先查是否已有记录
      const rows = await sbFetch(
        `checkins?user_id=eq.${uid}&checkin_date=eq.${date}&select=id,count`
      );
      if (rows?.length) {
        await sbFetch(
          `checkins?id=eq.${rows[0].id}`,
          { method: 'PATCH', body: JSON.stringify({ count: rows[0].count + 1 }) }
        );
      } else {
        await sbFetch(`checkins`, {
          method: 'POST', prefer: 'return=minimal',
          body: JSON.stringify({ user_id: uid, checkin_date: date, count: 1 }),
        });
      }
    } catch { /* 离线，已存本地 */ }
  },
};

// ============================================================
// 工具函数
// ============================================================

// snake_case → camelCase（处理从 Supabase 取回的字段名）
function toCamel(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    out[camel] = v;
  }
  return out;
}

// camelCase → snake_case（写入 Supabase 时转换）
function camelToSnake(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const snake = k.replace(/([A-Z])/g, c => `_${c.toLowerCase()}`);
    out[snake] = v;
  }
  return out;
}

// ============================================================
// 初始化：页面加载时调用，从 Supabase 同步最新数据到本地缓存
// ============================================================
async function sbInit() {
  try {
    const uid = await sbAuth.getUserId();
    if (!uid) return false; // 未登录

    // 并行拉取用户资料
    await sbUsers.get();
    return true;
  } catch (e) {
    console.warn('[supabase-sync] 初始化失败，使用本地缓存', e);
    return false;
  }
}

// ============================================================
// 导出（兼容 script 标签直接引入，挂到 window）
// ============================================================
window.sbAuth     = sbAuth;
window.sbUsers    = sbUsers;
window.sbChat     = sbChat;
window.sbErrorBook= sbErrorBook;
window.sbTimer    = sbTimer;
window.sbGoals    = sbGoals;
window.sbCheckins = sbCheckins;
window.sbInit     = sbInit;
