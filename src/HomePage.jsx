import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './styles.css';
import { getCurrentUser } from './appwriteClient.js';

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
      <main>
        <div className="block">
          <p>Загрузка...</p>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="block">
        <h2>Коннект</h2>
        <h1>И клиент доволен</h1>
        <button type="button" onClick={() => navigate('/admin')}>
          <p>Регистрация</p>
        </button>
      </div>

      <div className="more">
        <h3>О сервисе</h3>
        <p>Коннект — помощник вашего бизнеса, который принимает заявки, показывает ваше портфолио и помогает работать.</p>
      </div>
    </main>
  );
}

export default HomePage;
