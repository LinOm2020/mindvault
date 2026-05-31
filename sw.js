const CACHE_NAME = 'mindvault-v1';
const SCHEDULED_KEY = 'scheduled_notifications';

// Хранилище задач в памяти SW
const scheduledTimers = new Map();

self.addEventListener('install', (e) => {
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(clients.claim());
});

// Восстановление запланированных уведомлений из IndexedDB при запуске SW
self.addEventListener('activate', (e) => {
    e.waitUntil(
        restoreScheduledNotifications().then(() => clients.claim())
    );
});

// Обработка сообщений от страницы
self.addEventListener('message', (e) => {
    const { action, text, time, id } = e.data || {};

    if (action === 'schedule-notification') {
        scheduleNotification(id || String(time), text, time);
    }

    if (action === 'cancel-notification') {
        cancelNotification(id);
    }

    if (action === 'ping') {
        e.source && e.source.postMessage({ action: 'pong' });
    }
});

// Клик по уведомлению — открыть приложение
self.addEventListener('notificationclick', (e) => {
    e.notification.close();
    e.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
            for (const client of list) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) return clients.openWindow('/');
        })
    );
});

function scheduleNotification(id, text, timestamp) {
    const delay = timestamp - Date.now();

    // Если время уже прошло — не планируем
    if (delay < 0) return;

    // Отменить предыдущий таймер с таким же id
    cancelNotification(id);

    const timerId = setTimeout(async () => {
        scheduledTimers.delete(id);
        await removeFromStore(id);

        self.registration.showNotification('MindVault Pro 🔔', {
            body: text.length > 100 ? text.slice(0, 97) + '...' : text,
            icon: '/icon-192.png',
            badge: '/icon-72.png',
            tag: id,
            renotify: true,
            requireInteraction: false,
            vibrate: [200, 100, 200],
            data: { url: '/' }
        });
    }, delay);

    scheduledTimers.set(id, timerId);
    saveToStore(id, { text, timestamp });
}

function cancelNotification(id) {
    if (scheduledTimers.has(id)) {
        clearTimeout(scheduledTimers.get(id));
        scheduledTimers.delete(id);
    }
    removeFromStore(id);
}

// --- IndexedDB helpers для персистентности ---

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('mv_sw_db', 1);
        req.onupgradeneeded = (e) => {
            e.target.result.createObjectStore('notifications', { keyPath: 'id' });
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
    });
}

async function saveToStore(id, data) {
    try {
        const db = await openDB();
        const tx = db.transaction('notifications', 'readwrite');
        tx.objectStore('notifications').put({ id, ...data });
    } catch (_) {}
}

async function removeFromStore(id) {
    try {
        const db = await openDB();
        const tx = db.transaction('notifications', 'readwrite');
        tx.objectStore('notifications').delete(id);
    } catch (_) {}
}

async function restoreScheduledNotifications() {
    try {
        const db = await openDB();
        const tx = db.transaction('notifications', 'readonly');
        const store = tx.objectStore('notifications');
        const all = await new Promise((res, rej) => {
            const req = store.getAll();
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
        });
        for (const item of all) {
            scheduleNotification(item.id, item.text, item.timestamp);
        }
    } catch (_) {}
}
