import { Client, Databases, Query, Account, ID, Storage } from 'appwrite';

// Предполагаем, что используется Appwrite Cloud.
// При необходимости поменяйте endpoint на свой (например, http://localhost/v1).
const APPWRITE_ENDPOINT = 'https://cloud.appwrite.io/v1';
const PROJECT_ID = '69ad52b9002370350eee';
const DATABASE_ID = '69ad534000186b123410';
const CONFIG_COLLECTION_ID = 'configurations';
const ADMINS_COLLECTION_ID = 'admins';
const PROMOS_COLLECTION_ID = 'promos';
const TELEGRAM_BINDINGS_COLLECTION_ID = 'telegram_bindings';
const CONFIG_ORDERS_COLLECTION_ID = 'config_orders';
const NOTES_COLLECTION_ID = 'notes';

// Bucket для аватаров мастеров
const AVATARS_BUCKET_ID = '69c0db0d001692030844';

const client = new Client()
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(PROJECT_ID);

const databases = new Databases(client);
const account = new Account(client);
const storage = new Storage(client);

// ---------- Публичные функции для конфигураций ----------

export async function getConfigurationById(id) {
  const response = await databases.listDocuments(
    DATABASE_ID,
    CONFIG_COLLECTION_ID,
    [Query.equal('id', id)],
  );

  if (!response.total || !response.documents.length) {
    throw new Error('Конфигурация не найдена');
  }

  return response.documents[0];
}

export async function configurationIdExists(id) {
  const safeId = (id || '').trim();
  if (!safeId) {
    return false;
  }

  const response = await databases.listDocuments(
    DATABASE_ID,
    CONFIG_COLLECTION_ID,
    [Query.equal('id', safeId)],
  );

  return Boolean(response.total && response.documents.length);
}

export async function createConfiguration({ id, settings, name, payedUntil }) {
  const safeId = (id || '').trim();
  const safeName = (name || '').trim();

  if (!safeId) {
    throw new Error('ID конфигурации обязателен');
  }

  const user = await getCurrentUser();
  let adminDoc = await getAdminByEmail(user.email);

  const payload = {
    id: safeId,
    settings,
    name: safeName,
    admin: adminDoc.$id,
  };

  if (payedUntil) {
    const iso = new Date(payedUntil).toISOString();
    if (Number.isFinite(new Date(iso).getTime())) payload.payedUntil = iso;
  }


  return databases.createDocument(
    DATABASE_ID,
    CONFIG_COLLECTION_ID,
    ID.unique(),
    payload,
  );
}

export async function updateConfigurationByConfigId(id, { settings, name }) {
  const safeId = (id || '').trim();

  if (!safeId) {
    throw new Error('ID конфигурации обязателен');
  }

  const doc = await getConfigurationById(safeId);

  const updatePayload = {
    settings,
  };

  if (typeof name === 'string') {
    updatePayload.name = name.trim();
  }

  return databases.updateDocument(
    DATABASE_ID,
    CONFIG_COLLECTION_ID,
    doc.$id,
    updatePayload,
  );
}

export async function updateConfigurationPayedUntilByDocId(configDocId, payedUntil) {
  const safeDocId = (configDocId || '').trim();
  if (!safeDocId) throw new Error('ID документа конфигурации обязателен');

  const iso = new Date(payedUntil).toISOString();
  if (!Number.isFinite(new Date(iso).getTime())) throw new Error('Некорректная дата payedUntil');

  return databases.updateDocument(
    DATABASE_ID,
    CONFIG_COLLECTION_ID,
    safeDocId,
    { payedUntil: iso },
  );
}

// ---------- Аутентификация и админы ----------

export async function getCurrentUser() {
  return account.get();
}

function isAuthOrPermissionError(err) {
  const msg = String(err?.message || '').toLowerCase();
  return (
    msg.includes('401') ||
    msg.includes('403') ||
    msg.includes('unauthorized') ||
    msg.includes('forbidden') ||
    msg.includes('permission') ||
    msg.includes('missing') ||
    msg.includes('unauthenticated') ||
    msg.includes('scope')
  );
}

// Для публичного открытия страниц `/:configId`.
// Если коллекция разрешает чтение только для "аутентифицированных",
// anonymous-сессия позволит показывать страницу без логина.
export async function ensureAnonymousSession() {
  try {
    await account.get(); // уже есть сессия
    return { created: false };
  } catch {
    // сессии нет
  }

  await account.createAnonymousSession();
  return { created: true };
}

