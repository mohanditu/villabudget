import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Port 5173 is used by another local app, so this project runs on 5180.
// host: true listens on every network interface, so phones and laptops on the same
// Wi-Fi / LAN can open http://<this-computer's-IP>:5180. The browser only ever talks
// to Vite; Vite forwards /api to the API on this computer, so no CORS setup is needed.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5180,
    strictPort: true,
    allowedHosts: ['.local'], // also allow http://<computer-name>.local:5180 (IP addresses are always allowed)
    proxy: { '/api': 'http://localhost:4100' },
  },
  preview: {
    host: true,
    port: 5181,
    strictPort: true,
    allowedHosts: ['.local'],
    proxy: { '/api': 'http://localhost:4100' },
  },
});
