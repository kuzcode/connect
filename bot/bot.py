import os
import time
import sqlite3
import re
from datetime import datetime, timezone
from appwrite.client import Client
from appwrite.services.databases import Databases
from appwrite.query import Query
from appwrite.id import ID

import requests
import telebot


TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "8791958509:AAGJ_vNVBLCg9aBLKAaiMpGwHZtCk0QvxA0")
if not TELEGRAM_BOT_TOKEN:
    raise RuntimeError("Set TELEGRAM_BOT_TOKEN env var for bot.")

APPWRITE_ENDPOINT = os.getenv("APPWRITE_ENDPOINT", "https://cloud.appwrite.io/v1").rstrip("/")
APPWRITE_PROJECT_ID = os.getenv("APPWRITE_PROJECT_ID", "69ad52b9002370350eee")
APPWRITE_DATABASE_ID = os.getenv("APPWRITE_DATABASE_ID", "69ad534000186b123410")
APPWRITE_API_KEY = os.getenv("APPWRITE_API_KEY", "standard_b8e14210dd4f89f44982eeba987e982909a33138cb528f2e7871fea6923595a83c9192a06e8330932f778859d698150cf96e90f86f1f5559c0b0b988a94df7318d0583fee85960d21d87715564c3e20891e02d2158359db41d50e81b63e2d537df2accb9bf0cfb77dc040f3dd68a0ff1b1d59f798640a548b3af3b16451f399a")

ADMINS_COLLECTION_ID = "admins"
CONFIG_COLLECTION_ID = "configurations"
TELEGRAM_BINDINGS_COLLECTION_ID = "telegram_bindings"
CONFIG_ORDERS_COLLECTION_ID = "config_orders"

client = Client()
client.set_endpoint(APPWRITE_ENDPOINT)
client.set_project(APPWRITE_PROJECT_ID)
client.set_key(APPWRITE_API_KEY)
db = Databases(client)

if not (APPWRITE_PROJECT_ID and APPWRITE_DATABASE_ID and APPWRITE_API_KEY):
    raise RuntimeError("Set APPWRITE_PROJECT_ID, APPWRITE_DATABASE_ID, APPWRITE_API_KEY env vars for bot.")

DB_PATH = os.getenv("PAYMENT_BOT_SQLITE_PATH", os.path.join(os.path.dirname(__file__), "payments.sqlite3"))
ff
bot = telebot.TeleBot(TELEGRAM_BOT_TOKEN, parse_mode="HTML")

# Ожидаем ввод кода привязки после /start.
# key: telegram user id (message.from.id), value: unix timestamp окончания ожидания.
awaiting_binding_code_until = {}
BINDING_CODE_TTL_SECONDS = 10 * 60

def _headers():
    return {
        "Content-Type": "application/json",
        "X-Appwrite-Project": APPWRITE_PROJECT_ID,
        "X-Appwrite-Key": APPWRITE_API_KEY,
    }

@bot.message_handler(func=lambda message: bool(re.fullmatch(r'\d{6}', message.text.strip())))
def handle_code(message):
    code = message.text.strip()
    user_id = str(message.from_user.id)

    try:
        result = db.list_documents(
            database_id=APPWRITE_DATABASE_ID,
            collection_id=TELEGRAM_BINDINGS_COLLECTION_ID,
            queries=[Query.equal("bindingCode", code)]
        )

        documents = getattr(result, "documents", None)
        if documents is None and isinstance(result, dict):
            documents = result.get("documents", [])
        documents = documents or []

        if not documents:
            bot.send_message(
                message.chat.id,
                "Код не найден или уже истек. Сгенерируйте новый код на сайте.",
                parse_mode='Markdown'
            )
            return

        document = documents[0]
        if isinstance(document, dict):
            document_dict = document
        elif hasattr(document, "to_dict"):
            document_dict = document.to_dict() or {}
        else:
            document_dict = {}

        existing_user_id = document_dict.get("userId")
        if existing_user_id:
            bot.send_message(
                message.chat.id,
                "Этот код уже использован. Сгенерируйте новый код на сайте.",
                parse_mode='Markdown'
            )
            return

        document_id = document_dict.get("$id")
        if not document_id:
            bot.send_message(
                message.chat.id,
                "Не удалось обработать код. Попробуйте еще раз.",
                parse_mode='Markdown'
            )
            return

        db.update_document(
            database_id=APPWRITE_DATABASE_ID,
            collection_id=TELEGRAM_BINDINGS_COLLECTION_ID,
            document_id=document_id,
            data={
                "userId": user_id
            }
        )

        bot.send_message(message.chat.id, f"Аккаунт успешно привязан. Вернись на сайт", parse_mode='Markdown')

    except Exception as e:
        try:
            print("handle_code failed:", e)
        except Exception:
            pass
        bot.send_message(message.chat.id, "Неизвестная ошибка", parse_mode='Markdown')