// Пытаемся читать конфигурацию "как обычно".
// Если упираемся в права/авторизацию — пробуем anonymous-сессию и делаем повторный запрос.
export async function getConfigurationByIdPublic(id) {
  try {
    const doc = await getConfigurationById(id);
    const payedUntilIso = doc?.payedUntil;
    if (payedUntilIso) {
      const t = new Date(payedUntilIso).getTime();
      if (Number.isFinite(t) && t <= Date.now()) {
        throw new Error('Конфигурация не найдена');
      }
    }
    return doc;
  } catch (e) {
    if (!isAuthOrPermissionError(e)) throw e;
    await ensureAnonymousSession();
    const doc = await getConfigurationById(id);
    const payedUntilIso = doc?.payedUntil;
    if (payedUntilIso) {
      const t = new Date(payedUntilIso).getTime();
      if (Number.isFinite(t) && t <= Date.now()) {
        throw new Error('Конфигурация не найдена');
      }
    }
    return doc;
  }
}

async function createAdminDoc({ email, telegram }) {
  return databases.createDocument(
    DATABASE_ID,
    ADMINS_COLLECTION_ID,
    ID.unique(),
    {
      email,
      username: telegram || '',
      owns: [],
    },
  );
}

export async function getAdminByEmail(email) {
  const safeEmail = (email || '').trim();
  if (!safeEmail) {
    return null;
  }

  const response = await databases.listDocuments(
    DATABASE_ID,
    ADMINS_COLLECTION_ID,
    [Query.equal('email', safeEmail)],
  );

  if (!response.total || !response.documents.length) {
    return null;
  }

  return response.documents[0];
}

export async function getPromoByValue(value) {
  const safeValue = (value || '').trim();
  if (!safeValue) return null;

  const response = await databases.listDocuments(
    DATABASE_ID,
    PROMOS_COLLECTION_ID,
    [Query.equal('value', safeValue)],
  );

  if (!response.total || !response.documents?.length) return null;
  return response.documents[0];
}

export async function getTelegramBindingByCode(bindingCode) {
  const code = String(bindingCode || '').trim();
  if (!code) return null;

  // Prefer direct document id lookup (we will create documents with id = bindingCode).
  try {
    return await databases.getDocument(DATABASE_ID, TELEGRAM_BINDINGS_COLLECTION_ID, code);
  } catch {
    // If document id lookup fails (e.g. permissions/index), fallback to field search.
  }

  const response = await databases.listDocuments(
    DATABASE_ID,
    TELEGRAM_BINDINGS_COLLECTION_ID,
    [Query.equal('bindingCode', code)],
  );

  if (!response.total || !response.documents?.length) return null;
  return response.documents[0];
}

export async function createConfigOrder({ adminDocId, configId, name, settings, months }) {
  const safeAdminDocId = String(adminDocId || '').trim();
  const safeConfigId = String(configId || '').trim();
  const safeName = String(name || '').trim();
  if (!safeAdminDocId || !safeConfigId) throw new Error('Некорректные данные заказа');

  const safeMonths = Number(months);
  const nextMonths = Number.isFinite(safeMonths) && safeMonths > 0 ? safeMonths : 1;

  const settingsString = String(settings || '');

  return databases.createDocument(
    DATABASE_ID,
    CONFIG_ORDERS_COLLECTION_ID,
    ID.unique(),
    {
      adminDocId: safeAdminDocId,
      configId: safeConfigId,
      name: safeName,
      settings: settingsString,
      months: nextMonths,
      status: 'pending',
    },
  );
}

export async function updateAdminBalanceById(adminDocId, nextBalance) {
  const safeId = (adminDocId || '').trim();
  if (!safeId) throw new Error('ID админа обязателен');

  const safeBalance = Number(nextBalance);
  if (!Number.isFinite(safeBalance)) throw new Error('Некорректный баланс');

  return databases.updateDocument(
    DATABASE_ID,
    ADMINS_COLLECTION_ID,
    safeId,
    { balance: safeBalance },
  );
}

function normalizeTelegramStarsAmount(stars) {
  const n = Number(stars);
  if (!Number.isFinite(n)) throw new Error('Некорректное количество звёзд');
  const int = Math.max(1, Math.floor(n));
  return int;
}

