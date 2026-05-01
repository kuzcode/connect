import React, { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { getConfigurationByIdPublic, createNote, listNotesByConfiguration, sendTelegramBookingNotification } from './appwriteClient.js';
import NotFoundPage from './NotFoundPage.jsx';
import { getMasterScheduleBundleFromOptions, getSlotsForMasterDay } from './scheduleUtils.js';
import './admin.css';
import stars from './icons/star.png'

const MONTH_NAMES = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const DEFAULT_SERVICE_DURATION_MIN = 90;

function parseSettings(raw) {
  if (!raw) return null;
  const obj = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
  if (!obj || typeof obj !== 'object') return null;
  const opt = obj.options || {};
  const masterMode = opt.masterMode || 'me';
  const masterMe = opt.masterMe && typeof opt.masterMe === 'object' ? opt.masterMe : null;
  const masterOne = opt.masterOne && typeof opt.masterOne === 'object' ? opt.masterOne : null;
  const mastersList = Array.isArray(opt.masters) ? opt.masters : [];
  const servicesList = Array.isArray(opt.services) ? opt.services : [];
  const contactsOpt = opt.contacts && typeof opt.contacts === 'object' ? opt.contacts : null;
  const requestFieldsOpt = opt.clientRequestFields && typeof opt.clientRequestFields === 'object' ? opt.clientRequestFields : {};
  const notificationsOpt = opt.notifications && typeof opt.notifications === 'object' ? opt.notifications : {};

  const scheduleBundle = getMasterScheduleBundleFromOptions(opt);

  const masterList = [];
  if (masterMode === 'me' && masterMe && (masterMe.name || masterMe.schedule || masterMe.flexWindows)) {
    masterList.push({
      name: masterMe.name || 'Мастер',
      schedule: scheduleBundle.scheduleMode === 'weekly' ? scheduleBundle.schedule : {},
      scheduleMode: scheduleBundle.scheduleMode,
      flexWindows: scheduleBundle.flexWindows,
    });
  } else if (masterMode === 'one' && masterOne && (masterOne.name || masterOne.schedule)) {
    masterList.push({ name: masterOne.name || 'Мастер', schedule: masterOne.schedule || {} });
  } else if (masterMode === 'several') {
    mastersList.forEach((m) => {
      if (m && (m.name || m.schedule)) {
        masterList.push({ name: m.name || 'Мастер', schedule: m.schedule || {} });
      }
    });
  }

  const services = servicesList.map((s) => ({
    name: (s && s.name) ? String(s.name) : '',
    description: (s && typeof s.description === 'string') ? s.description : '',
    price: s && (s.price !== undefined && s.price !== null) ? String(s.price) : '',
    currency: s && s.currency === 'BYN' ? 'BYN' : '₽',
    durationMinutes: typeof s.durationMinutes === 'number' && s.durationMinutes > 0 ? s.durationMinutes : DEFAULT_SERVICE_DURATION_MIN,
  })).filter((s) => s.name);

  return {
    name: obj.name || '',
    description: obj.description || '',
    contacts: contactsOpt
      ? {
        address: typeof contactsOpt.address === 'string' ? contactsOpt.address : '',
        instagram: typeof contactsOpt.instagram === 'string' ? contactsOpt.instagram : '',
        telegramChannel: typeof contactsOpt.telegramChannel === 'string' ? contactsOpt.telegramChannel : '',
        telegramProfile: typeof contactsOpt.telegramProfile === 'string' ? contactsOpt.telegramProfile : '',
        whatsapp: typeof contactsOpt.whatsapp === 'string' ? contactsOpt.whatsapp : '',
        phone: typeof contactsOpt.phone === 'string' ? contactsOpt.phone : '',
      }
      : null,
    clientRequestFields: {
      telegram: Boolean(requestFieldsOpt.telegram),
      instagram: Boolean(requestFieldsOpt.instagram),
      phone: Boolean(requestFieldsOpt.phone),
    },
    notifications: {
      telegramEnabled: notificationsOpt.telegramEnabled !== false,
      telegramUsername: typeof notificationsOpt.telegramUsername === 'string' ? notificationsOpt.telegramUsername : '',
      telegramChatId: typeof notificationsOpt.telegramChatId === 'string' ? notificationsOpt.telegramChatId : '',
    },
    masterList,
    services,
  };
}

function ConfigPage() {
  const { configId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [configDocId, setConfigDocId] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [notes, setNotes] = useState([]);

  const [step, setStep] = useState(0);
  const [selectedServiceIndex, setSelectedServiceIndex] = useState(0);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [instagram, setInstagram] = useState('');
  const [phone, setPhone] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setNotFound(false);
        setError(null);
        const doc = await getConfigurationByIdPublic(configId);
        const settings = typeof doc.settings === 'string' ? JSON.parse(doc.settings) : doc.settings;
        const data = parseSettings(settings);
        if (!cancelled && data) {
          setConfigDocId(doc.$id);
          setParsed(data);
          setSelectedDay(new Date().getDate());
          const res = await listNotesByConfiguration(doc.$id);
          setNotes(res.documents || []);
        } else if (!cancelled) {
          setParsed({ name: '', description: '', masterList: [], services: [] });
        }
      } catch (e) {
        if (cancelled) return;
        const msg = e?.message || 'Ошибка загрузки';
        if (String(msg).toLowerCase().includes('не найдена') || String(msg).toLowerCase().includes('not found')) {
          setNotFound(true);
          setError(null);
        } else {
          setNotFound(false);
          setError(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [configId]);

  const masterList = parsed?.masterList || [];
  const services = parsed?.services || [];
  const needServiceStep = services.length > 1;

  const stepOrder = [];
  if (needServiceStep) stepOrder.push('service');
  stepOrder.push('datetime');
  stepOrder.push('contact');

  const currentStepKey = stepOrder[step];
  const requestFields = parsed?.clientRequestFields || { telegram: false, instagram: false, phone: false };
  const canNext = () => {
    if (currentStepKey === 'service') return true;
    if (currentStepKey === 'datetime') return selectedDay != null && selectedTime != null;
    if (currentStepKey === 'contact') {
      const needTelegram = Boolean(requestFields.telegram);
      const needInstagram = Boolean(requestFields.instagram);
      const needPhone = Boolean(requestFields.phone);

      const hasName = name.trim().length > 0;
      const hasTelegram = !needTelegram || username.trim().length > 0;
      const hasInstagram = !needInstagram || instagram.trim().length > 0;
      const hasPhone = !needPhone || phone.trim().length > 0;

      return hasName && hasTelegram && hasInstagram && hasPhone;
    }
    return true;
  };

  const activeMaster = masterList[0] || null;
  const selectedService = services[selectedServiceIndex] || services[0] || null;
  const durationMinutes = selectedService ? selectedService.durationMinutes : DEFAULT_SERVICE_DURATION_MIN;
  const hasAnyVisibleContacts = Boolean(
    parsed?.contacts && (
      parsed.contacts.address
      || parsed.contacts.phone
      || parsed.contacts.instagram
      || parsed.contacts.telegramProfile
      || parsed.contacts.telegramChannel
      || parsed.contacts.whatsapp
    ),
  );

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const isCurrentMonth = calendarMonth.year === currentYear && calendarMonth.month === currentMonth;
  const daysInMonth = new Date(calendarMonth.year, calendarMonth.month + 1, 0).getDate();
  const firstDayOfWeek = new Date(calendarMonth.year, calendarMonth.month, 1).getDay();
  const firstMonday = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

  const notesForSelectedDate = useMemo(() => {
    if (selectedDay == null) return [];
    return notes.filter((n) => {
      const t = n.time;
      if (!t) return false;
      const d = new Date(t);
      return d.getFullYear() === calendarMonth.year && d.getMonth() === calendarMonth.month && d.getDate() === selectedDay;
    }).map((n) => {
      const d = new Date(n.time);
      const h = d.getHours();
      const m = d.getMinutes();
      return {
        timeLocal: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
        durationMinutes: DEFAULT_SERVICE_DURATION_MIN,
      };
    });
  }, [notes, calendarMonth.year, calendarMonth.month, selectedDay]);

  const schedule = activeMaster ? activeMaster.schedule : {};
  const scheduleMode = activeMaster?.scheduleMode === 'flex' ? 'flex' : 'weekly';
  const flexWindows = activeMaster?.flexWindows || [];
  const slots = useMemo(() => {
    if (!selectedDay) return [];
    const d = new Date(calendarMonth.year, calendarMonth.month, selectedDay);
    const relevantNotes = notesForSelectedDate.filter((n) => !activeMaster || !n.master || n.master === activeMaster.name);
    const bundle = scheduleMode === 'flex'
      ? { scheduleMode: 'flex', schedule: {}, flexWindows }
      : { scheduleMode: 'weekly', schedule, flexWindows: [] };
    return getSlotsForMasterDay(bundle, durationMinutes, relevantNotes, d);
  }, [schedule, scheduleMode, flexWindows, durationMinutes, selectedDay, calendarMonth, notesForSelectedDate, activeMaster]);

  const goNext = () => {
    if (step < stepOrder.length - 1) setStep((s) => s + 1);
    else if (currentStepKey === 'contact') submitBooking();
  };

  const goBack = () => {
    setSubmitError(null);
    setStep((s) => Math.max(0, s - 1));
  };

  const submitBooking = async () => {
    if (!configDocId) {
      setSubmitError('Не удалось загрузить коннект (нет ID конфигурации). Обновите страницу и попробуйте снова.');
      return;
    }
    if (!activeMaster) {
      setSubmitError('Не удалось определить мастера. Проверьте настройки коннекта.');
      return;
    }
    if (!selectedDay || !selectedTime) {
      setSubmitError('Выберите дату и время');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const needTelegram = Boolean(requestFields.telegram);
      const needInstagram = Boolean(requestFields.instagram);
      const needPhone = Boolean(requestFields.phone);

      if (name.trim().length === 0) {
        setSubmitError('Имя обязательно');
        return;
      }
      if (needTelegram && username.trim().length === 0) {
        setSubmitError('Telegram обязателен');
        return;
      }
      if (needInstagram && instagram.trim().length === 0) {
        setSubmitError('Instagram обязателен');
        return;
      }
      if (needPhone && phone.trim().length === 0) {
        setSubmitError('Номер телефона обязателен');
        return;
      }

      const date = new Date(calendarMonth.year, calendarMonth.month, selectedDay);
      const [h, m] = selectedTime.split(':').map(Number);
      date.setHours(h, m, 0, 0);
      await createNote({
        configurationDocumentId: configDocId,
        name: name.trim(),
        time: date.toISOString(),
        username: username.trim(),
        insta: instagram.trim(),
        phone: phone.trim(),
        comment: comment.trim(),
        service: selectedService?.name ? selectedService.name : '',
      });

      const notifyConfig = parsed?.notifications;
      if (notifyConfig?.telegramEnabled && (notifyConfig?.telegramChatId || notifyConfig?.telegramUsername)) {
        const notificationText = [
          `🌷 Новая запись: ${parsed?.name || 'Коннект'}`,
          `Клиент: ${name.trim() || '—'}`,
          selectedService?.name ? `Услуга: ${selectedService.name}` : '',
          `Дата и время: ${date.toLocaleString()}`,
          username.trim() ? username.includes('@') ? `Telegram: ${username.trim()}` : `Telegram: @${username.trim()}` : '',
          instagram.trim() ? `Instagram: ${instagram.trim()}` : '',
          phone.trim() ? `Телефон: ${phone.trim()}` : '',
          comment.trim() ? `Комментарий: ${comment.trim()}` : '',
        ].filter(Boolean).join('\n');

        await sendTelegramBookingNotification({
          targetUsername: notifyConfig.telegramUsername,
          targetChatId: notifyConfig.telegramChatId,
          text: notificationText,
        });
      }
      setSubmitSuccess(true);
    } catch (e) {
      console.error('Booking submit failed', e);
      setSubmitError(e.message || 'Не удалось записаться');
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (parsed && parsed.name) document.title = parsed.name;
  }, [parsed?.name]);

  if (loading) {
    return (
      <main className="booking-page">
        <div className="booking-loader-card">
          <div class="loader"></div>
            <p>Загрузка...</p>
          </div>
      </main>
    );
  }

  if (notFound) {
    return <NotFoundPage />;
  }

  if (error) {
    return (
      <main className="booking-page">
        <div className="booking-card">
          <h1 className="booking-title">Ошибка</h1>
          <p className="booking-text">{error}</p>
        </div>
      </main>
    );
  }

  if (submitSuccess) {
    return (
      <main className="booking-page">
        <div className="booking-card booking-success">
          <h1 className="booking-title">Запись оформлена</h1>
          <p className="booking-text">Спасибо ❤️</p>
        </div>
      </main>
    );
  }

  const stepTitles = {
    service: 'Выбери услугу',
    datetime: 'Дата и время',
    contact: 'Финальный штрих',
  };

  return (
    <main className="booking-page">
      <div className="booking-card">
        <header className="booking-header">
          <h1 className="booking-title">{parsed?.name}</h1>
          {parsed?.description ? <p className="booking-description">{parsed.description}</p> : null}
        </header>

        <section className="booking-step">
          <div style={{
            display: 'flex',
            gap: 5
          }}>
            {currentStepKey === 'contact' && (
              <img src={stars} height={18} width={18} />
            )}
            <h2 className="booking-step-title">{stepTitles[currentStepKey]}</h2>
          </div>

          {currentStepKey === 'service' && (
            <div className="booking-options">
              {services.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  className={`booking-option booking-service-option ${selectedServiceIndex === i ? 'selected' : ''}`}
                  onClick={() => setSelectedServiceIndex(i)}
                >
                  <div className="booking-service-left">
                    <div className="booking-service-title">{s.name}</div>
                    {s.description ? (
                      <div className="booking-service-description">{s.description}</div>
                    ) : null}
                  </div>

                  <div className="booking-service-right">
                    <div className="booking-service-price">
                      {s.price ? `${s.price} ${s.currency === 'BYN' ? 'BYN' : '₽'}` : '—'}
                    </div>
                    <div className="booking-service-time">{s.durationMinutes} мин</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {currentStepKey === 'datetime' && (
            <div className="booking-datetime">
              <div className="booking-calendar-wrap">
                <div className="booking-calendar-header">
                  <button
                    type="button"
                    className="booking-calendar-nav"
                    disabled={isCurrentMonth}
                    onClick={() => setCalendarMonth((prev) => {
                      if (prev.month === 0) return { year: prev.year - 1, month: 11 };
                      return { year: prev.year, month: prev.month - 1 };
                    })}
                  >
                    ←
                  </button>
                  <span className="booking-calendar-month">
                    {MONTH_NAMES[calendarMonth.month]} {calendarMonth.year}
                  </span>
                  <button
                    type="button"
                    className="booking-calendar-nav"
                    onClick={() => setCalendarMonth((prev) => {
                      if (prev.month === 11) return { year: prev.year + 1, month: 0 };
                      return { year: prev.year, month: prev.month + 1 };
                    })}
                  >
                    →
                  </button>
                </div>
                <div className="booking-calendar-grid">
                  {Array.from({ length: firstMonday }, (_, i) => <div key={`e-${i}`} className="booking-calendar-day empty" />)}
                  {Array.from({ length: daysInMonth }, (_, i) => {
                    const day = i + 1;
                    const date = new Date(calendarMonth.year, calendarMonth.month, day);
                    const isPast = date < new Date(currentYear, currentMonth, now.getDate());
                    const isSelected = selectedDay === day;
                    return (
                      <button
                        key={day}
                        type="button"
                        className={`booking-calendar-day ${isPast ? 'past' : ''} ${isSelected ? 'selected' : ''}`}
                        disabled={isPast}
                        onClick={() => { setSelectedDay(day); setSelectedTime(null); }}
                      >
                        <span>{day}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {selectedDay != null && (
                <div className="booking-slots-wrap">
                  <span className="booking-slots-label">Свободное время</span>
                  <div className="booking-slots">
                    {slots.length === 0 ? (
                      <p className="booking-slots-empty">Нет свободных слотов на эту дату</p>
                    ) : (
                      slots.map((t) => (
                        <button
                          key={t}
                          type="button"
                          className={`booking-slot ${selectedTime === t ? 'selected' : ''}`}
                          onClick={() => setSelectedTime(t)}
                        >
                          {t}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {currentStepKey === 'contact' && (
            <div className="booking-form">
              <label className="booking-field">
                <span className="booking-label">Имя</span>
                <input
                  type="text"
                  placeholder="Как к вам обращаться"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="booking-input"
                />
              </label>
              {requestFields.telegram && (
                <label className="booking-field">
                  <span className="booking-label">Telegram</span>
                  <input
                    type="text"
                    placeholder="@username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="booking-input"
                  />
                </label>
              )}
              {requestFields.instagram && (
                <label className="booking-field">
                  <span className="booking-label">Instagram</span>
                  <input
                    type="text"
                    placeholder="Ваш ник"
                    value={instagram}
                    onChange={(e) => setInstagram(e.target.value)}
                    className="booking-input"
                  />
                </label>
              )}
              {requestFields.phone && (
                <label className="booking-field">
                  <span className="booking-label">Номер телефона</span>
                  <input
                    type="tel"
                    placeholder="+x xxx xxx-xx-xx"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="booking-input"
                  />
                </label>
              )}
              <label className="booking-field">
                <span className="booking-label">Комментарий</span>
                <textarea
                  rows={3}
                  placeholder="Например, пожелания по времени или мастеру"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="booking-input"
                />
              </label>
              {submitError && <p className="booking-error">{submitError}</p>}
            </div>
          )}
        </section>

        <footer className="booking-footer">
          <div className="booking-progress">
            {stepOrder.map((key, i) => (
              <span key={key} className={`booking-progress-dot ${i <= step ? 'active' : ''}`} />
            ))}
          </div>
          <div className="booking-actions">
            {step > 0 ? (
              <button
                type="button"
                className="booking-back"
                onClick={goBack}
              >
                Назад
              </button>
            ) : <span />}
            <button
              type="button"
              className="booking-next primary-button"
              disabled={!canNext() || (currentStepKey === 'contact' && submitting)}
              onClick={goNext}
            >
              {currentStepKey === 'contact' ? (submitting ? 'Отправка...' : 'Записаться') : 'Далее'}
            </button>
          </div>

          {hasAnyVisibleContacts ? (
            <>
            <p className="auth-eyebrow" style={{marginTop: 20}}>Контакты</p>

            <div className="booking-contacts">
              {parsed.contacts.address ? (
                <div className="booking-contact-item">
                  <span className="booking-contact-value">{parsed.contacts.address}</span>
                </div>
              ) : null}

              {parsed.contacts.phone ? (
                <div className="booking-contact-item">
                  <a className="booking-contact-link" href={`tel:${parsed.contacts.phone}`}>
                    Позвонить
                  </a>
                </div>
              ) : null}

              {parsed.contacts.instagram ? (
                <div className="booking-contact-item">
                  <a
                    className="booking-contact-link"
                    href={parsed.contacts.instagram.startsWith('http') ? parsed.contacts.instagram : `https://instagram.com/${parsed.contacts.instagram.replace(/^@/, '')}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Instagram
                  </a>
                </div>
              ) : null}

              {parsed.contacts.telegramProfile ? (
                <div className="booking-contact-item">
                  <a
                    className="booking-contact-link"
                    href={parsed.contacts.telegramProfile.startsWith('http') ? parsed.contacts.telegramProfile : `https://t.me/${parsed.contacts.telegramProfile.replace(/^@/, '')}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Telegram
                  </a>
                </div>
              ) : null}

              {parsed.contacts.telegramChannel ? (
                <div className="booking-contact-item">
                  <a
                    className="booking-contact-link"
                    href={parsed.contacts.telegramChannel.startsWith('http') ? parsed.contacts.telegramChannel : `https://t.me/${parsed.contacts.telegramChannel.replace(/^@/, '')}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Telegram Канал
                  </a>
                </div>
              ) : null}

              {parsed.contacts.whatsapp ? (
                <div className="booking-contact-item">
                  <a
                    className="booking-contact-link"
                    href={
                      parsed.contacts.whatsapp.startsWith('http')
                        ? parsed.contacts.whatsapp
                        : `https://wa.me/${parsed.contacts.whatsapp.replace(/[^\d+]/g, '').replace(/^(\+)?/, '')}`
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    WhatsApp
                  </a>
                </div>
              ) : null}
            </div></>
          ) : null}
        </footer>
      </div>
    </main>
  );
}

export default ConfigPage;
