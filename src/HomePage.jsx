import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './home.css'
import { getCurrentUser } from './appwriteClient.js';
import Lottie from 'lottie-react';
import flower from './flower.json';
import globe from './globe.json';
import YandexMetrika from './YandexMetrika.jsx';

function HomePage() {
  const [checkingAuth, setCheckingAuth] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function check() {
      try {
        const current = await getCurrentUser();
        if (current?.email) {
          navigate('/admin', { replace: true });
        }
      } catch {
      } finally {
        setCheckingAuth(false);
      }
    }
    check();
  }, [navigate]);

  if (checkingAuth) {
    return (
      <body className='load-container'>
        <div class="loader"></div>
      </body>
    );
  }

  return (
    <body className='landing'>
      <YandexMetrika />
      <header>
        <h2>Коннект</h2>
        <button onClick={() => navigate('/admin')}>
          <p>войти</p>
        </button>
      </header>

      <main>
        <div className="w800">
          <div className="col">
            <div className="text">
              <span>соединили красоту&nbsp;</span>

              <div className="lottie-wrapper">
                <Lottie animationData={flower} loop={true} />
              </div>

              <span>с комфортом, создав самый дешёвый сервис&nbsp;</span>

              <div className="lottie-wrapper">
                <Lottie animationData={globe} loop={true} />
              </div>

              <span>онлайн-брони.</span>
            </div>

            <button type="button" onClick={() => navigate('/admin')}>
              <p>получить страницу</p>
            </button>
          </div>

          <p className='bot'>о коннекте ↓</p>
        </div>

        <div className="white">
          <div className="l">
            <h3>Автоматический учёт свободных окошек ⏰</h3>
            <p>Выбери рабочее время и система сама будет предлагать свободные окошки клиенткам</p>
          </div>
          <div className="r">
            <h3>Комфортный дизайн 🌸</h3>
            <p>Пользоваться Коннектом приятно и мастерицам, и клиенткам</p>
          </div>
          <div className="l">
            <h3>Пример страницы 🧩</h3>
            <p>Пример Коннекта: <a href="https://cnct.click/anyuta">cnct.click/anyuta</a>. Это то, что увидят желающие записаться</p>
          </div>
          <div className="r">
            <h3>Уведомления в Telegram 🔔</h3>
            <p>Моментально оповестим о новой записи</p>
          </div>
          <div className="l">
            <h3>Самый дешёвый 🏆</h3>
            <p>Коннект стоит в 2-3 раза дешевле конкурентов — 500₽ в месяц</p>
          </div>


          <div className="last">
            <h3>Заходи к нам!</h3>
            <p><a href="/admin">зарегистрироватья</a></p>
            <div class="loader"></div>
          </div>
        </div>
      </main>
    </body>
  );
}

export default HomePage;
