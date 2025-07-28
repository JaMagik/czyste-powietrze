import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './style.css';

// Mount the React application into the root element defined in
// index.html.  StrictMode is enabled to help identify potential
// problems during development.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);