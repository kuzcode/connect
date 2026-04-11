import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './home.css'
import { getCurrentUser } from './appwriteClient.js';
import Lottie from 'lottie-react';
import flower from './flower.json';
import globe from './globe.json';

function HomePage() {
  const [checkingAuth, setCheckingAuth] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function check() {
      try {
        const current = await getCurrentUser();
        // anonymous-сессии не имеют email — считаем пользователя неавторизованным
        if (current?.email) {
          navigate('/admin', { replace: true });
        }
      } catch {
        // Не авторизован — просто показываем главную
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
        </div>
      </main>
    </body>
  );
}

export default HomePage;
