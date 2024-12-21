import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import MainComponent from './MainComponent';
import UserPage from './UserPage';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <Router>
    <Routes>
      <Route path="/" element={<MainComponent />} />
      <Route path="/userpage/:username" element={<UserPage />} />
    </Routes>
  </Router>
);