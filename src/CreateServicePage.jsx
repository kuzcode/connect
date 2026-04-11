import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import {
  configurationIdExists,
  createConfiguration,
  updateConfigurationByConfigId,
  getConfigurationById,
  addOwnedConfigurationToAdmin,
  createTelegramBindingCode,
  getTelegramBindingByCode,
  getCurrentUser,
  getAdminByEmail,
  getPromoByValue,
  updateAdminBalanceById,
  createTelegramStarsInvoiceLink,
  createConfigOrder,
} from './appwriteClient.js';
import './admin.css';
import star from './icons/star.png';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS = { mon: 'ПН', tue: 'ВТ', wed: 'СР', thu: 'ЧТ', fri: 'ПТ', sat: 'СБ', sun: 'ВС' };

const PURCHASE_PLANS = [
  { months: 1, stars: 300, label: '30 дней' },
  { months: 3, stars: 800, label: '3 месяца' },
  { months: 6, stars: 1500, label: '6 месяцев' },
  { months: 12, stars: 2800, label: '1 год' },
];

const STAR_TO_RUB_RATE = 1.8;

function timeLessOrEqual(a, b) {
  const [ah, am] = a.split(':').map(Number);
  const [bh, bm] = b.split(':').map(Number);
  return ah < bh || (ah === bh && am <= bm);
}
function clampEndAfterStart(start, end) {
  return timeLessOrEqual(start, end) ? end : start;
}
function clampStartBeforeEnd(start, end) {
  return timeLessOrEqual(start, end) ? start : end;
}

function defaultDaySlot() {
  return { start: '09:00', end: '18:00', closed: false, breaks: [] };
}

function defaultSchedule() {
  return DAY_KEYS.reduce((acc, key) => ({ ...acc, [key]: defaultDaySlot() }), {});
}

function defaultStaff() {
  return {
    name: '',
    avatar: '',
    description: '',
    branchName: '',
    schedule: defaultSchedule(),
  };
}

const DURATION_OPTIONS = [
  { value: 30, label: '30 мин' },
  { value: 60, label: '1 ч' },
  { value: 90, label: '1 ч 30 мин' },
  { value: 120, label: '2 ч' },
  { value: 150, label: '2 ч 30 мин' },
  { value: 180, label: '3 ч' },
];

function defaultService() {
  return {
    name: '',
    description: '',
    price: '',
    currency: 'RUB',
    durationMinutes: 90,
    allowedMasters: [],
  };
}

