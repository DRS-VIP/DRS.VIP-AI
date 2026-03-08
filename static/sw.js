/**
 * DRS.VIP-AI Service Worker
 * Progressive Web App with offline support and caching strategies
 */

const CACHE_NAME = 'drs-vip-ai-v1';
const STATIC_CACHE = 'drs-vip-ai-static-v1';
const DYNAMIC_CACHE = 'drs-vip-ai-dynamic-v1';
const API_CACHE = 'drs-vip-ai-api-v1';

// Static assets to cache immediately
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/css/styles.css',
    '/css/animations.css',
    '/css/themes/dark-neural.css',
    '/css/themes/light-holo.css',
    '/css/themes/quantum-glass.css',
    '/js/part1-core.js',
    '/js/part2-graphics.js',
    '/js/part3-api.js',
    '/js/part4-chat.js',
    '/js/part5-system.js',
    '/manifest.json',
    '/assets/icons/favicon.svg',
    '/assets/icons/icon-192.png',
    '/assets/icons/icon-512.png'
];

// Cache strategies
const CACHE_STRATEGIES = {
    networkFirst: 'networkFirst',
    cacheFirst: 'cacheFirst',
    staleWhileRevalidate: 'staleWhileRevalidate'
};

// URL patterns for different caching strategies
const CACHE_RULES = [
    { pattern: /\/api\//, strategy: CACHE_STRATEGIES.networkFirst, cache: API_CACHE },
    { pattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/, strategy: CACHE_STRATEGIES.cacheFirst, cache: DYNAMIC_CACHE },
    { pattern: /\.(?:js|css)$/, strategy: CACHE_STRATEGIES.staleWhileRevalidate, cache: STATIC_CACHE },
    { pattern: /fonts\.googleapis\.com/, strategy: CACHE_STRATEGIES.staleWhileRevalidate, cache: DYNAMIC_CACHE },
    { pattern: /fonts\.gstatic\.com/, strategy: CACHE_STRATEGIES.cacheFirst, cache: DYNAMIC_CACHE }
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...');
    
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                console.log('[SW] Static assets cached');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('[SW] Failed to cache static assets:', error);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => {
                            return name !== STATIC_CACHE && 
                                   name !== DYNAMIC_CACHE && 
                                   name !== API_CACHE;
                        })
                        .map((name) => {
                            console.log('[SW] Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => {
                console.log('[SW] Service worker activated');
                return self.clients.claim();
            })
    );
});

// Fetch event - handle requests with caching strategies
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }
    
    // Skip chrome-extension and other non-http(s) requests
    if (!url.protocol.startsWith('http')) {
        return;
    }
    
    // Find matching cache rule
    const rule = CACHE_RULES.find((r) => r.pattern.test(request.url));
    
    if (rule) {
        switch (rule.strategy) {
            case CACHE_STRATEGIES.networkFirst:
                event.respondWith(networkFirst(request, rule.cache));
                break;
            case CACHE_STRATEGIES.cacheFirst:
                event.respondWith(cacheFirst(request, rule.cache));
                break;
            case CACHE_STRATEGIES.staleWhileRevalidate:
                event.respondWith(staleWhileRevalidate(request, rule.cache));
                break;
            default:
                event.respondWith(staleWhileRevalidate(request, rule.cache));
        }
    } else {
        // Default strategy
        event.respondWith(staleWhileRevalidate(request, DYNAMIC_CACHE));
    }
});

// Network First Strategy
async function networkFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    
    try {
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.log('[SW] Network failed, falling back to cache:', request.url);
        const cachedResponse = await cache.match(request);
        
        if (cachedResponse) {
            return cachedResponse;
        }
        
        // Return offline page for navigation requests
        if (request.mode === 'navigate') {
            return caches.match('/index.html');
        }
        
        return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
    }
}

// Cache First Strategy
async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
        return cachedResponse;
    }
    
    try {
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.log('[SW] Network failed for cache-first request:', request.url);
        return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
    }
}

// Stale While Revalidate Strategy
async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    
    const fetchPromise = fetch(request)
        .then((networkResponse) => {
            if (networkResponse.ok) {
                cache.put(request, networkResponse.clone());
            }
            return networkResponse;
        })
        .catch((error) => {
            console.log('[SW] Network failed for SWR request:', request.url);
            return null;
        });
    
    return cachedResponse || fetchPromise;
}

