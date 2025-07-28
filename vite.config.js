import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite configuration for the Czyste Powietrze calculator.  This file
// instructs Vite to use the React plugin, which enables JSX
// transformation out of the box.  No additional configuration is
// necessary for this simple project.
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'esnext'
  }
});