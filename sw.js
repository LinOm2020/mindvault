const CACHE_NAME = 'mindvault-v3';

self.addEventListener('install', event => {
    console.log('SW installing...');
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    console.log('SW activating...');
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            );
        }).then(() => {
            return clients.claim();
        })
    );
});

self.addEventListener('fetch', event => {
    if (event.request.url.includes('/mindvault/') && event.request.mode === 'navigate') {
        event.respondWith(fetch(event.request));
        return;
    }
    event.respondWith(fetch(event.request));
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(clients.openWindow('/mindvault/'));
});