// Background sync for offline actions
self.addEventListener('sync', (event) => {
    console.log('[SW] Background sync:', event.tag);
    
    if (event.tag === 'sync-messages') {
        event.waitUntil(syncMessages());
    }
});

async function syncMessages() {
    // Get pending messages from IndexedDB
    const pendingMessages = await getPendingMessages();
    
    for (const message of pendingMessages) {
        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(message)
            });
            
            if (response.ok) {
                await removePendingMessage(message.id);
            }
        } catch (error) {
            console.error('[SW] Failed to sync message:', error);
        }
    }
}

// Push notifications
self.addEventListener('push', (event) => {
    console.log('[SW] Push received:', event);
    
    let notificationData = {
        title: 'DRS.VIP-AI',
        body: 'New notification',
        icon: '/assets/icons/icon-192.png',
        badge: '/assets/icons/badge.png',
        tag: 'drs-vip-notification',
        data: {}
    };
    
    if (event.data) {
        try {
            const data = event.data.json();
            notificationData = { ...notificationData, ...data };
        } catch (e) {
            notificationData.body = event.data.text();
        }
    }
    
    event.waitUntil(
        self.registration.showNotification(notificationData.title, {
            body: notificationData.body,
            icon: notificationData.icon,
            badge: notificationData.badge,
            tag: notificationData.tag,
            data: notificationData.data
        })
    );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked:', event);
    
    event.notification.close();
    
    event.waitUntil(
        clients.matchAll({ type: 'window' })
            .then((clientList) => {
                // Check if app is already open
                for (const client of clientList) {
                    if (client.url.includes(self.location.origin) && 'focus' in client) {
                        client.focus();
                        client.postMessage({
                            type: 'NOTIFICATION_CLICK',
                            data: event.notification.data
                        });
                        return;
                    }
                }
                
                // Open new window if not already open
                if (clients.openWindow) {
                    return clients.openWindow('/');
                }
            })
    );
});

// Message handler
self.addEventListener('message', (event) => {
    console.log('[SW] Message received:', event.data);
    
    if (event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data.type === 'CACHE_URLS') {
        event.waitUntil(
            caches.open(DYNAMIC_CACHE)
                .then((cache) => cache.addAll(event.data.urls))
        );
    }
    
    if (event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((name) => caches.delete(name))
                );
            })
        );
    }
});

// IndexedDB helpers for offline storage
function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('DRS-VIP-AI-Offline', 1);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            if (!db.objectStoreNames.contains('pendingMessages')) {
                db.createObjectStore('pendingMessages', { keyPath: 'id' });
            }
            
            if (!db.objectStoreNames.contains('offlineData')) {
                db.createObjectStore('offlineData', { keyPath: 'key' });
            }
        };
    });
}

async function getPendingMessages() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['pendingMessages'], 'readonly');
        const store = transaction.objectStore('pendingMessages');
        const request = store.getAll();
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}

async function removePendingMessage(id) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['pendingMessages'], 'readwrite');
        const store = transaction.objectStore('pendingMessages');
        const request = store.delete(id);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}

// Periodic background sync (if supported)
self.addEventListener('periodicsync', (event) => {
    console.log('[SW] Periodic sync:', event.tag);
    
    if (event.tag === 'update-data') {
        event.waitUntil(updateData());
    }
});

async function updateData() {
    try {
        const response = await fetch('/api/status');
        if (response.ok) {
            const data = await response.json();
            // Store in IndexedDB for offline access
            const db = await openDatabase();
            const transaction = db.transaction(['offlineData'], 'readwrite');
            const store = transaction.objectStore('offlineData');
            store.put({ key: 'systemStatus', data: data, timestamp: Date.now() });
        }
    } catch (error) {
        console.error('[SW] Periodic sync failed:', error);
    }
}

// Handle streaming responses
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // Special handling for SSE/streaming endpoints
    if (url.pathname.includes('/stream') || url.pathname.includes('/sse')) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    return response;
                })
                .catch(() => {
                    return new Response('Streaming unavailable offline', {
                        status: 503,
                        statusText: 'Service Unavailable'
                    });
                })
        );
    }
});

console.log('[SW] Service Worker loaded');