export async function createTelegramStarsInvoiceLink({
  payload,
  title,
  description,
  stars,
}) {
  const TELEGRAM_BOT_TOKEN = import.meta.env.VITE_TELEGRAM_BOT_TOKEN;
  if (!TELEGRAM_BOT_TOKEN) throw new Error('VITE_TELEGRAM_BOT_TOKEN не задан');

  const safePayload = String(payload || '').trim();
  if (!safePayload) throw new Error('invoice payload обязателен');

  const starsInt = normalizeTelegramStarsAmount(stars);
  const safeTitle = String(title || 'Оплата').slice(0, 32);
  const safeDescription = String(description || 'Telegram Stars платеж').slice(0, 255);

  const prices = JSON.stringify([{ label: safeTitle, amount: starsInt }]);

  const params = new URLSearchParams({
    title: safeTitle,
    description: safeDescription,
    payload: safePayload,
    currency: 'XTR',
    prices,
    need_name: 'false',
    need_email: 'false',
  });

  const invoiceRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/createInvoiceLink`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });

  const json = await invoiceRes.json().catch(() => null);
  if (!invoiceRes.ok || !json?.ok) {
    const desc = json?.description || invoiceRes.statusText || 'Ошибка createInvoiceLink';
    throw new Error(desc);
  }

  return json.result?.url || json.result;
}

export async function registerAdmin({ email, password, telegram }) {
  const safeEmail = (email || '').trim();
  const safePassword = (password || '').trim();

  if (!safeEmail || !safePassword) {
    throw new Error('Email и пароль обязательны');
  }

  // Создаем пользователя в Appwrite
  const user = await account.create(
    ID.unique(),
    safeEmail,
    safePassword,
  );

  // Создаем сессию (логин)
  await account.createEmailPasswordSession(
    safeEmail,
    safePassword,
  );

  // Создаем документ администратора только если его еще нет
  const existingAdmin = await getAdminByEmail(safeEmail);
  const adminDoc = existingAdmin || await createAdminDoc({
    email: safeEmail,
    telegram,
  });

  return { user, adminDoc };
}

export async function getAdminByUserId(userId) {
  const response = await databases.listDocuments(
    DATABASE_ID,
    ADMINS_COLLECTION_ID,
    [Query.equal('$id', userId)],
  );

  if (!response.total || !response.documents.length) {
    return null;
  }

  return response.documents[0];
}

export async function loginAdmin({ email, password }) {
  const safeEmail = (email || '').trim();
  const safePassword = (password || '').trim();

  if (!safeEmail || !safePassword) {
    throw new Error('Email и пароль обязательны');
  }

  // Логин по email/паролю
  await account.createEmailPasswordSession(
    safeEmail,
    safePassword,
  );

  const user = await account.get();
  let adminDoc = await getAdminByEmail(safeEmail);

  // Если админ-документа нет, создадим его
  if (!adminDoc) {
    adminDoc = await createAdminDoc({
      email: safeEmail,
      telegram: '',
    });
  }

  return { user, adminDoc };
}

export async function addOwnedConfigurationToAdmin({ id, name }) {
  const user = await getCurrentUser();
  const email = user.email || '';

  let adminDoc = await getAdminByEmail(email);

  if (!adminDoc) {
    adminDoc = await createAdminDoc({
      email,
      telegram: '',
    });
  }

  const currentOwns = Array.isArray(adminDoc.owns) ? adminDoc.owns : [];

  const filteredOwns = currentOwns.filter((item) => item && item.id !== id);

  const updatedOwns = [
    ...filteredOwns,
    {
      id,
      name,
    },
  ];

  return databases.updateDocument(
    DATABASE_ID,
    ADMINS_COLLECTION_ID,
    adminDoc.$id,
    {
      owns: updatedOwns,
    },
  );
}

export async function removeOwnedConfigurationFromAdmin(id) {
  const safeId = (id || '').trim();
  if (!safeId) {
    throw new Error('ID конфигурации обязателен');
  }

  const user = await getCurrentUser();
  const email = user.email || '';
  const adminDoc = await getAdminByEmail(email);

  if (!adminDoc) {
    return null;
  }

  const currentOwns = Array.isArray(adminDoc.owns) ? adminDoc.owns : [];
  const updatedOwns = currentOwns.filter((item) => {
    if (!item) return false;
    if (typeof item === 'string') return item !== safeId;
    return item.id !== safeId && item.configId !== safeId;
  });

  return databases.updateDocument(
    DATABASE_ID,
    ADMINS_COLLECTION_ID,
    adminDoc.$id,
    {
      owns: updatedOwns,
    },
  );
}

export async function deleteConfigurationByConfigId(id) {
  const safeId = (id || '').trim();
  if (!safeId) {
    throw new Error('ID конфигурации обязателен');
  }

  const doc = await getConfigurationById(safeId);
  await databases.deleteDocument(
    DATABASE_ID,
    CONFIG_COLLECTION_ID,
    doc.$id,
  );
}

// ---------- Записи (notes) ----------

/**
 * Создаёт запись на приём.
 * @param {Object} params
 * @param {string} params.configurationDocumentId - $id документа конфигурации (из getConfigurationById)
 * @param {string} params.name - имя клиента
 * @param {string} params.time - дата-время в ISO строке
 * @param {string} params.username - telegram
 * @param {string} params.insta - instagram клиента
 * @param {string} params.phone - телефон клиента
 * @param {string} params.service - название услуги
 * @param {string} params.comment - комментарий клиента
 */
export async function createNote({
  configurationDocumentId,
  name,
  time,
  username,
  insta,
  phone,
  service,
  comment,
}) {
  if (!configurationDocumentId) {
    throw new Error('ID документа конфигурации обязателен');
  }

  const relationshipFields = ['configurations', 'configuration', 'configurationId'];
  const commentText = typeof comment === 'string' ? comment.trim() : '';
  const instaText = typeof insta === 'string' ? insta.trim() : '';
  const phoneText = typeof phone === 'string' ? phone.trim() : '';
  let lastErr = null;

  for (const fieldName of relationshipFields) {
    const basePayload = {
      name: String(name ?? '').trim(),
      time: String(time ?? ''),
      username: String(username ?? '').trim(),
      service: String(service ?? '').trim(),
      [fieldName]: configurationDocumentId,
    };

    const payloadWithOptional = {
      ...basePayload,
      ...(commentText ? { comment: commentText } : {}),
      ...(instaText ? { insta: instaText } : {}),
      ...(phoneText ? { phone: phoneText } : {}),
    };

    try {
      return await databases.createDocument(
        DATABASE_ID,
        NOTES_COLLECTION_ID,
        ID.unique(),
        payloadWithOptional,
      );
    } catch (e) {
      const msg = String(e?.message || e || '');
      if (!msg.includes('Unknown attribute')) {
        lastErr = e;
        continue;
      }

      // Некоторые инсталляции могут не иметь части колонок notes (comment/insta/phone).
      const optionalKeys = ['comment', 'insta', 'phone'];
      let safePayload = { ...payloadWithOptional };
      let attrError = msg.toLowerCase();

      for (let i = 0; i < optionalKeys.length; i += 1) {
        if (attrError.includes(`"${optionalKeys[i]}"`) || attrError.includes(`'${optionalKeys[i]}'`)) {
          delete safePayload[optionalKeys[i]];
        }
      }

      try {
        return await databases.createDocument(
          DATABASE_ID,
          NOTES_COLLECTION_ID,
          ID.unique(),
          safePayload,
        );
      } catch (e2) {
        const msg2 = String(e2?.message || e2 || '');
        if (!msg2.includes('Unknown attribute')) {
          lastErr = e2;
          continue;
        }
        attrError = msg2.toLowerCase();
        for (let i = 0; i < optionalKeys.length; i += 1) {
          if (attrError.includes(`"${optionalKeys[i]}"`) || attrError.includes(`'${optionalKeys[i]}'`)) {
            delete safePayload[optionalKeys[i]];
          }
        }
        try {
          return await databases.createDocument(
            DATABASE_ID,
            NOTES_COLLECTION_ID,
            ID.unique(),
            safePayload,
          );
        } catch (e3) {
          lastErr = e3;
        }
      }
    }
  }

  throw lastErr || new Error('Не удалось создать запись');
}

export function normalizeTelegramUsername(value) {
  if (typeof value !== 'string') return '';
  let next = value.trim();
  if (!next) return '';

  next = next.replace(/^https?:\/\/(www\.)?t\.me\//i, '');
  next = next.replace(/^t\.me\//i, '');
  next = next.replace(/^@/, '');
  next = next.split('/')[0];
  next = next.split('?')[0];
  next = next.replace(/[^a-zA-Z0-9_]/g, '');

  return next;
}

function generateSixDigitCode() {
  return String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
}

export async function createTelegramBindingCode() {
  const maxAttempts = 3;
  let lastErr = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const code = generateSixDigitCode();
    const documentId = code;

    const payloadWithIds = { bindingCode: code, chatId: null, userId: null };
    try {
      await databases.createDocument(
        DATABASE_ID,
        TELEGRAM_BINDINGS_COLLECTION_ID,
        documentId,
        payloadWithIds,
        ['read("any")'],
      );
      return code;
    } catch (e) {
      lastErr = e;
      const msg = String(e?.message || e || '').toLowerCase();

      if (msg.includes('409') || msg.includes('conflict') || msg.includes('already exists')) {
        continue;
      }

      if (msg.includes('unknown attribute')) {
        try {
          await databases.createDocument(
            DATABASE_ID,
            TELEGRAM_BINDINGS_COLLECTION_ID,
            documentId,
            { bindingCode: code },
            ['read("any")'],
          );
          return code;
        } catch (e2) {
          lastErr = e2;
          continue;
        }
      }
      continue;
    }
  }

  throw lastErr || new Error('Не удалось сгенерировать уникальный код привязки Telegram');
}

export async function sendTelegramBookingNotification({ targetUsername, targetChatId, text }) {
  const username = normalizeTelegramUsername(targetUsername);
  const explicitChatId = String(targetChatId || '').trim();
  const safeText = typeof text === 'string' ? text.trim() : '';

  if ((!username && !explicitChatId) || !safeText) return { sent: false, reason: 'missing-data' };

  // TODO: Вставьте токен бота, когда будете готовы включить отправку.
  const TELEGRAM_BOT_TOKEN = import.meta.env.VITE_TELEGRAM_BOT_TOKEN;
  if (!TELEGRAM_BOT_TOKEN) return { sent: false, reason: 'token-missing' };

  const chatId = explicitChatId;
  if (!chatId) {
    throw new Error(
      'Telegram chat not found. Сначала напиши боту с этого аккаунта, потом попробуй снова.',
    );
  }

  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: safeText,
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Telegram send failed: ${response.status} ${errText}`);
  }

  return { sent: true };
}

