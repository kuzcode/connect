import React from 'react';
import { Routes, Route } from 'react-router-dom';
import HomePage from './HomePage.jsx';
import ConfigPage from './ConfigPage.jsx';
import AdminPage from './AdminPage.jsx';
import CreateServicePage from './CreateServicePage.jsx';
import NotFoundPage from './NotFoundPage.jsx';

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/admin/create" element={<CreateServicePage />} />
      <Route path="/admin/edit/:configId" element={<CreateServicePage />} />
      <Route path="/:configId" element={<ConfigPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;
