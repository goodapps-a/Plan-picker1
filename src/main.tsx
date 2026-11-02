import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Register PWA Service Worker
if (typeof window !== 'undefined' && 'serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => console.log('[Planform SW] Registered:', reg.scope))
      .catch((err) => console.warn('[Planform SW] Registration failed:', err));
  });
}

createRoot(document.getElementById('root')!).render(<App />);