/**
 * Список записей по конфигурации (по document $id конфигурации).
 */
export async function listNotesByConfiguration(configurationDocumentId) {
  const safeId = (configurationDocumentId || '').trim();
  if (!safeId) return { total: 0, documents: [] };

  const relationshipFields = ['configurations', 'configuration', 'configurationId'];
  let lastErr = null;

  for (const fieldName of relationshipFields) {
    try {
      const nowIso = new Date().toISOString();
      const response = await databases.listDocuments(
        DATABASE_ID,
        NOTES_COLLECTION_ID,
        [
          Query.equal(fieldName, safeId),
          Query.greaterThanEqual('time', nowIso),
          Query.orderAsc('time'),
          Query.limit(500),
        ],
      );
      return { total: response.total, documents: response.documents };
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr || new Error('Не удалось получить записи');
}

export async function listNotesByConfigurationTimeRange({
  configurationDocumentId,
  fromIso,
  toIso,
  limit = 20,
  order = 'asc', // 'asc' | 'desc'
}) {
  const safeId = (configurationDocumentId || '').trim();
  if (!safeId) return { total: 0, documents: [] };

  const relationshipFields = ['configurations', 'configuration', 'configurationId'];
  let lastErr = null;

  const queriesBase = (fieldName) => {
    const queries = [Query.equal(fieldName, safeId)];
    if (fromIso) queries.push(Query.greaterThanEqual('time', fromIso));
    if (toIso) queries.push(Query.lessThanEqual('time', toIso));
    if (order === 'desc') queries.push(Query.orderDesc('time'));
    else queries.push(Query.orderAsc('time'));
    queries.push(Query.limit(limit));
    return queries;
  };

  for (const fieldName of relationshipFields) {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        NOTES_COLLECTION_ID,
        queriesBase(fieldName),
      );
      return { total: response.total, documents: response.documents };
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr || new Error('Не удалось получить записи по диапазону');
}

export async function deleteNoteById(noteDocumentId) {
  const safeId = String(noteDocumentId || '').trim();
  if (!safeId) throw new Error('ID записи обязателен');
  await databases.deleteDocument(
    DATABASE_ID,
    NOTES_COLLECTION_ID,
    safeId,
  );
}

// ---------- Storage helpers (avatars) ----------

export function resolveAvatarSrc(avatarValue) {
  if (!avatarValue || typeof avatarValue !== 'string') return '';
  if (avatarValue.startsWith('data:') || avatarValue.startsWith('http') || avatarValue.startsWith('blob:')) {
    return avatarValue;
  }

  try {
    const preview = storage.getFilePreview({
      bucketId: AVATARS_BUCKET_ID,
      fileId: avatarValue,
    });
    return preview?.href || '';
  } catch (e) {
    console.error('Failed to resolve avatar preview', e);
    return '';
  }
}

export async function uploadAvatarToStorage(file) {
  if (!file) throw new Error('Файл обязателен');
  const uploaded = await storage.createFile(AVATARS_BUCKET_ID, ID.unique(), file);
  return uploaded.$id;
}

export async function logoutCurrentSession() {
  return account.deleteSession('current');
}

export { client, databases, account };