def _extract_data(doc_json):
    if isinstance(doc_json, dict) and isinstance(doc_json.get("data"), dict):
        return doc_json["data"]
    return doc_json or {}


def appwrite_get_document(collection_id: str, document_id: str) -> dict:
    url = f"{APPWRITE_ENDPOINT}/databases/{APPWRITE_DATABASE_ID}/collections/{collection_id}/documents/{document_id}"
    r = requests.get(url, headers=_headers(), timeout=15)
    r.raise_for_status()
    return r.json()


def appwrite_patch_document(collection_id: str, document_id: str, data: dict) -> dict:
    url = f"{APPWRITE_ENDPOINT}/databases/{APPWRITE_DATABASE_ID}/collections/{collection_id}/documents/{document_id}"
    r = requests.patch(url, headers=_headers(), json={"data": data}, timeout=15)
    r.raise_for_status()
    return r.json()


def appwrite_create_document(collection_id: str, document_id: str, data: dict) -> dict:
    url = f"{APPWRITE_ENDPOINT}/databases/{APPWRITE_DATABASE_ID}/collections/{collection_id}/documents"
    body = {"documentId": document_id, "data": data}
    r = requests.post(url, headers=_headers(), json=body, timeout=15)
    r.raise_for_status()
    return r.json()


def appwrite_create_document_no_id(collection_id: str, data: dict) -> dict:
    url = f"{APPWRITE_ENDPOINT}/databases/{APPWRITE_DATABASE_ID}/collections/{collection_id}/documents"
    r = requests.post(url, headers=_headers(), json={"data": data}, timeout=15)
    r.raise_for_status()
    return r.json()


def add_months_utc(dt: datetime, months: int) -> datetime:
    # Keep time in UTC; clamp the day to the last valid day in target month.
    if months <= 0:
        return dt

    year = dt.year + (dt.month - 1 + months) // 12
    month = (dt.month - 1 + months) % 12 + 1

    # last day of the month
    if month == 12:
        next_month = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        next_month = datetime(year, month + 1, 1, tzinfo=timezone.utc)
    last_day = (next_month - datetime(year, month, 1, tzinfo=timezone.utc)).days

    day = min(dt.day, last_day)
    return datetime(year, month, day, dt.hour, dt.minute, dt.second, tzinfo=timezone.utc)


def ensure_payment_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS processed (charge_id TEXT PRIMARY KEY, processed_at INTEGER NOT NULL)"
    )
    conn.commit()
    return conn


def already_processed(conn: sqlite3.Connection, charge_id: str) -> bool:
    cur = conn.execute("SELECT charge_id FROM processed WHERE charge_id = ?", (charge_id,))
    return cur.fetchone() is not None


def mark_processed(conn: sqlite3.Connection, charge_id: str):
    conn.execute(
        "INSERT OR IGNORE INTO processed (charge_id, processed_at) VALUES (?, ?)",
        (charge_id, int(time.time())),
    )
    conn.commit()


def parse_invoice_payload(payload: str):
    # Format from the frontend:
    # TOPUP:<adminDocId>:<starsInt>
    # PURCHASE:<configOrderDocId>
    if not payload:
        return None
    parts = str(payload).split(":")
    if not parts:
        return None
    kind = parts[0]
    return kind, parts


