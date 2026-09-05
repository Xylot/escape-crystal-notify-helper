import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './style.css';
import './accessibility.css';
import './encounter.css';
import './qa-fixes.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
import './light.css';
