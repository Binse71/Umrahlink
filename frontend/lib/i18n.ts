export type Locale = "en" | "ar";

export const LOCALE_STORAGE_KEY = "umrah_link_locale";

const UI_LABELS: Record<string, { en: string; ar: string }> = {
  "home": { en: "Home", ar: "الرئيسية" },
  "marketplace": { en: "Marketplace", ar: "السوق" },
  "dashboard": { en: "Dashboard", ar: "لوحة التحكم" },
  "bookings": { en: "Bookings", ar: "الحجوزات" },
  "messages": { en: "Messages", ar: "الرسائل" },
  "disputes": { en: "Disputes", ar: "النزاعات" },
  "notifications": { en: "Notifications", ar: "الإشعارات" },
  "admin panel": { en: "Admin Panel", ar: "لوحة الإدارة" },
  "provider tools": { en: "Provider Tools", ar: "أدوات المزود" },
  "sign in": { en: "Sign In", ar: "تسجيل الدخول" },
  "sign out": { en: "Sign Out", ar: "تسجيل الخروج" },
  "threads": { en: "Threads", ar: "المحادثات" },
  "booking": { en: "Booking", ar: "الحجز" },
  "auth": { en: "Auth", ar: "الدخول" },
  "how it works": { en: "How It Works", ar: "كيف تعمل المنصة" },
  "legal": { en: "Legal", ar: "القانوني" },
  "become a provider": { en: "Become a Provider", ar: "انضم كمزود خدمة" },
  "book now": { en: "Book Now", ar: "احجز الآن" },
  "find a provider": { en: "Find a Provider", ar: "ابحث عن مزود" },
  "view all bookings": { en: "View All Bookings", ar: "عرض كل الحجوزات" },
  "open messages": { en: "Open Messages", ar: "افتح الرسائل" },
  "new booking": { en: "New Booking", ar: "حجز جديد" },
  "back to dashboard": { en: "Back to Dashboard", ar: "العودة إلى لوحة التحكم" },
  "open details": { en: "Open Details", ar: "فتح التفاصيل" },
  "open dispute": { en: "Open Dispute", ar: "فتح نزاع" },
  "book this service": { en: "Book This Service", ar: "احجز هذه الخدمة" },
  "view provider": { en: "View Provider", ar: "عرض المزود" },
  "sign in to book": { en: "Sign In to Book", ar: "سجّل الدخول للحجز" },
  "details": { en: "Details", ar: "التفاصيل" },
  "loading": { en: "Loading...", ar: "جاري التحميل..." }
};

function normalizeLabel(value: string) {
  return value.trim().toLowerCase();
}

export function translateUiLabel(label: string, locale: Locale) {
  const translated = UI_LABELS[normalizeLabel(label)];
  if (!translated) {
    return label;
  }
  return translated[locale];
}

export function withLocale<T>(locale: Locale, enValue: T, arValue: T): T {
  return locale === "ar" ? arValue : enValue;
}