@bot.pre_checkout_query_handler(func=lambda q: True)
def on_pre_checkout(pre_checkout_query):
    try:
        bot.answer_pre_checkout_query(pre_checkout_query.id, True)
    except Exception:
        # If we don't answer, Telegram keeps loading and cancels.
        try:
            print("answer_pre_checkout_query failed:", pre_checkout_query.id)
        except Exception:
            pass


@bot.message_handler(content_types=["pre_checkout_query"])
def on_pre_checkout_query_fallback(message):
    try:
        q = getattr(message, "pre_checkout_query", None)
        if not q:
            return
        bot.answer_pre_checkout_query(q.id, True)
    except Exception:
        try:
            print("fallback answer_pre_checkout_query failed")
        except Exception:
            pass


@bot.message_handler(content_types=["successful_payment"])
def on_successful_payment(message):
    conn = ensure_payment_db()
    try:
        sp = getattr(message, "successful_payment", None)
        if not sp:
            return

        payload = getattr(sp, "invoice_payload", None) or ""
        charge_id = getattr(sp, "telegram_payment_charge_id", None) or ""
        if not charge_id:
            return

        if already_processed(conn, charge_id):
            return
        mark_processed(conn, charge_id)

        parsed = parse_invoice_payload(payload)
        if not parsed:
            return

        kind, parts = parsed
        try:
            if kind == "TOPUP" and len(parts) >= 3:
                admin_doc_id = parts[1]
                try:
                    stars_int = int(parts[2])
                except Exception:
                    return
                if stars_int <= 0:
                    return

                admin_doc = appwrite_get_document(ADMINS_COLLECTION_ID, admin_doc_id)
                admin_data = _extract_data(admin_doc)
                current_balance = float(admin_data.get("balance") or 0.0)
                new_balance = current_balance + stars_int
                appwrite_patch_document(ADMINS_COLLECTION_ID, admin_doc_id, {"balance": new_balance})
                return

            if kind == "PURCHASE" and len(parts) >= 2:
                order_doc_id = parts[1]

                order_doc = appwrite_get_document(CONFIG_ORDERS_COLLECTION_ID, order_doc_id)
                order_data = _extract_data(order_doc)

                admin_doc_id = order_data.get("adminDocId")
                config_safe_id = order_data.get("configId")
                config_name = order_data.get("name") or config_safe_id or "Коннект"
                settings = order_data.get("settings") or "{}"

                try:
                    months_int = int(order_data.get("months") or 1)
                except Exception:
                    months_int = 1

                if not admin_doc_id or not config_safe_id:
                    return
                if months_int <= 0:
                    months_int = 1

                now = datetime.now(timezone.utc)
                payed_until = add_months_utc(now, months_int)
                payed_until_iso = payed_until.isoformat().replace("+00:00", "Z")

                # Create configuration AFTER successful payment.
                db.create_document(
                    database_id=APPWRITE_DATABASE_ID,
                    collection_id=CONFIG_COLLECTION_ID,
                    document_id=ID.unique(),
                    data={
                        "id": str(config_safe_id),
                        "name": str(config_name),
                        "settings": settings,
                        "payedUntil": payed_until_iso,
                        "admin": admin_doc_id
                    },
                    # IMPORTANT:
                    # This document is created with server API key. If we leave permissions empty,
                    # the frontend (which uses a client session) won't be able to read/update it,
                    # causing "missing in list" and crashes when opening edit page.
                    permissions=['read("any")', 'update("any")', 'delete("any")']
                )
                return
        except Exception as e:
            # Never crash the bot on a single bad payment payload.
            try:
                print("successful_payment processing failed:", e)
            except Exception:
                pass
            return
    finally:
        try:
            conn.close()
        except Exception:
            pass



if __name__ == "__main__":
    print("Бот запущен...")
    bot.polling(none_stop=True)
    bot.infinity_polling(skip_pending=True, long_polling_timeout=30)

