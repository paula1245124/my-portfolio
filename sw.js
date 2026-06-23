// ===================================================================
// Service Worker — منصة المواد التعليمية المحدثة
// الإستراتيجية: Network First (الشبكة أولاً) + كاش كنسخة احتياطية للعمل أوفلاين
// الهدف: أي تحديث يرفعه الأدمن (HTML / JS / PDF) يظهر فورًا لكل الزوار،
//         مع الحفاظ الكامل على بيانات localStorage (إجابات ودرجات الطلاب)
// ===================================================================

const CACHE_NAME = 'edu-platform-cache-v2';

// أهم ملفات "الهيكل" المطلوب توفرها فورًا عند أول تثبيت (تعمل أوفلاين)
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json'
];

// ---------- التثبيت ----------
self.addEventListener('install', (event) => {
  // يجعل النسخة الجديدة من الـ Service Worker "تنشط" فورًا
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // إن فشل تخزين أي ملف لا نوقف عملية التثبيت كلها
      return Promise.all(
        PRECACHE_URLS.map((url) => cache.add(url).catch(() => null))
      );
    })
  );
});

// ---------- التفعيل ----------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // حذف أي كاش قديم (مثل pf-v2 أو edu-platform-cache-v1)
      // هذا يحذف فقط ملفات الموقع المؤقتة ولا يلمس localStorage الخاصة بالطلاب نهائياً
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );

      // يجعل الـ Service Worker الجديد يتحكم فورًا في كل الصفحات المفتوحة حالياً
      await self.clients.claim();
    })()
  );
});

// ---------- التعامل مع كل الطلبات: Network First ----------
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // لا نتدخل إلا في طلبات GET فقط
  if (req.method !== 'GET') return;

  event.respondWith(
    (async () => {
      try {
        // الخطوة 1: نحاول دائمًا جلب أحدث نسخة من السيرفر مباشرة أولًا
        // (هذا ما يضمن ظهور أي تحديث أو ملف PDF جديد فورًا لكل الزوار)
        const networkResponse = await fetch(req, { cache: 'no-store' });

        if (networkResponse && networkResponse.ok) {
          // نحدّث الكاش بأحدث نسخة لتكون جاهزة للعمل أوفلاين لاحقًا
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, networkResponse.clone());
        }
        return networkResponse;
      } catch (err) {
        // الخطوة 2: لو مفيش إنترنت، نرجع لآخر نسخة محفوظة بالكاش كحل بديل فقط
        const cached = await caches.match(req);
        if (cached) return cached;

        // كحل أخير لو الصفحة الرئيسية نفسها مطلومة ومفيش لها نسخة محفوظة
        if (req.mode === 'navigate') {
          const fallback = await caches.match('./index.html');
          if (fallback) return fallback;
        }
        throw err;
      }
    })()
  );
});