function BreakModalOverlay({
  start,
  end,
  onStartChange,
  onEndChange,
  onSave,
  onDelete,
  canDelete,
  onClose,
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  const content = (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Перерыв</h3>
        <div className="modal-row">
          <label>
            <span className="modal-label">Начало</span>
            <input type="time" value={start} onChange={(e) => onStartChange(e.target.value)} className="branch-input" />
          </label>
          <label>
            <span className="modal-label">Конец</span>
            <input type="time" value={end} onChange={(e) => onEndChange(e.target.value)} className="branch-input" />
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Отмена</button>
          {canDelete && (
            <button type="button" className="danger-button" onClick={onDelete}>Удалить</button>
          )}
          <button type="button" className="primary-button" onClick={onSave}>Сохранить</button>
        </div>
      </div>
    </div>
  );
  return createPortal(content, document.body);
}

function ContactModalOverlay({ title, value, placeholder, onChangeValue, onSave, onClose }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const content = (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{title}</h3>
        <div className="modal-row">
          <label>
            <span className="modal-label">Значение</span>
            <input
              type="text"
              value={value}
              placeholder={placeholder}
              onChange={(e) => onChangeValue(e.target.value)}
              className="branch-input"
            />
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="primary-button" onClick={onSave}>
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

function CreateServicePage() {
  const navigate = useNavigate();
  const { configId: routeConfigId } = useParams();

  const isEditMode = Boolean(routeConfigId);

  const [name, setName] = useState('');
  const [configId, setConfigId] = useState('');
  const [description, setDescription] = useState('');

  const [masterMode] = useState('me');
  const [masterMe, setMasterMe] = useState({ name: '', avatar: '', schedule: defaultSchedule() });
  const [masterOne, setMasterOne] = useState({ name: '', avatar: '', schedule: defaultSchedule() });
  const [masters, setMasters] = useState([defaultStaff()]);
  const [workSchedule, setWorkSchedule] = useState(defaultSchedule());
  const [breakModal, setBreakModal] = useState(null); // { dayKey, breakIndex }
  const [breakEdit, setBreakEdit] = useState({ start: '13:00', end: '14:00' });

  const [services, setServices] = useState([defaultService()]);
  const [addedServiceIndex, setAddedServiceIndex] = useState(null);

  const defaultContacts = {
    address: '',
    instagram: '',
    telegramChannel: '',
    telegramProfile: '',
    whatsapp: '',
    phone: '',
  };

  const [contacts, setContacts] = useState(defaultContacts);
  const [clientRequestFields, setClientRequestFields] = useState({
    telegram: false,
    instagram: false,
    phone: false,
  });
  const [telegramNotificationsEnabled, setTelegramNotificationsEnabled] = useState(true);
  const [telegramNotificationsChatId, setTelegramNotificationsChatId] = useState('');
  const [telegramBindingCode, setTelegramBindingCode] = useState('');
  const [telegramBindingLoading, setTelegramBindingLoading] = useState(false);
  const [telegramBindingStatus, setTelegramBindingStatus] = useState('');
  const [contactModal, setContactModal] = useState(null); // { key, title, placeholder }
  const [contactDraft, setContactDraft] = useState('');

  const [idStatus, setIdStatus] = useState('idle'); // idle | checking | available | taken | error
  const [idMessage, setIdMessage] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [initialLoading, setInitialLoading] = useState(false);

  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payPlanMonths, setPayPlanMonths] = useState(PURCHASE_PLANS[0]?.months || 1);
  const [promoCode, setPromoCode] = useState('');
  const [promoAttemptsLeft, setPromoAttemptsLeft] = useState(3);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoDoc, setPromoDoc] = useState(null);
  const [promoError, setPromoError] = useState(null);
  const [payAdminDoc, setPayAdminDoc] = useState(null);
  const [payDraftConfig, setPayDraftConfig] = useState(null); // { id, name, settingsString }
  const [payError, setPayError] = useState(null);
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [telegramWaiting, setTelegramWaiting] = useState(false);
  const [telegramInvoiceUrl, setTelegramInvoiceUrl] = useState('');

  const trimmedId = configId.trim();

  async function handleApplyPromo() {
    const v = promoCode.trim();
    setPromoError(null);
    if (!payModalOpen) return;
    if (promoLoading) return;
    if (promoAttemptsLeft <= 0) {
      setPromoError('Лимит попыток промокода исчерпан');
      return;
    }
    if (!v) {
      setPromoError('Введите промокод');
      return;
    }

    setPromoLoading(true);
    try {
      const doc = await getPromoByValue(v);
      setPromoDoc(doc);
      setPromoAttemptsLeft((x) => Math.max(0, x - 1));
      if (!doc) setPromoError('Промокод не найден');
    } catch (e) {
      setPromoDoc(null);
      setPromoError(e?.message || 'Не удалось проверить промокод');
      setPromoAttemptsLeft((x) => Math.max(0, x - 1));
    } finally {
      setPromoLoading(false);
    }
  }

  useEffect(() => {
    if (!payModalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [payModalOpen]);

  useEffect(() => {
    if (!isEditMode) {
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        setInitialLoading(true);
        setSubmitError(null);

        const doc = await getConfigurationById(routeConfigId);
        const raw = doc.settings;

        let parsed = { name: '', description: '', options: {} };

        if (raw && typeof raw === 'object') {
          parsed = {
            name: raw.name || '',
            description: raw.description || '',
            options: raw.options || {},
          };
        } else if (typeof raw === 'string') {
          try {
            const json = JSON.parse(raw);
            parsed = {
              name: json.name || '',
              description: json.description || '',
              options: json.options || {},
            };
          } catch {
            parsed = { name: '', description: raw || '', options: {} };
          }
        }

        if (!cancelled) {
          setName(parsed.name || '');
          setDescription(parsed.description || '');
          const opt = parsed.options;
          const sourceSchedule = (
            (opt.masterMe?.schedule && typeof opt.masterMe.schedule === 'object' && opt.masterMe.schedule)
            || (opt.masterOne?.schedule && typeof opt.masterOne.schedule === 'object' && opt.masterOne.schedule)
            || (Array.isArray(opt.masters) && opt.masters[0]?.schedule && typeof opt.masters[0].schedule === 'object' && opt.masters[0].schedule)
          );
          setWorkSchedule(
            sourceSchedule
              ? DAY_KEYS.reduce((acc, key) => ({
                ...acc,
                [key]: {
                  start: sourceSchedule[key]?.start ?? '09:00',
                  end: sourceSchedule[key]?.end ?? '18:00',
                  closed: Boolean(sourceSchedule[key]?.closed),
                  breaks: Array.isArray(sourceSchedule[key]?.breaks)
                    ? sourceSchedule[key].breaks.map((b) => ({ start: b.start ?? '13:00', end: b.end ?? '14:00' }))
                    : [],
                },
              }), {})
              : defaultSchedule(),
          );
          if (Array.isArray(opt.services) && opt.services.length > 0) {
            setServices(
              opt.services.map((s) => ({
                name: typeof s.name === 'string' ? s.name : '',
                description: typeof s.description === 'string' ? s.description : '',
                price: typeof s.price === 'string' || typeof s.price === 'number' ? String(s.price) : '',
                currency: s.currency === 'BYN' ? 'BYN' : 'RUB',
                durationMinutes: typeof s.durationMinutes === 'number' && s.durationMinutes > 0
                  ? s.durationMinutes
                  : 90,
                allowedMasters: Array.isArray(s.allowedMasters)
                  ? s.allowedMasters.filter((i) => Number.isInteger(i) && i >= 0)
                  : [],
              })),
            );
          }

          const optContacts = opt.contacts && typeof opt.contacts === 'object' ? opt.contacts : null;
          if (optContacts) {
            setContacts({
              address: typeof optContacts.address === 'string' ? optContacts.address : '',
              instagram: typeof optContacts.instagram === 'string' ? optContacts.instagram : '',
              telegramChannel: typeof optContacts.telegramChannel === 'string' ? optContacts.telegramChannel : '',
              telegramProfile: typeof optContacts.telegramProfile === 'string' ? optContacts.telegramProfile : '',
              whatsapp: typeof optContacts.whatsapp === 'string' ? optContacts.whatsapp : '',
              phone: typeof optContacts.phone === 'string' ? optContacts.phone : '',
            });
          } else {
            setContacts(defaultContacts);
          }
          const requestFields = opt.clientRequestFields && typeof opt.clientRequestFields === 'object'
            ? opt.clientRequestFields
            : {};
          setClientRequestFields({
            telegram: Boolean(requestFields.telegram),
            instagram: Boolean(requestFields.instagram),
            phone: Boolean(requestFields.phone),
          });

          const notifications = opt.notifications && typeof opt.notifications === 'object'
            ? opt.notifications
            : {};
          setTelegramNotificationsEnabled(notifications.telegramEnabled !== false);
          setTelegramNotificationsChatId(typeof notifications.telegramChatId === 'string' ? notifications.telegramChatId : '');
          setConfigId(routeConfigId);
        }
      } catch (e) {
        if (!cancelled) {
          console.error(e);
          setSubmitError(e.message || 'Не удалось загрузить конфигурацию для редактирования');
        }
      } finally {
        if (!cancelled) {
          setInitialLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [isEditMode, routeConfigId]);

  useEffect(() => {
    setMasterMe((prev) => ({ ...prev, schedule: workSchedule || defaultSchedule() }));
  }, [workSchedule]);

  useEffect(() => {
    if (addedServiceIndex === null) return;
    const t = setTimeout(() => setAddedServiceIndex(null), 400);
    return () => clearTimeout(t);
  }, [addedServiceIndex]);

  function getIdInputClassName() {
    if (idStatus === 'available') return 'id-input id-input-available';
    if (idStatus === 'taken') return 'id-input id-input-taken';
    if (idStatus === 'error') return 'id-input id-input-error';
    if (idStatus === 'checking') return 'id-input id-input-checking';
    return 'id-input';
  }

  async function handleCheckId() {
    if (isEditMode) {
      return;
    }

    setIdMessage('');

    const safeId = trimmedId;

    if (!safeId) {
      setIdStatus('error');
      setIdMessage('Введите ID, чтобы проверить доступность');
      return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(safeId)) {
      setIdStatus('error');
      setIdMessage('Используйте только латинские буквы, цифры, тире и нижнее подчёркивание');
      return;
    }

    try {
      setIdStatus('checking');
      const exists = await configurationIdExists(safeId);

      if (exists || safeId === 'admin') {
        setIdStatus('taken');
        setIdMessage('Такой ID уже используется');
      } else {
        setIdStatus('available');
        setIdMessage('ID свободен');
      }
    } catch (e) {
      console.error(e);
      setIdStatus('error');
      setIdMessage('Не удалось проверить ID. Попробуйте ещё раз.');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setSubmitError(null);

    const safeName = name.trim();
    const safeId = isEditMode ? (routeConfigId || '').trim() : trimmedId;

    if (!safeName) {
      setSubmitError('Название обязательно');
      return;
    }

    if (!safeId) {
      setSubmitError('ID обязателен');
      return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(safeId)) {
      setSubmitError('ID может содержать только латиницу, цифры, тире и нижнее подчёркивание');
      return;
    }

    try {
      setSubmitting(true);

      const scheduleToSave = masterMe.schedule || workSchedule || defaultSchedule();

      const settingsObject = {
        name: safeName,
        description: description.trim(),
        options: {
          masterMode: 'me',
          masterMe: { name: '', avatar: '', schedule: scheduleToSave },
          masterOne: { name: '', avatar: '', schedule: defaultSchedule() },
          masters: [],
          contacts: {
            address: contacts.address.trim(),
            instagram: contacts.instagram.trim(),
            telegramChannel: contacts.telegramChannel.trim(),
            telegramProfile: contacts.telegramProfile.trim(),
            whatsapp: contacts.whatsapp.trim(),
            phone: contacts.phone.trim(),
          },
          // Управляет тем, какие дополнительные поля будет видеть клиент в форме записи.
          clientRequestFields: {
            telegram: Boolean(clientRequestFields.telegram),
            instagram: Boolean(clientRequestFields.instagram),
            phone: Boolean(clientRequestFields.phone),
          },
          notifications: {
            telegramEnabled: Boolean(telegramNotificationsEnabled),
            telegramChatId: telegramNotificationsEnabled ? telegramNotificationsChatId : '',
          },
          services: services.map((s) => ({
            name: s.name.trim(),
            description: s.description.trim(),
            price: s.price.trim(),
            currency: s.currency === 'BYN' ? 'BYN' : 'RUB',
            durationMinutes: typeof s.durationMinutes === 'number' && s.durationMinutes > 0 ? s.durationMinutes : 90,
            allowedMasters: [],
          })),
        },
      };

      const settingsString = JSON.stringify(settingsObject);

      if (isEditMode) {
        await updateConfigurationByConfigId(safeId, {
          settings: settingsString,
          name: safeName,
        });
        navigate(`/${safeId}`);
      } else {
        if (idStatus !== 'available') {
          const exists = await configurationIdExists(safeId);
          if (exists) {
            setIdStatus('taken');
            setIdMessage('Такой ID уже используется');
            setSubmitError('Выберите другой ID — этот уже занят');
            return;
          }
        }

        const current = await getCurrentUser();
        const adminDoc = await getAdminByEmail(current?.email || '');

        if (!adminDoc) {
          throw new Error('Админ-документ не найден. Попробуйте перезайти.');
        }

        setPayAdminDoc(adminDoc);
        setPayDraftConfig({
          id: safeId,
          name: safeName,
          settingsString,
        });
        setPromoCode('');
        setPromoDoc(null);
        setPromoAttemptsLeft(3);
        setPromoError(null);
        setPayPlanMonths(PURCHASE_PLANS[0]?.months || 1);
        setPayError(null);
        setTelegramInvoiceUrl('');
        setPayModalOpen(true);
      }
    } catch (e) {
      console.error(e);
      setSubmitError(e.message || 'Не удалось создать конфигурацию');
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (!telegramWaiting || !payDraftConfig?.id) return undefined;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 40; // ~2 минуты

    const timer = setInterval(async () => {
      attempts += 1;
      try {
        const doc = await getConfigurationById(payDraftConfig.id);
        const t = doc?.payedUntil ? new Date(doc.payedUntil).getTime() : 0;
        if (Number.isFinite(t) && t > Date.now()) {
          clearInterval(timer);
          if (cancelled) return;
          setTelegramWaiting(false);
          setPayModalOpen(false);
          navigate(`/${payDraftConfig.id}`);
        }
      } catch {
        // ignore while waiting
      }

      if (attempts >= maxAttempts) {
        clearInterval(timer);
        if (cancelled) return;
        setTelegramWaiting(false);
        setPayError('Не дождались активации. Попробуйте позже обновить страницу.');
      }
    }, 3000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [telegramWaiting, payDraftConfig, navigate]);

  useEffect(() => {
    handleGenerateTelegramBindingCode({ resetChatId: false });
  }, [telegramNotificationsEnabled]);

  useEffect(() => {
    if (!telegramNotificationsEnabled) return;
    if (telegramBindingLoading) return;
  }, [telegramNotificationsEnabled, telegramNotificationsChatId, telegramBindingCode, telegramBindingLoading]);

  useEffect(() => {
    if (window.location.hash !== '#telegram-binding') return;
    const timer = setTimeout(() => {
      const target = document.getElementById('telegram-binding');
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
    return () => clearTimeout(timer);
  }, []);

  if (isEditMode && initialLoading) {
    return (
      <main className="create-service-main">
        <section className="create-card">
          <header className="create-card-header">
            <p className="eyebrow">Редактирование</p>
            <h1>Загрузка конфигурации...</h1>
          </header>
        </section>
      </main>
    );
  }

  const selectedPlan = PURCHASE_PLANS.find((p) => p.months === payPlanMonths) || PURCHASE_PLANS[0];
  const baseStars = Number(selectedPlan?.stars) || 0;
  const promoDiscountStarsInt = promoDoc?.amount != null ? Math.max(0, Math.floor(Number(promoDoc.amount) || 0)) : 0;
  const requiredStarsInt = Math.max(0, Math.floor(baseStars - promoDiscountStarsInt));
  const requiredRub = requiredStarsInt * STAR_TO_RUB_RATE;

  function addMonthsIso(months) {
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    return d.toISOString();
  }

  async function createPaidConfig({ months }) {
    if (!payDraftConfig?.id || !payDraftConfig?.settingsString) return;
    const payedUntilIso = addMonthsIso(months);
    await createConfiguration({
      id: payDraftConfig.id,
      name: payDraftConfig.name,
      settings: payDraftConfig.settingsString,
      payedUntil: payedUntilIso,
    });
    setPayModalOpen(false);
    navigate(`/${payDraftConfig.id}`);
  }

  async function handlePayFromBalance() {
    if (!payAdminDoc || !payDraftConfig) return;
    setPayError(null);
    setPaySubmitting(true);
    try {
      if (requiredStarsInt <= 0) {
        await createPaidConfig({ months: payPlanMonths });
        return;
      }

      const currentBalance = Number(payAdminDoc.balance) || 0;
      if (currentBalance < requiredStarsInt) {
        setPayError('Недостаточно звёзд на балансе для оплаты');
        return;
      }

      const nextBalance = Math.max(0, currentBalance - requiredStarsInt);
      await updateAdminBalanceById(payAdminDoc.$id, nextBalance);
      await createPaidConfig({ months: payPlanMonths });
    } catch (e) {
      setPayError(e?.message || 'Не удалось оплатить');
    } finally {
      setPaySubmitting(false);
    }
  }

  async function handlePayViaTelegram() {
    if (!payAdminDoc || !payDraftConfig) return;
    setPayError(null);
    setPaySubmitting(true);
    try {
      if (requiredStarsInt <= 0) {
        await createPaidConfig({ months: payPlanMonths });
        return;
      }

      const orderDoc = await createConfigOrder({
        adminDocId: payAdminDoc.$id,
        configId: payDraftConfig.id,
        name: payDraftConfig.name,
        settings: payDraftConfig.settingsString,
        months: payPlanMonths,
      });

      const payload = `PURCHASE:${orderDoc.$id}`;

      const url = await createTelegramStarsInvoiceLink({
        payload,
        title: 'Оплата платного коннекта',
        description: 'Telegram Stars',
        stars: requiredStarsInt,
      });

      window.open(url, '_blank', 'noopener,noreferrer');
      setTelegramInvoiceUrl(url);
      setTelegramWaiting(true);
    } catch (e) {
      setPayError(e?.message || 'Не удалось создать счёт в Telegram');
    } finally {
      setPaySubmitting(false);
    }
  }

  async function handleVerifyTelegramBinding() {
    const code = String(telegramBindingCode || '').trim();
    if (!code) return;

    setTelegramBindingStatus('Проверяем...');
    try {
      const bindingDoc = await getTelegramBindingByCode(code);
      const telegramUserId = bindingDoc?.telegramUserId || bindingDoc?.userId || bindingDoc?.chatId;

      const idNum = Number(telegramUserId);
      if (!Number.isFinite(idNum) || idNum <= 0) {
        setTelegramBindingStatus('Код найден, но Telegram ещё не привязан. Введите код в боте и проверьте снова.');
        return;
      }

      setTelegramNotificationsChatId(String(idNum));
      setTelegramBindingStatus('Аккаунт успешно привязан');
    } catch (e) {
      console.error(e);
      setTelegramBindingStatus('Ошибка проверки привязки Telegram.');
    }
  }

  async function handleGenerateTelegramBindingCode({ resetChatId = false } = {}) {
    const reset = Boolean(resetChatId);
    setTelegramBindingStatus('');
    setTelegramBindingLoading(true);
    try {
      if (reset) {
        setTelegramNotificationsChatId('');
        setTelegramBindingCode('');
      }
      const code = await createTelegramBindingCode();
      setTelegramBindingCode(code);
      setTelegramBindingStatus('Код сгенерирован. Открой бота и введи эти 6 цифр.');
    } catch (e) {
      console.error(e);
      setTelegramBindingStatus(e?.message || 'Не удалось сгенерировать код привязки Telegram.');
    } finally {
      setTelegramBindingLoading(false);
    }
  }

  return (
    <main className="create-service-main">
      <section className="create-card">
        <header className="create-card-header">
          <p className="eyebrow">{isEditMode ? 'Редактирование' : 'Новый коннект'}</p>
          <div className="row">
            <img src={star} width={20} height={20} />
            <h1>Комфортное бронирование</h1>
          </div>
        </header>

        <form className="create-form" onSubmit={handleSubmit}>
          <div className="field">
            <div className="field-header">
              <label htmlFor="service-name">Название</label>
              <span className="field-badge">Обязательно</span>
            </div>
            <p className="field-help">
              Первое, что она увидит
            </p>
            <input
              id="service-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Название"
              autoFocus
            />
          </div>

          <div className="field">
            <div className="field-header">
              <label htmlFor="service-id">ID сервиса</label>
              <span className="field-badge">Обязательно</span>
            </div>
            <p className="field-help">
              Уникальный адрес: https://cnct.click/<span className='colored'>{configId}</span>
            </p>

            <div className="id-row">
              <input
                id="service-id"
                type="text"
                value={configId}
                onChange={(e) => {
                  setConfigId(e.target.value);
                  setIdStatus('idle');
                  setIdMessage('');
                }}
                className={getIdInputClassName()}
                placeholder="my-service"
                disabled={isEditMode}
                readOnly={isEditMode}
              />
              {!isEditMode && (
                <button
                  type="button"
                  className="id-check-button"
                  onClick={handleCheckId}
                  disabled={idStatus === 'checking'}
                >
                  {idStatus === 'checking' ? 'Проверяем...' : 'Проверить'}
                </button>
              )}
            </div>

            {!isEditMode && idMessage && (
              <p
                className={
                  idStatus === 'available'
                    ? 'id-message id-message-success'
                    : idStatus === 'taken' || idStatus === 'error'
                      ? 'id-message id-message-error'
                      : 'id-message'
                }
              >
                {idMessage}
              </p>
            )}
          </div>

          <div className="field">
            <div className="field-header">
              <label htmlFor="service-description" style={{ marginBottom: 4 }}>Описание</label>
              <span className="field-badge field-badge-optional">Необязательно</span>
            </div>
            <textarea
              id="service-description"
              rows="3"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Краткий текст под названием"
            />
          </div>

          <div className="field field-masters">
            <div className="field-header">
              <span className="field-title" style={{ marginBottom: 4 }}>Рабочее время</span>
              <span className="field-badge field-badge">Обязательно</span>
            </div>
            <div className="schedule-section">
              <div className="schedule-grid">
                {DAY_KEYS.map((dayKey) => {
                  const slot = (masterMe.schedule || defaultSchedule())[dayKey] || defaultDaySlot();
                  return (
                    <div key={dayKey} className="schedule-day">
                      <span className="schedule-day-label">{DAY_LABELS[dayKey]}</span>
                      <label className="schedule-closed">
                        <input
                          type="checkbox"
                          checked={slot.closed}
                          onChange={(e) => {
                            const closed = e.target.checked;
                            setMasterMe((prev) => ({
                              ...prev,
                              schedule: {
                                ...(prev.schedule || defaultSchedule()),
                                [dayKey]: { ...slot, closed, breaks: closed ? [] : slot.breaks },
                              },
                            }));
                          }}
                        />
                        <span>Выходной</span>
                      </label>
                      {!slot.closed && (
                        <>
                          <input
                            type="time"
                            value={slot.start}
                            onChange={(e) => {
                              const newStart = e.target.value;
                              const newEnd = timeLessOrEqual(newStart, slot.end) ? slot.end : newStart;
                              setMasterMe((prev) => ({
                                ...prev,
                                schedule: {
                                  ...(prev.schedule || defaultSchedule()),
                                  [dayKey]: { ...slot, start: newStart, end: newEnd },
                                },
                              }));
                            }}
                            className="schedule-time"
                          />
                          <input
                            type="time"
                            value={slot.end}
                            onChange={(e) => {
                              const newEnd = e.target.value;
                              const newStart = timeLessOrEqual(slot.start, newEnd) ? slot.start : newEnd;
                              setMasterMe((prev) => ({
                                ...prev,
                                schedule: {
                                  ...(prev.schedule || defaultSchedule()),
                                  [dayKey]: { ...slot, start: newStart, end: newEnd },
                                },
                              }));
                            }}
                            className="schedule-time"
                          />
                        </>
                      )}
                      <div className="schedule-breaks">
                        {slot.breaks.map((br, bi) => (
                          <button
                            key={bi}
                            type="button"
                            className="schedule-break-chip"
                            onClick={() => {
                              setBreakEdit({ start: br.start, end: br.end });
                              setBreakModal({ staffIndex: 'me', dayKey, breakIndex: bi });
                            }}
                          >
                            Перерыв {br.start}–{br.end}
                          </button>
                        ))}
                        {!slot.closed && (
                          <button
                            type="button"
                            className="schedule-add-break"
                            onClick={() => {
                              setBreakEdit({ start: '13:00', end: '14:00' });
                              setBreakModal({ staffIndex: 'me', dayKey });
                            }}
                          >
                            + перерыв
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="field field-services">
            <div className="field-header">
              <span className="field-title">Услуги</span>
              <span className="field-badge field-badge-optional">Необязательно</span>
            </div>

            <div className="services-block">
              {services.map((service, serviceIndex) => {
                return (
                  <div
                    key={serviceIndex}
                    className={`service-row ${serviceIndex === addedServiceIndex ? 'branch-row-animate-in' : ''}`}
                  >
                    {services.length > 1 && (
                      <span className="branch-label">Услуга {serviceIndex + 1}</span>
                    )}
                    <div className="service-main">
                      <input
                        type="text"
                        placeholder="Название услуги"
                        value={service.name}
                        onChange={(e) => {
                          const next = services.map((s, i) => (i === serviceIndex ? { ...s, name: e.target.value } : s));
                          setServices(next);
                        }}
                        className="service-input service-input-wide"
                      />

                      <div className="service-price-duration-row">
                        <div className="service-col-half service-price-col">
                          <input
                            type="text"
                            placeholder="Цена (по желанию)"
                            value={service.price}
                            onChange={(e) => {
                              const next = services.map((s, i) => (i === serviceIndex ? { ...s, price: e.target.value } : s));
                              setServices(next);
                            }}
                            className="service-input service-input-price"
                          />
                          <select
                            value={service.currency === 'BYN' ? 'BYN' : 'RUB'}
                            onChange={(e) => {
                              const next = services.map((s, i) => (i === serviceIndex ? { ...s, currency: e.target.value } : s));
                              setServices(next);
                            }}
                            className="service-currency-select"
                          >
                            <option value="RUB">₽</option>
                            <option value="BYN">BYN</option>
                          </select>
                        </div>

                        <div className="service-col-half service-duration-col">
                          <span className="service-duration-label">Длительность</span>
                          <select
                            value={String(service.durationMinutes ?? 90)}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              const next = services.map((s, i) => (i === serviceIndex ? { ...s, durationMinutes: val } : s));
                              setServices(next);
                            }}
                            className="service-duration-select"
                          >
                            {DURATION_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <input
                        type="text"
                        placeholder="Описание (по желанию)"
                        value={service.description}
                        onChange={(e) => {
                          const next = services.map((s, i) => (i === serviceIndex ? { ...s, description: e.target.value } : s));
                          setServices(next);
                        }}
                        className="service-input"
                      />
                    </div>

                    {services.length > 1 && (
                      <button
                        type="button"
                        className="branch-remove"
                        onClick={() => setServices((prev) => prev.filter((_, i) => i !== serviceIndex))}
                      >
                        Удалить
                      </button>
                    )}
                  </div>
                );
              })}

              {services.length < 20 && (
                <button
                  type="button"
                  className="add-branch-btn"
                  onClick={() => {
                    setServices((prev) => {
                      const next = [...prev, defaultService()];
                      setTimeout(() => setAddedServiceIndex(next.length - 1), 0);
                      return next;
                    });
                  }}
                >
                  Ещё одна услуга
                </button>
              )}
            </div>
          </div>

          <div className="field">
            <div className="field-header">
              <span className="field-title" style={{ marginBottom: 4 }}>Контакты</span>
              <span className="field-badge field-badge-optional">Необязательно</span>
            </div>

            <div className="contacts-list">
              <button
                type="button"
                className={`contact-edit-btn ${contacts.address ? 'contact-edit-btn-filled' : ''}`}
                onClick={() => {
                  setContactDraft(contacts.address);
                  setContactModal({ key: 'address', title: 'Адрес', placeholder: 'Город, улица, дом...' });
                }}
              >
                <div>{contacts.address ? `${contacts.address}` : '+ Адрес'}</div>
              </button>
              <button
                type="button"
                className={`contact-edit-btn ${contacts.phone ? 'contact-edit-btn-filled' : ''}`}
                onClick={() => {
                  setContactDraft(contacts.phone);
                  setContactModal({ key: 'phone', title: 'Телефон', placeholder: '+7 ...' });
                }}
              >
                <div>{contacts.phone ? `${contacts.phone}` : '+ Телефон'}</div>
              </button>
              <button
                type="button"
                className={`contact-edit-btn ${contacts.instagram ? 'contact-edit-btn-filled' : ''}`}
                onClick={() => {
                  setContactDraft(contacts.instagram);
                  setContactModal({ key: 'instagram', title: 'Instagram', placeholder: '@username' });
                }}
              >
                <div>{contacts.instagram ? `${contacts.instagram}` : '+ Instagram'}</div>
              </button>

              <button
                type="button"
                className={`contact-edit-btn ${contacts.telegramChannel ? 'contact-edit-btn-filled' : ''}`}
                onClick={() => {
                  setContactDraft(contacts.telegramChannel);
                  setContactModal({ key: 'telegramChannel', title: 'Telegram канал', placeholder: '@channel или ссылка' });
                }}
              >
                <div>{contacts.telegramChannel ? `${contacts.telegramChannel}` : '+ Telegram канал'}</div>
              </button>

              <button
                type="button"
                className={`contact-edit-btn ${contacts.telegramProfile ? 'contact-edit-btn-filled' : ''}`}
                onClick={() => {
                  setContactDraft(contacts.telegramProfile);
                  setContactModal({ key: 'telegramProfile', title: 'Telegram профиль', placeholder: '@username или ссылка' });
                }}
              >
                <div>{contacts.telegramProfile ? `${contacts.telegramProfile}` : '+ Telegram профиль'}</div>
              </button>

              <button
                type="button"
                className={`contact-edit-btn ${contacts.whatsapp ? 'contact-edit-btn-filled' : ''}`}
                onClick={() => {
                  setContactDraft(contacts.whatsapp);
                  setContactModal({ key: 'whatsapp', title: 'Whatsapp', placeholder: 'Номер телефона' });
                }}
              >
                <div>{contacts.whatsapp ? `${contacts.whatsapp}` : '+ Whatsapp'}</div>
              </button>
            </div>

            <div className="field-header" style={{ marginTop: 14 }}>
              <span className="field-title" style={{ marginBottom: 4 }}>Что запрашивать у клиента</span>
              <span className="field-badge field-badge-optional">Необязательно</span>
            </div>
            <div className="contacts-list">
              <button
                type="button"
                className={`contact-edit-btn ${clientRequestFields.telegram ? 'contact-edit-btn-filled' : ''}`}
                onClick={() => setClientRequestFields((prev) => ({ ...prev, telegram: !prev.telegram }))}
              >
                <div>{clientRequestFields.telegram ? '× Telegram' : '+ Telegram'}</div>
              </button>
              <button
                type="button"
                className={`contact-edit-btn ${clientRequestFields.instagram ? 'contact-edit-btn-filled' : ''}`}
                onClick={() => setClientRequestFields((prev) => ({ ...prev, instagram: !prev.instagram }))}
              >
                <div>{clientRequestFields.instagram ? '× Instagram' : '+ Instagram'}</div>
              </button>
              <button
                type="button"
                className={`contact-edit-btn ${clientRequestFields.phone ? 'contact-edit-btn-filled' : ''}`}
                onClick={() => setClientRequestFields((prev) => ({ ...prev, phone: !prev.phone }))}
              >
                <div>{clientRequestFields.phone ? '× Номер телефона' : '+ Номер телефона'}</div>
              </button>
            </div>

            <div id="telegram-binding" />
            <label className="telegram-notify-toggle">
              <input
                type="checkbox"
                checked={telegramNotificationsEnabled}
                onChange={(e) => setTelegramNotificationsEnabled(e.target.checked)}
              />
              <span>Уведомления в Telegram</span>
            </label>
            {!telegramNotificationsEnabled ? (
              <p className="field-help">Ты не будешь получать уведомления о записях.</p>
            ) : (
              <div>
                <p className="field-help">Для того, чтобы получать уведомления о новых записях в Telegram, нужно привязать свой аккаунт. Для этого <a href="https://t.me/connect_booking_bot">перейдите в бота</a> и отправьте одним сообщением 6 цифр, указанных ниже.</p>

                <div className="id-row">
                  <input
                    type="text"
                    value={telegramBindingCode}
                    placeholder="000000"
                    readOnly
                    className="branch-input"
                    style={{ maxWidth: 190 }}
                  />
                  <button
                    type="button"
                    className="id-check-button"
                    disabled={telegramBindingLoading}
                    onClick={() => { navigator.clipboard.writeText(telegramBindingCode) }}
                  >
                    {telegramBindingLoading ? 'Секунду...' : 'Копировать'}
                  </button>
                </div>

                <div className="id-row" style={{ marginTop: 10 }}>
                  <a
                    className="id-check-button"
                    href="https://t.me/connect_booking_bot"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Открыть бота
                  </a>
                  <button
                    type="button"
                    className="id-check-button"
                    disabled={!telegramBindingCode || telegramBindingLoading}
                    onClick={handleVerifyTelegramBinding}
                  >
                    Проверить привязку
                  </button>
                </div>

                {telegramBindingStatus && <p className="field-help">{telegramBindingStatus}</p>}
              </div>
            )}
          </div>

          {contactModal != null && (
            <ContactModalOverlay
              title={contactModal.title}
              value={contactDraft}
              placeholder={contactModal.placeholder}
              onChangeValue={setContactDraft}
              onSave={() => {
                const key = contactModal.key;
                setContacts((prev) => ({ ...prev, [key]: contactDraft.trim() }));
                setContactModal(null);
              }}
              onClose={() => setContactModal(null)}
            />
          )}

          {breakModal != null && (
            <BreakModalOverlay
              start={breakEdit.start}
              end={breakEdit.end}
              canDelete={typeof breakModal.breakIndex === 'number'}
              onDelete={() => {
                const { staffIndex, dayKey, breakIndex } = breakModal;
                if (typeof breakIndex !== 'number') return;

                if (staffIndex === 'me') {
                  setMasterMe((prev) => {
                    const sched = { ...(prev.schedule || defaultSchedule()) };
                    const day = { ...sched[dayKey], breaks: [...(sched[dayKey]?.breaks || [])] };
                    day.breaks = day.breaks.filter((_, i) => i !== breakIndex);
                    sched[dayKey] = day;
                    return { ...prev, schedule: sched };
                  });
                } else if (staffIndex === 'one') {
                  setMasterOne((prev) => {
                    const sched = { ...(prev.schedule || defaultSchedule()) };
                    const day = { ...sched[dayKey], breaks: [...(sched[dayKey]?.breaks || [])] };
                    day.breaks = day.breaks.filter((_, i) => i !== breakIndex);
                    sched[dayKey] = day;
                    return { ...prev, schedule: sched };
                  });
                } else {
                  setMasters((prev) => prev.map((s, i) => {
                    if (i !== staffIndex) return s;
                    const sched = { ...s.schedule };
                    const day = { ...sched[dayKey], breaks: [...(sched[dayKey]?.breaks || [])] };
                    day.breaks = day.breaks.filter((_, idx) => idx !== breakIndex);
                    sched[dayKey] = day;
                    return { ...s, schedule: sched };
                  }));
                }
                setBreakModal(null);
              }}
              onStartChange={(v) => setBreakEdit((prev) => ({
                ...prev,
                start: v,
                end: timeLessOrEqual(v, prev.end) ? prev.end : v,
              }))}
              onEndChange={(v) => setBreakEdit((prev) => ({
                ...prev,
                end: v,
                start: timeLessOrEqual(prev.start, v) ? prev.start : v,
              }))}
              onSave={() => {
                const { staffIndex, dayKey, breakIndex } = breakModal;
                const isEdit = typeof breakIndex === 'number';
                let end = breakEdit.end;
                if (!timeLessOrEqual(breakEdit.start, end)) end = breakEdit.start;
                const newBreak = { start: breakEdit.start, end };

                if (staffIndex === 'me') {
                  setMasterMe((prev) => {
                    const sched = { ...(prev.schedule || defaultSchedule()) };
                    const day = { ...sched[dayKey], breaks: [...(sched[dayKey]?.breaks || [])] };
                    if (isEdit) day.breaks[breakIndex] = newBreak;
                    else day.breaks.push(newBreak);
                    sched[dayKey] = day;
                    return { ...prev, schedule: sched };
                  });
                } else if (staffIndex === 'one') {
                  setMasterOne((prev) => {
                    const sched = { ...(prev.schedule || defaultSchedule()) };
                    const day = { ...sched[dayKey], breaks: [...(sched[dayKey]?.breaks || [])] };
                    if (isEdit) day.breaks[breakIndex] = newBreak;
                    else day.breaks.push(newBreak);
                    sched[dayKey] = day;
                    return { ...prev, schedule: sched };
                  });
                } else {
                  setMasters((prev) => prev.map((s, i) => {
                    if (i !== staffIndex) return s;
                    const sched = { ...s.schedule };
                    const day = { ...sched[dayKey], breaks: [...(sched[dayKey]?.breaks || [])] };
                    if (isEdit) day.breaks[breakIndex] = newBreak;
                    else day.breaks.push(newBreak);
                    sched[dayKey] = day;
                    return { ...s, schedule: sched };
                  }));
                }
                setBreakModal(null);
              }}
              onClose={() => setBreakModal(null)}
            />
          )}

          <div className="form-footer">
            {submitError && <p className="submit-error">{submitError}</p>}

            <div className="footer-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => navigate('/admin')}
                disabled={submitting}
              >
                Отменить
              </button>
              <button
                type="submit"
                className="primary-button"
                disabled={submitting || idStatus === 'checking'}
              >
                {submitting ? (isEditMode ? 'Сохраняем...' : 'Создаём...') : (isEditMode ? 'Сохранить' : 'Создать')}
              </button>
            </div>
          </div>
        </form>

        {!isEditMode && payModalOpen && (
          <div
            className="modal-overlay"
            role="dialog"
            aria-modal="true"
            onClick={() => {
              if (telegramWaiting || paySubmitting) return;
              setPayModalOpen(false);
              setTelegramWaiting(false);
              setPayError(null);
              setTelegramInvoiceUrl('');
            }}
          >
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <h3 className="modal-title">Создание коннекта</h3>

              <p style={{ margin: '0 0 14px', fontSize: 13, color: '#6e6e73', marginTop: 0, marginBottom: 12 }}>
                Коннект сильно дешевле конкурентов!
              </p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                {PURCHASE_PLANS.map((p) => (
                  <button
                    key={p.months}
                    type="button"
                    className={payPlanMonths === p.months ? 'primary-button' : 'secondary-button'}
                    style={{ padding: '8px 14px' }}
                    disabled={paySubmitting || telegramWaiting}
                    onClick={() => setPayPlanMonths(p.months)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="modal-row" style={{ marginBottom: 14 }}>
                <label>
                  <span className="modal-label">Промокод</span>
                  <input
                    type="text"
                    value={promoCode}
                    onChange={(e) => {
                      const v = e.target.value;
                      setPromoCode(v);
                      if (promoDoc) {
                        setPromoDoc(null);
                        setPromoError(null);
                      }
                    }}
                    disabled={paySubmitting || telegramWaiting}
                  />
                </label>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'end', gap: 10, marginTop: -6, marginBottom: 14 }}>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={paySubmitting || telegramWaiting || promoLoading || promoAttemptsLeft <= 0 || Boolean(promoDoc)}
                  onClick={handleApplyPromo}
                  style={{ padding: '8px 14px' }}
                >
                  {promoLoading ? 'Проверяем...' : 'Применить'}
                </button>
              </div>

              <p style={{ margin: '0 0 10px', fontSize: 13, color: '#1d1d1f' }}>
                <span style={{ fontFamily: 'sfb', fontWeight: 700 }}>{requiredStarsInt}</span>⭐
                <span style={{ color: '#6e6e73' }}>
                  {' '}
                  ≈ {Math.round(requiredRub)}₽
                </span>
              </p>

              {promoError ? (
                <p className="submit-error" style={{ marginTop: 2, marginBottom: 0 }}>
                  {promoError}
                </p>
              ) : null}

              {promoDoc ? (
                <p style={{ margin: promoError ? '8px 0 0' : '10px 0 0', fontSize: 13, color: '#6e6e73' }}>
                  Скидка применена: -{promoDiscountStarsInt} звёзд
                </p>
              ) : null}

              {payError ? (
                <p className="submit-error" style={{ marginTop: 12 }}>
                  {payError}
                </p>
              ) : null}



              <div className="modal-actions" style={{ marginTop: 16 }}>
                {!telegramWaiting && !paySubmitting ? (
                  <>
                    {payAdminDoc && Number(payAdminDoc.balance) >= requiredStarsInt ? (
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => handlePayFromBalance()}
                      >
                        {paySubmitting ? 'Оплата...' : 'Оплатить с баланса'}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => handlePayViaTelegram()}
                    >
                      {paySubmitting ? 'Открываем...' : 'Оплатить в Telegram'}
                    </button>
                  </>
                ) : (
                  <>
                    {telegramInvoiceUrl ? (
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => window.open(telegramInvoiceUrl, '_blank', 'noopener,noreferrer')}
                      >
                        Открыть бота
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="primary-button"
                      onClick={async () => {
                        const exists = await configurationIdExists(configId);
                        if (exists) {
                          navigate(`/${String(configId || '').trim()}`);
                        }
                        else {
                          setPayError('Оплата ещё не прошла');
                        }
                      }
                    }
                  >
                      Проверить оплату
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

export default CreateServicePage;

