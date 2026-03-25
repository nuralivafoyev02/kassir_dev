// Cloudflare Worker - Firebase olib tashlangan, noop service worker
// Endi faqat Telegram orqali notification ishlatiladi

export function buildFirebaseMessagingServiceWorkerScript(env = {}) {
  // Noop service worker - Firebase olib tashlangan
  return `self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});`;
}
