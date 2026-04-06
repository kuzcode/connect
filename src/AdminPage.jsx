import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getCurrentUser,
  registerAdmin,
  loginAdmin,
  getAdminByEmail,
  getConfigurationById,
  listNotesByConfigurationTimeRange,
  logoutCurrentSession,
  deleteConfigurationByConfigId,
  removeOwnedConfigurationFromAdmin,
  createTelegramStarsInvoiceLink,
  deleteNoteById,
} from './appwriteClient.js';
import './admin.css';
import edit from './icons/edit.png'
import delet from './icons/delete.png'
import view from './icons/view.png'
import star from './icons/star.png'

const DEFAULT_SERVICE_DURATION_MIN = 90;
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function getAdminDayKey(date) {
  const day = date.getDay();
  return DAY_KEYS[day === 0 ? 6 : day - 1];
}

function timeToMinutes(t) {
  if (typeof t !== 'string') return 0;
  const [h, m] = t.split(':').map(Number);
  return (Number(h) || 0) * 60 + (Number(m) || 0);
}

function getWorkScheduleFromSettings(rawSettings) {
  if (!rawSettings) return null;
  let obj = rawSettings;
  if (typeof rawSettings === 'string') {
    try {
      obj = JSON.parse(rawSettings);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== 'object') return null;

  const opt = obj.options && typeof obj.options === 'object' ? obj.options : {};
  const masterMode = opt.masterMode || 'me';
  const masterMe = opt.masterMe && typeof opt.masterMe === 'object' ? opt.masterMe : null;
  const masterOne = opt.masterOne && typeof opt.masterOne === 'object' ? opt.masterOne : null;
  const mastersList = Array.isArray(opt.masters) ? opt.masters : [];

  const scheduleSource = (() => {
    if (masterMode === 'me' && masterMe?.schedule && typeof masterMe.schedule === 'object') return masterMe.schedule;
    if (masterMode === 'one' && masterOne?.schedule && typeof masterOne.schedule === 'object') return masterOne.schedule;
    if (Array.isArray(mastersList) && mastersList[0]?.schedule && typeof mastersList[0].schedule === 'object') {
      return mastersList[0].schedule;
    }
    return null;
  })();

  if (!scheduleSource) return null;

  const result = {};
  for (const key of DAY_KEYS) {
    const slot = scheduleSource[key] || {};
    const breaks = Array.isArray(slot.breaks)
      ? slot.breaks
        .filter((b) => b && typeof b === 'object')
        .map((b) => ({
          start: typeof b.start === 'string' ? b.start : '13:00',
          end: typeof b.end === 'string' ? b.end : '14:00',
        }))
      : [];

    result[key] = {
      start: typeof slot.start === 'string' ? slot.start : '09:00',
      end: typeof slot.end === 'string' ? slot.end : '18:00',
      closed: Boolean(slot.closed),
      breaks,
    };
  }

  return result;
}

function getServiceDurationsFromSettings(rawSettings) {
  if (!rawSettings) return {};
  let obj = rawSettings;
  if (typeof rawSettings === 'string') {
    try {
      obj = JSON.parse(rawSettings);
    } catch {
      return {};
    }
  }
  if (!obj || typeof obj !== 'object') return {};

  const opt = obj.options && typeof obj.options === 'object' ? obj.options : {};
  const servicesList = Array.isArray(opt.services) ? opt.services : [];

  const map = {};
  for (const s of servicesList) {
    if (!s || typeof s.name !== 'string') continue;
    const name = s.name.trim();
    if (!name) continue;
    const durationMinutes = typeof s.durationMinutes === 'number' && s.durationMinutes > 0
      ? s.durationMinutes
      : DEFAULT_SERVICE_DURATION_MIN;
    map[name] = durationMinutes;
  }
  return map;
}

function getServicePricesFromSettings(rawSettings) {
  if (!rawSettings) return {};
  let obj = rawSettings;
  if (typeof rawSettings === 'string') {
    try {
      obj = JSON.parse(rawSettings);
    } catch {
      return {};
    }
  }
  if (!obj || typeof obj !== 'object') return {};

  const opt = obj.options && typeof obj.options === 'object' ? obj.options : {};
  const servicesList = Array.isArray(opt.services) ? opt.services : [];
  const prices = {};
  for (const s of servicesList) {
    if (!s || typeof s.name !== 'string') continue;
    const serviceName = s.name.trim();
    if (!serviceName) continue;
    const numeric = Number(s.price);
    prices[serviceName] = Number.isFinite(numeric) ? numeric : 0;
  }
  return prices;
}

function getNotificationsFromSettings(rawSettings) {
  if (!rawSettings) return { telegramEnabled: true, telegramChatId: '', telegramUsername: '' };
  let obj = rawSettings;
  if (typeof rawSettings === 'string') {
    try {
      obj = JSON.parse(rawSettings);
    } catch {
      return { telegramEnabled: true, telegramChatId: '', telegramUsername: '' };
    }
  }
  if (!obj || typeof obj !== 'object') return { telegramEnabled: true, telegramChatId: '', telegramUsername: '' };

  const opt = obj.options && typeof obj.options === 'object' ? obj.options : {};
  const notifications = opt.notifications && typeof opt.notifications === 'object' ? opt.notifications : {};
  return {
    telegramEnabled: notifications.telegramEnabled !== false,
    telegramChatId: typeof notifications.telegramChatId === 'string' ? notifications.telegramChatId : '',
    telegramUsername: typeof notifications.telegramUsername === 'string' ? notifications.telegramUsername : '',
  };
}

function getLocalDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatTimeRange(startIso, durationMinutes) {
  const d = new Date(startIso);
  const startH = d.getHours();
  const startM = d.getMinutes();
  const end = new Date(d.getTime() + Math.max(0, Number(durationMinutes) || 0) * 60 * 1000);
  return `${pad2(startH)}:${pad2(startM)}-${pad2(end.getHours())}:${pad2(end.getMinutes())}`;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function shiftDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [admin, setAdmin] = useState(null);
  const [error, setError] = useState(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState('register');
  const [ownedConfigs, setOwnedConfigs] = useState([]);
  const [ownsLoading, setOwnsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('calendar');
  const [dayOffset, setDayOffset] = useState(0);
  const [now, setNow] = useState(new Date());
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const [selectedConnectId, setSelectedConnectId] = useState(null);
  const [selectedBooking, setSelectedBooking] = useState(null);

  const [dayBookings, setDayBookings] = useState([]);
  const [statsBookings, setStatsBookings] = useState([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [hasMorePast, setHasMorePast] = useState(true);
  const [hasMoreFuture, setHasMoreFuture] = useState(true);

  const scrollContainerRef = useRef(null);
  const topSentinelRef = useRef(null);
  const bottomSentinelRef = useRef(null);
  const notesRequestIdRef = useRef(0);

  const navigate = useNavigate();

  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [balanceStarsInput, setBalanceStarsInput] = useState('300');
  const [balanceTopupSubmitting, setBalanceTopupSubmitting] = useState(false);
  const [balanceTopupError, setBalanceTopupError] = useState(null);

  useEffect(() => {
    async function init() {
      try {
        setLoading(true);
        const current = await getCurrentUser();
        if (!current?.email) {
          setUser(null);
          setAdmin(null);
          return;
        }

        setUser(current);

        const adminDoc = await getAdminByEmail(current.email);
        setAdmin(adminDoc);
      } catch (e) {
        console.error(e);
        setUser(null);
        setAdmin(null);
      } finally {
        setLoading(false);
      }
    }

    init();
  }, []);

  useEffect(() => {
    if (!showBalanceModal) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showBalanceModal]);

  useEffect(() => {
    if (!user?.email) return undefined;
    const reloadAdmin = async () => {
      try {
        const freshUser = await getCurrentUser();
        if (!freshUser?.email) return;
        const nextAdmin = await getAdminByEmail(freshUser.email);
        setAdmin(nextAdmin);
      } catch {
        // ignore
      }
    };
    window.addEventListener('focus', reloadAdmin);
    return () => window.removeEventListener('focus', reloadAdmin);
  }, [user?.email]);

  useEffect(() => {
    const id = setInterval(() => {
      setNow(new Date());
    }, 60 * 1000);

    return () => clearInterval(id);
  }, []);

  const adminBalanceStars = Number(admin?.balance) || 0;

  async function handleBalanceTopup() {
    setBalanceTopupError(null);
    const adminDocId = admin?.$id;
    if (!adminDocId) {
      setBalanceTopupError('Не удалось получить ID админа');
      return;
    }

    const starsNum = Number(balanceStarsInput);
    if (!Number.isFinite(starsNum) || starsNum <= 0) {
      setBalanceTopupError('Введите корректное количество звёзд');
      return;
    }

    const starsInt = Math.max(1, Math.floor(starsNum));
    setBalanceTopupSubmitting(true);
    try {
      const payload = `TOPUP:${adminDocId}:${starsInt}`;

      const url = await createTelegramStarsInvoiceLink({
        payload,
        title: 'Пополнение баланса',
        description: 'Оплата Telegram Stars',
        stars: starsInt,
      });

      window.open(url, '_blank', 'noopener,noreferrer');
      setShowBalanceModal(false);
    } catch (e) {
      setBalanceTopupError(e?.message || 'Не удалось создать счёт');
    } finally {
      setBalanceTopupSubmitting(false);
    }
  }

  useEffect(() => {
    async function loadOwnedConfigs() {
      if (!admin || !Array.isArray(admin.owns) || !admin.owns.length) {
        setOwnedConfigs([]);
        return;
      }

      const allHaveName = admin.owns.every((item) => item && typeof item.name === 'string' && item.name.trim());
      if (allHaveName) {
        setOwnedConfigs(admin.owns.map((item) => ({
          id: item.id,
          name: item.name,
        })));
        return;
      }

      setOwnsLoading(true);

      const result = [];

      for (const item of admin.owns) {
        try {
          const configId = typeof item === 'string' ? item : item.id || item.configId;
          if (!configId) continue;

          const doc = await getConfigurationById(configId);
          const raw = doc.settings;

          let nameFromSettings = '';

          if (raw && typeof raw === 'object') {
            nameFromSettings = raw.name || '';
          } else if (typeof raw === 'string') {
            try {
              const parsedJson = JSON.parse(raw);
              nameFromSettings = parsedJson.name || '';
            } catch {
              const compact = raw.replace(/\s+/g, ' ');
              const match = compact.match(/name\s*:\s*'([^']*)'/i);
              if (match) {
                nameFromSettings = match[1];
              }
            }
          }

          result.push({
            id: configId,
            configDocId: doc.$id,
            name: nameFromSettings || configId,
            serviceDurations: getServiceDurationsFromSettings(raw),
            servicePrices: getServicePricesFromSettings(raw),
            notifications: getNotificationsFromSettings(raw),
            workSchedule: getWorkScheduleFromSettings(raw),
          });
        } catch (e) {
          console.error(e);
        }
      }

      setOwnedConfigs(result);
      setOwnsLoading(false);
    }

    loadOwnedConfigs();
  }, [admin]);

  function formatDateLabel(offset) {
    const today = new Date();
    const target = new Date();
    target.setDate(today.getDate() + offset);

    const isSameDay =
      today.getFullYear() === target.getFullYear() &&
      today.getMonth() === target.getMonth() &&
      today.getDate() === target.getDate();

    if (isSameDay) return 'Сегодня';
    if (offset === -1) return 'Вчера';
    if (offset === 1) return 'Завтра';

    const months = [
      'января',
      'февраля',
      'марта',
      'апреля',
      'мая',
      'июня',
      'июля',
      'августа',
      'сентября',
      'октября',
      'ноября',
      'декабря',
    ];

    const day = target.getDate();
    const monthName = months[target.getMonth()] || '';

    return `${day} ${monthName}`;
  }

  function getNowLinePercent() {
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const totalMinutes = hours * 60 + minutes;
    const dayMinutes = 24 * 60;
    return (totalMinutes / dayMinutes) * 100;
  }

  async function handleRegister(e) {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      setError('Email и пароль обязательны');
      return;
    }

    try {
      setSubmitting(true);
      const { user: createdUser, adminDoc } = await registerAdmin({
        email: trimmedEmail,
        password: trimmedPassword,
      });

      setUser(createdUser);
      setAdmin(adminDoc);
      navigate('/admin', { replace: true });
    } catch (e) {
      console.error(e);
      setError(e.message || 'Ошибка регистрации');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      setError('Email и пароль обязательны');
      return;
    }

    try {
      setSubmitting(true);
      const { user: loggedInUser, adminDoc } = await loginAdmin({
        email: trimmedEmail,
        password: trimmedPassword,
      });

      setUser(loggedInUser);
      setAdmin(adminDoc);
      navigate('/admin', { replace: true });
    } catch (e) {
      console.error(e);
      setError(e.message || 'Ошибка входа');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    try {
      await logoutCurrentSession();
    } catch (e) {
      console.error(e);
    } finally {
      setShowLogoutConfirm(false);
      setUser(null);
      setAdmin(null);
      setEmail('');
      setPassword('');
      setMode('login');
      navigate('/admin', { replace: true });
    }
  }

  function handleViewService(serviceId) {
    navigate(`/${serviceId}`);
  }

  function handleEditService(serviceId) {
    navigate(`/admin/edit/${serviceId}`);
  }

  async function handleDeleteService(serviceId) {
    const firstConfirm = window.confirm('Удалить этот сервис?');
    if (!firstConfirm) return;

    const secondConfirm = window.confirm('Точно удалить? Это действие нельзя отменить.');
    if (!secondConfirm) return;

    try {
      await deleteConfigurationByConfigId(serviceId);
      await removeOwnedConfigurationFromAdmin(serviceId);
      setOwnedConfigs((prev) => prev.filter((item) => item.id !== serviceId));
    } catch (e) {
      console.error(e);
      setError(e.message || 'Не удалось удалить сервис');
    }
  }

  async function handleDeleteBooking() {
    const noteId = selectedBooking?.$id;
    if (!noteId) return;
    const ok = window.confirm('Удалить эту запись? Действие нельзя отменить.');
    if (!ok) return;

    try {
      await deleteNoteById(noteId);
      setSelectedBooking(null);
      setDayBookings((prev) => prev.filter((x) => x.$id !== noteId));
      setStatsBookings((prev) => prev.filter((x) => x.$id !== noteId));
      loadBookingsInitialFuture();
    } catch (e) {
      console.error(e);
      window.alert(e?.message || 'Не удалось удалить запись');
    }
  }

  async function ensureSelectedConnectMeta() {
    const selected = ownedConfigs.find((c) => c.id === selectedConnectId) || null;
    if (!selected) return null;

    if (selected.configDocId && selected.serviceDurations && selected.servicePrices && selected.notifications && selected.workSchedule) return selected;

    
    
    try {
      const doc = await getConfigurationById(selected.id);
      const raw = doc?.settings;
      const serviceDurations = getServiceDurationsFromSettings(raw);
      const servicePrices = getServicePricesFromSettings(raw);
      const workSchedule = getWorkScheduleFromSettings(raw);
      const notifications = getNotificationsFromSettings(raw);

      setOwnedConfigs((prev) => prev.map((c) => {
        if (c.id !== selected.id) return c;
        return { ...c, configDocId: doc.$id, serviceDurations, servicePrices, notifications, workSchedule };
      }));

      return { ...selected, configDocId: doc.$id, serviceDurations, servicePrices, notifications, workSchedule };
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  async function loadAllTimeRevenue(selected) {
    try {
      if (!selected?.configDocId) return;
      const servicePrices = selected.servicePrices || {};
      let cursorFromIso = undefined;
      let keepLoading = true;

      while (keepLoading) {
        const res = await listNotesByConfigurationTimeRange({
          configurationDocumentId: selected.configDocId,
          fromIso: cursorFromIso,
          limit: 500,
          order: 'asc',
        });
        const docs = res?.documents || [];
        for (const note of docs) {
          const serviceName = typeof note?.service === 'string' ? note.service.trim() : '';
        }

        if (docs.length < 500) {
          keepLoading = false;
        } else {
          const last = docs[docs.length - 1];
          const lastTime = last?.time ? new Date(last.time).getTime() : 0;
          cursorFromIso = new Date(lastTime + 1).toISOString();
        }
      }

    } catch (e) {
      console.error(e);
    }
  }

  async function loadStatsRange() {
    try {
      const selected = await ensureSelectedConnectMeta();
      if (!selected?.configDocId) return;

      setStatsLoading(true);
      const today = new Date();
      const fromIso = startOfDay(shiftDays(today, -10)).toISOString();
      const toIso = endOfDay(shiftDays(today, 10)).toISOString();

      const res = await listNotesByConfigurationTimeRange({
        configurationDocumentId: selected.configDocId,
        fromIso,
        toIso,
        limit: 500,
        order: 'asc',
      });

      setStatsBookings((res?.documents || []).slice().sort((a, b) => new Date(a.time) - new Date(b.time)));
      loadAllTimeRevenue(selected);
    } catch (e) {
      console.error(e);
      setStatsBookings([]);
    } finally {
      setStatsLoading(false);
    }
  }

  async function loadBookingsInitialFuture() {
    try {
      const selected = await ensureSelectedConnectMeta();
      if (!selected?.configDocId) return;

      const requestId = notesRequestIdRef.current + 1;
      notesRequestIdRef.current = requestId;

      setBookingsLoading(true);

      const dayDate = new Date();
      dayDate.setHours(0, 0, 0, 0);
      dayDate.setDate(dayDate.getDate() + dayOffset);

      const currentTime = new Date();
      const fromDate = dayOffset === 0
        ? new Date(dayDate)
        : (dayOffset > 0 ? new Date(Math.max(dayDate.getTime(), currentTime.getTime())) : dayDate);

      const toDate = new Date(dayDate);
      toDate.setHours(23, 59, 59, 999);

      const nowIso = fromDate.toISOString();
      const toIso = toDate.toISOString();

      const res = await listNotesByConfigurationTimeRange({
        configurationDocumentId: selected.configDocId,
        fromIso: nowIso,
        toIso,
        limit: 20,
        order: 'asc',
      });

      if (notesRequestIdRef.current !== requestId) return;
      const docs = res?.documents || [];
      setDayBookings(docs);
      loadStatsRange();
    } catch (e) {
      console.error(e);
      setDayBookings([]);
    } finally {
      setBookingsLoading(false);
    }
  }

  async function loadBookingsPast() {
    if (!dayBookings || dayBookings.length === 0) return;
    if (!hasMorePast) return;
    if (bookingsLoading) return;

    const selected = await ensureSelectedConnectMeta();
    if (!selected?.configDocId) return;

    const earliest = dayBookings[0];
    if (!earliest?.time) return;

    const requestId = notesRequestIdRef.current + 1;
    notesRequestIdRef.current = requestId;

    setBookingsLoading(true);
    try {
      const earliestIso = new Date(earliest.time).toISOString();
      const toIso = new Date(new Date(earliestIso).getTime() - 1).toISOString();
      const res = await listNotesByConfigurationTimeRange({
        configurationDocumentId: selected.configDocId,
        toIso,
        limit: 20,
        order: 'desc',
      });

      if (notesRequestIdRef.current !== requestId) return;
      const docsDesc = res?.documents || [];
      const docsAsc = docsDesc.slice().reverse();

      setHasMorePast(docsAsc.length === 20);

      setDayBookings((prev) => {
        const map = new Map((prev || []).map((d) => [d.$id, d]));
        for (const d of docsAsc) map.set(d.$id, d);
        return Array.from(map.values()).sort((a, b) => new Date(a.time) - new Date(b.time));
      });
    } catch (e) {
      if (notesRequestIdRef.current !== requestId) return;
      console.error(e);
    } finally {
      if (notesRequestIdRef.current === requestId) setBookingsLoading(false);
    }
  }

  async function loadBookingsNext() {
    if (!dayBookings || dayBookings.length === 0) return;
    if (!hasMoreFuture) return;
    if (bookingsLoading) return;

    const selected = await ensureSelectedConnectMeta();
    if (!selected?.configDocId) return;

    const latest = dayBookings[dayBookings.length - 1];
    if (!latest?.time) return;

    const requestId = notesRequestIdRef.current + 1;
    notesRequestIdRef.current = requestId;

    setBookingsLoading(true);
    try {
      const latestIso = new Date(latest.time).toISOString();
      const fromIso = new Date(new Date(latestIso).getTime() + 1).toISOString();
      const res = await listNotesByConfigurationTimeRange({
        configurationDocumentId: selected.configDocId,
        fromIso,
        limit: 20,
        order: 'asc',
      });

      if (notesRequestIdRef.current !== requestId) return;
      const docs = res?.documents || [];
      setHasMoreFuture(docs.length === 20);

      setDayBookings((prev) => {
        const map = new Map((prev || []).map((d) => [d.$id, d]));
        for (const d of docs) map.set(d.$id, d);
        return Array.from(map.values()).sort((a, b) => new Date(a.time) - new Date(b.time));
      });
    } catch (e) {
      if (notesRequestIdRef.current !== requestId) return;
      console.error(e);
    } finally {
      if (notesRequestIdRef.current === requestId) setBookingsLoading(false);
    }
  }

  useEffect(() => {
    if (ownedConfigs && ownedConfigs.length > 0 && !selectedConnectId) {
      setSelectedConnectId(ownedConfigs[0].id);
    }
  }, [ownedConfigs, selectedConnectId]);

  useEffect(() => {
    if (activeTab !== 'calendar') return;
    if (!selectedConnectId) return;
    setSelectedBooking(null);
    setDayBookings([]);
    setStatsBookings([]);
    loadBookingsInitialFuture();
  }, [activeTab, selectedConnectId, dayOffset]);

  useEffect(() => {
    const scrollEl = scrollContainerRef.current;
    if (!scrollEl) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;

          if (entry.target === topSentinelRef.current) {
            loadBookingsPast();
          } else if (entry.target === bottomSentinelRef.current) {
            loadBookingsNext();
          }
        }
      },
      {
        root: scrollEl,
        threshold: 0.1,
      },
    );

    if (topSentinelRef.current) observer.observe(topSentinelRef.current);
    if (bottomSentinelRef.current) observer.observe(bottomSentinelRef.current);

    return () => observer.disconnect();
  }, [hasMorePast, hasMoreFuture, bookingsLoading, activeTab, selectedConnectId, dayBookings]);

  if (loading) {
    return (
      <main className="admin-main">
        <p>Загрузка...</p>
      </main>
    );
  }

  
  
  
  if (!user) {
    return (
      <main className="auth-main">
        <section className="auth-card">
          <p className="auth-eyebrow">Авторизация</p>
          <h1 className="auth-title">{mode === 'register' ? 'Создай аккаунт' : 'Вход в кабинет'}</h1>
          <p className="auth-subtitle">Коннект — комфорт для клиента</p>

          {mode === 'register' ? (
            <form className="admin-form auth-form" onSubmit={handleRegister}>
              <label>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@gmail.com"
                  required
                />
              </label>

              <label>
                Пароль
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Минимум 8 символов"
                  required
                />
              </label>

              {error && <p className="error-text">{error}</p>}

              <button type="submit" className="auth-submit-btn" disabled={submitting}>
                {submitting ? 'Создаём...' : 'Создать аккаунт'}
              </button>

              <p style={{ color: '#555' }}>Уже есть аккаунт? <span style={{ color: '#000' }} onClick={() => { setMode('login') }}>Войди</span></p>
            </form>
          ) : (
            <form className="admin-form auth-form" onSubmit={handleLogin}>
              <label>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@domain.com"
                  required
                />
              </label>

              <label>
                Пароль
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </label>

              {error && <p className="error-text">{error}</p>}

              <button type="submit" className="auth-submit-btn" disabled={submitting}>
                {submitting ? 'Входим...' : 'Войти'}
              </button>
              <p style={{ color: '#555' }}>Нет аккаунта? <span style={{ color: '#000' }} onClick={() => { setMode('register') }}>Зарегистрируйся</span></p>
            </form>
          )}
        </section>
      </main>
    );
  }

  const owns = ownedConfigs;
  const isTodaySelected = dayOffset === 0;

  const selectedConnectForRender = selectedConnectId
    ? ownedConfigs.find((c) => c.id === selectedConnectId) || null
    : null;
  const serviceDurationsForRender = selectedConnectForRender?.serviceDurations || {};
  const servicePricesForRender = selectedConnectForRender?.servicePrices || {};
  const notificationsForRender = selectedConnectForRender?.notifications || null;
  const isTelegramNotBound = Boolean(
    notificationsForRender
    && !String(notificationsForRender.telegramChatId || '').trim()
    && !String(notificationsForRender.telegramUsername || '').trim(),
  );

  const dayDateForSchedule = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + dayOffset);
    return d;
  })();

  const dayKeyForSchedule = getAdminDayKey(dayDateForSchedule);
  const dayScheduleForRender = selectedConnectForRender?.workSchedule?.[dayKeyForSchedule] || {
    start: '09:00',
    end: '18:00',
    closed: false,
    breaks: [],
  };

  const workingStartMin = timeToMinutes(dayScheduleForRender.start);
  const workingEndMin = timeToMinutes(dayScheduleForRender.end);
  const workingWindowMinutes = Math.max(0, workingEndMin - workingStartMin);
  const breaksForRender = Array.isArray(dayScheduleForRender.breaks) ? dayScheduleForRender.breaks : [];
  
  
  const basePxPerMin = 32 / 60;
  const minWorkMinutes = 8 * 60;
  const scaleFactor = workingWindowMinutes > 0 && workingWindowMinutes < minWorkMinutes
    ? minWorkMinutes / workingWindowMinutes
    : 1;
  const pxPerMin = basePxPerMin * scaleFactor;
  const timelineHeightPx = workingWindowMinutes * pxPerMin;

  const timelineSegments = (() => {
    if (workingWindowMinutes <= 0) return [];
    const segments = [];
    const stepMin = 30;
    let m = workingStartMin;
    while (m < workingEndMin) {
      const segStart = m;
      const segEnd = Math.min(workingEndMin, m + stepMin);
      segments.push({ segStart, segEnd, heightPx: (segEnd - segStart) * pxPerMin });
      m = segEnd;
    }
    return segments;
  })();

  const nowTopPercent = (() => {
    if (!isTodaySelected) return null;
    if (workingWindowMinutes <= 0) return null;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    if (nowMin < workingStartMin || nowMin > workingEndMin) return null;
    return ((nowMin - workingStartMin) / workingWindowMinutes) * 100;
  })();

  const tsNow = Date.now();
  const clientsAheadCount = statsBookings.filter((n) => n?.time && new Date(n.time).getTime() >= tsNow).length;
  const clientsPastCount = statsBookings.filter((n) => n?.time && new Date(n.time).getTime() < tsNow).length;

  const todayForGraph = startOfDay(new Date());
  const graphPoints = [];
  for (let i = -7; i <= 10; i += 1) {
    const from = startOfDay(shiftDays(todayForGraph, i)).getTime();
    const to = endOfDay(shiftDays(todayForGraph, i)).getTime();
    const count = statsBookings.filter((note) => {
      const t = note?.time ? new Date(note.time).getTime() : 0;
      return t >= from && t <= to;
    }).length;
    graphPoints.push({ x: i + 7, count });
  }

  let graphPath = '';
  if (graphPoints.length) {
    const width = 100;
    const height = 100;
    const maxCount = Math.max(1, ...graphPoints.map((p) => p.count));
    const step = width / Math.max(1, graphPoints.length - 1);
    const coords = graphPoints.map((p, idx) => ({
      x: idx * step,
      y: height - (p.count / maxCount) * 80 - 10,
    }));
    if (coords.length === 1) {
      graphPath = `M ${coords[0].x} ${coords[0].y}`;
    } else if (coords.length === 2) {
      graphPath = `M ${coords[0].x} ${coords[0].y} L ${coords[1].x} ${coords[1].y}`;
    } else {
      // Smooth quadratic curve through points without loops.
      graphPath = `M ${coords[0].x} ${coords[0].y}`;
      for (let i = 1; i < coords.length - 1; i += 1) {
        const curr = coords[i];
        const next = coords[i + 1];
        const midX = (curr.x + next.x) / 2;
        const midY = (curr.y + next.y) / 2;
        graphPath += ` Q ${curr.x} ${curr.y}, ${midX} ${midY}`;
      }
      const prev = coords[coords.length - 2];
      const last = coords[coords.length - 1];
      graphPath += ` Q ${prev.x} ${prev.y}, ${last.x} ${last.y}`;
    }
  }

  return (
    <main className="admin-main">
      <section className="admin-header">
        <h4>Админ-панель</h4>
        <div className="admin-header-right">
          {admin ? (
            <button
              type="button"
              className="admin-balance-block"
              onClick={() => setShowBalanceModal(true)}
            >
              <img src={star} width={16} height={16} alt="" />
              <span className="admin-balance-number">{Math.floor(adminBalanceStars)}</span>
              <span className="admin-balance-unit">звёзд</span>
            </button>
          ) : null}
          <button
            type="button"
            className="admin-logout-btn"
            onClick={() => setShowLogoutConfirm(true)}
          >
            Выйти из аккаунта
          </button>
        </div>
      </section>

      <section className="admin-tabs">
        <button
          type="button"
          className={activeTab === 'calendar' ? 'admin-tab active' : 'admin-tab'}
          onClick={() => setActiveTab('calendar')}
        >
          Календарь
        </button>
        <button
          type="button"
          className={activeTab === 'connects' ? 'admin-tab active' : 'admin-tab'}
          onClick={() => setActiveTab('connects')}
        >
          Коннекты
        </button>
      </section>

      {activeTab === 'calendar' && ownedConfigs.length > 1 && (
        <div className="admin-calendar-top-connect-select">
          <select
            className="admin-connect-dropdown"
            value={selectedConnectId || (ownedConfigs[0] ? ownedConfigs[0].id : '')}
            onChange={(e) => {
              setSelectedConnectId(e.target.value);
              setSelectedBooking(null);
            }}
            disabled={ownsLoading || ownedConfigs.length === 0}
          >
            {ownedConfigs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {activeTab === 'calendar' && selectedConnectForRender && isTelegramNotBound && (
        <div className="admin-telegram-warning">
          <p>Telegram для уведомлений не привязан. Вы можете пропустить новые записи.</p>
          <button
            type="button"
            className="admin-telegram-warning-btn"
            onClick={() => navigate(`/admin/edit/${selectedConnectForRender.id}#telegram-binding`)}
          >
            Привязать Telegram
          </button>
        </div>
      )}

      {activeTab === 'calendar' && (
        <section className="admin-calendar">
          <header className="admin-calendar-header">
            <button
              type="button"
              className="calendar-nav-btn"
              onClick={() => setDayOffset((prev) => prev - 1)}
            >
              ←
            </button>
            <span className="calendar-date-label">{formatDateLabel(dayOffset)}</span>
            <button
              type="button"
              className="calendar-nav-btn"
              onClick={() => setDayOffset((prev) => prev + 1)}
            >
              →
            </button>
          </header>

          <div className="admin-calendar-body">
            <div className="calendar-hours">
              {timelineSegments.length > 0 ? (
                timelineSegments.map((seg) => {
                  const hour = Math.floor(seg.segStart / 60);
                  const label = seg.segStart % 60 === 0 ? `${pad2(hour)}:00` : '';
                  return (
                    <div
                      key={`${seg.segStart}-${seg.segEnd}`}
                      className="calendar-hour-row"
                      style={{ height: `${seg.heightPx}px` }}
                    >
                      <span>{label}</span>
                    </div>
                  );
                })
              ) : (
                <div className="calendar-hour-row" style={{ height: 40 }}>
                  <span />
                </div>
              )}
            </div>
            <div className="calendar-timeline">
              <div
                className="calendar-timeline-inner"
                style={{ height: `${timelineHeightPx}px` }}
              >
                {timelineSegments.length > 0 ? (
                  timelineSegments.map((seg) => (
                    <div
                      key={`slot-${seg.segStart}-${seg.segEnd}`}
                      className="calendar-slot-row"
                      style={{ height: `${seg.heightPx}px` }}
                    />
                  ))
                ) : null}

                {nowTopPercent != null && (
                  <div
                    className="calendar-now-line"
                    style={{ top: `${nowTopPercent}%` }}
                  />
                )}

                {timelineSegments.length > 0 &&
                  breaksForRender.map((br, idx) => {
                    if (!br?.start || !br?.end) return null;
                    const brStartMin = timeToMinutes(br.start);
                    const brEndMin = timeToMinutes(br.end);
                    const visibleStart = Math.max(workingStartMin, Math.min(workingEndMin, brStartMin));
                    const visibleEnd = Math.max(visibleStart, Math.min(workingEndMin, brEndMin));
                    if (visibleEnd <= visibleStart) return null;

                    const topPercent = ((visibleStart - workingStartMin) / Math.max(workingWindowMinutes, 1)) * 100;
                    const heightPercent = ((visibleEnd - visibleStart) / Math.max(workingWindowMinutes, 1)) * 100;

                    return (
                      <div
                        key={`${idx}-${brStartMin}-${brEndMin}`}
                        className="calendar-break-card"
                        style={{
                          top: `${topPercent}%`,
                          height: `${heightPercent}%`,
                          zIndex: 1,
                        }}
                      >
                        <p>Перерыв</p>
                      </div>
                    );
                  })}

                {dayBookings.map((note) => {
                  const d = new Date(note.time);
                  const startMinutes = d.getHours() * 60 + d.getMinutes();
                  const serviceName = typeof note.service === 'string' ? note.service.trim() : '';
                  const durationMin = (serviceName && serviceDurationsForRender[serviceName])
                    ? serviceDurationsForRender[serviceName]
                    : DEFAULT_SERVICE_DURATION_MIN;

                  
                  const visibleStart = Math.max(workingStartMin, Math.min(workingEndMin, startMinutes));
                  const visibleEnd = Math.max(visibleStart, Math.min(workingEndMin, startMinutes + durationMin));
                  if (visibleEnd <= visibleStart) return null;

                  const topPercent = ((visibleStart - workingStartMin) / Math.max(workingWindowMinutes, 1)) * 100;
                  const heightPercent = ((visibleEnd - visibleStart) / Math.max(workingWindowMinutes, 1)) * 100;

                  const timeLabel = formatTimeRange(note.time, durationMin);

                  return (
                    <button
                      key={note.$id}
                      type="button"
                      className="calendar-booking-card"
                      style={{
                        top: `${topPercent}%`,
                        height: `${heightPercent}%`,
                        zIndex: 2,
                      }}
                      onClick={() => setSelectedBooking(note)}
                    >
                      <p className="calendar-booking-card-name">{note.name || 'Клиент'}<span>, {serviceName ? serviceName : timeLabel}</span></p>
                    </button>
                  );
                })}

                {bookingsLoading ? (
                  <div className="calendar-loading-overlay" aria-hidden="true">
                    <div className="calendar-loader-card">
                      <div className="calendar-loader-spinner" />
                      <div className="calendar-loader-text">Загрузка записей...</div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      )}
      {activeTab === 'calendar' && (
        <section className="admin-dashboard-stats">
          <div className="admin-stats-grid">
            <div className="admin-stat-card">
              <p className="admin-stat-title">Клиентов впереди</p>
              <p className="admin-stat-value">{clientsAheadCount}</p>
            </div>
            <div className="admin-stat-card">
              <p className="admin-stat-title">Клиентов в прошлом</p>
              <p className="admin-stat-value">{clientsPastCount}</p>
            </div>
          </div>

          <div className="admin-stat-graph-card">
            <p className="admin-stat-title">Клиентов в день</p>
            <div className="admin-stat-graph">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <path d={graphPath} vectorEffect="non-scaling-stroke" />
              </svg>
            </div>
            <div className="admin-stat-graph-labels">
              <span>{formatDateLabel(-7)}</span>
              <span>{formatDateLabel(10)}</span>
            </div>
            {statsLoading ? <p className="admin-stat-loading">Обновляем статистику...</p> : null}
          </div>
        </section>
      )}

      {activeTab === 'connects' && (
        <section className="admin-services">
          <div
            type="button"
            className="service-card new-service"
            onClick={() => navigate('/admin/create')}
          >
            + Создать коннект
          </div>

          {ownsLoading && owns.length === 0 && (
            <p className="admin-hint">Загружаем ваши коннекты…</p>
          )}

          {owns.map((service) => (
            <div
              key={service.id || service.name}
              type="button"
              className="service-card"
              onClick={() => navigate(`/${service.id}`)}
            >
              <div>
                <h6>{service.name}</h6>
                <p>{service.id}</p>
              </div>

              <div className='btns'>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleViewService(service.id);
                  }}
                >
                  <img src={view} />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEditService(service.id);
                  }}
                >
                  <img src={edit} />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteService(service.id);
                  }}
                >
                  <img src={delet} />
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {showLogoutConfirm && (
        <div className="logout-modal-backdrop" role="dialog" aria-modal="true">
          <div className="logout-modal">
            <h3>Выйти из аккаунта?</h3>
            <p>Сюда можно будет вернуться :)</p>
            <div className="logout-modal-actions">
              <button
                type="button"
                className="logout-cancel-btn"
                onClick={() => setShowLogoutConfirm(false)}
              >
                Отмена
              </button>
              <button
                type="button"
                className="logout-confirm-btn"
                onClick={handleLogout}
              >
                Выйти
              </button>
            </div>
          </div>
        </div>
      )}

      {showBalanceModal && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (!balanceTopupSubmitting) setShowBalanceModal(false);
          }}
        >
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Баланс</h3>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: '#6e6e73', lineHeight: 1.4 }}>
              С баланса можно оплатить свои коннекты. Сейчас пополнение доступно только через Telegram Stars.
            </p>

            <label style={{ display: 'block' }}>
              <span className="modal-label" style={{ display: 'block', marginBottom: 8 }}>
                Сколько звёзд пополнить
              </span>
              <input
                type="number"
                min="1"
                step="1"
                value={balanceStarsInput}
                onChange={(e) => setBalanceStarsInput(e.target.value)}
                disabled={balanceTopupSubmitting}
              />
            </label>

            <p style={{ margin: '10px 0 0', fontSize: 13, color: '#1d1d1f' }}>
              ≈ <span style={{ fontFamily: 'sfb' }}>{Math.round(Number(balanceStarsInput) * 1.8 || 0)}₽</span>
            </p>

            {balanceTopupError ? (
              <p className="submit-error" style={{ marginTop: 12 }}>
                {balanceTopupError}
              </p>
            ) : null}

            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="secondary-button"
                disabled={balanceTopupSubmitting}
                onClick={() => setShowBalanceModal(false)}
              >
                Отмена
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={balanceTopupSubmitting}
                onClick={handleBalanceTopup}
              >
                {balanceTopupSubmitting ? 'Открываем Telegram...' : 'Далее'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedBooking && (
        <div className="logout-modal-backdrop" role="dialog" aria-modal="true">
          <div className="logout-modal admin-booking-modal">
            <h3>Детали записи</h3>
            <div className="admin-booking-modal-body">
              {(() => {
                const bookingName = selectedBooking?.name || '—';
                const serviceName = typeof selectedBooking?.service === 'string' ? selectedBooking.service.trim() : '';
                const durationMin = serviceName && serviceDurationsForRender?.[serviceName]
                  ? serviceDurationsForRender[serviceName]
                  : DEFAULT_SERVICE_DURATION_MIN;
                const dt = selectedBooking?.time ? new Date(selectedBooking.time) : null;
                const timeText = dt ? dt.toLocaleString() : '—';
                const timeRangeText = selectedBooking?.time ? formatTimeRange(selectedBooking.time, durationMin) : '—';

                const rawTelegram = String(selectedBooking?.username || '').trim();
                const telegramText = rawTelegram ? (rawTelegram.includes('@') ? rawTelegram : `@${rawTelegram}`) : '';
                const commentText = String(
                  selectedBooking?.comment || '',
                ).trim();
                const instaText = String(selectedBooking?.insta || selectedBooking?.instagram || '').trim();
                const phoneText = String(selectedBooking?.phone || selectedBooking?.phoneNumber || '').trim();
                const masterText = selectedBooking?.master ? selectedBooking.master : '';
                const placeText = selectedBooking?.place ? selectedBooking.place : '';

                return (
                  <div className="admin-booking-details">
                    <div className="admin-booking-row">
                      <div className="admin-booking-label">Клиент</div>
                      <div className="admin-booking-value">{bookingName}</div>
                    </div>

                    <div className="admin-booking-row">
                      <div className="admin-booking-label">Услуга</div>
                      <div className="admin-booking-value">{serviceName || timeRangeText}</div>
                    </div>

                    <div className="admin-booking-row">
                      <div className="admin-booking-label">Время</div>
                      <div className="admin-booking-value">{timeText}</div>
                    </div>

                    <div className="admin-booking-row">
                      <div className="admin-booking-label">Период</div>
                      <div className="admin-booking-value">{timeRangeText}</div>
                    </div>

                    {telegramText ? (
                      <div className="admin-booking-row">
                        <div className="admin-booking-label">Telegram</div>
                        <div className="admin-booking-value">{telegramText}</div>
                      </div>
                    ) : null}

                    {instaText ? (
                      <div className="admin-booking-row">
                        <div className="admin-booking-label">Instagram</div>
                        <div className="admin-booking-value">{instaText}</div>
                      </div>
                    ) : null}

                    {phoneText ? (
                      <div className="admin-booking-row">
                        <div className="admin-booking-label">Телефон</div>
                        <div className="admin-booking-value">{phoneText}</div>
                      </div>
                    ) : null}

                    {masterText ? (
                      <div className="admin-booking-row">
                        <div className="admin-booking-label">Мастер</div>
                        <div className="admin-booking-value">{masterText}</div>
                      </div>
                    ) : null}

                    {placeText ? (
                      <div className="admin-booking-row">
                        <div className="admin-booking-label">Филиал</div>
                        <div className="admin-booking-value">{placeText}</div>
                      </div>
                    ) : null}

                    {commentText ? (
                      <div className="admin-booking-row admin-booking-row-comment">
                        <div className="admin-booking-label">Комментарий</div>
                        <div className="admin-booking-value">{commentText}</div>
                      </div>
                    ) : null}
                  </div>
                );
              })()}
            </div>
            <div className="logout-modal-actions">
              <button
                type="button"
                className="admin-booking-delete-btn"
                onClick={handleDeleteBooking}
              >
                Удалить
              </button>
              <button
                type="button"
                className="logout-confirm-btn"
                onClick={() => setSelectedBooking(null)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default AdminPage;

