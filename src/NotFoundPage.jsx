import React from 'react';
import { useNavigate } from 'react-router-dom';
import './notFound.css';

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <main className="notfound">
      <div className="notfound-card">
        <div className="notfound-glow" aria-hidden="true" />

        <div className="notfound-hero">
          <h6 aria-label="404">404</h6>
          <div className="notfound-badge"><p>Страница не найдена :(</p></div>
        </div>
        <div className="notfound-actions">
          <button type="button" className="notfound-primary" onClick={() => navigate('/')}>
            На главную
          </button>
        </div>
      </div>
    </main>
  );
}

