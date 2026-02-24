"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import AppTopNav from "@/components/AppTopNav";
import { useLanguage } from "@/components/LanguageProvider";
import { Booking, Dispute, getErrorMessage, getMe, listDisputes, listMyBookings, logout } from "@/lib/api";
import { clearAuth, getAuthToken, setStoredUser } from "@/lib/auth-client";
import { withLocale } from "@/lib/i18n";

function pretty(value: string) {
  return value.replaceAll("_", " ");
}

export default function CustomerDashboardPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [name, setName] = useState(withLocale(locale, "Customer", "العميل"));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const t = (enText: string, arText: string) => withLocale(locale, enText, arText);
  const openBookings = useMemo(() => bookings.filter((item) => !["COMPLETED", "CANCELLED", "REJECTED"].includes(item.status)).length, [bookings]);

  async function loadDashboard() {
    setLoading(true);
    setError(null);

    try {
      const token = getAuthToken();
      if (!token) {
        router.replace("/signin");
        return;
      }

      const [me, bookingResponse, disputeResponse] = await Promise.all([
        getMe(token),
        listMyBookings(token),
        listDisputes(token)
      ]);

      if (me.role !== "CUSTOMER") {
        router.replace("/dashboard/provider");
        return;
      }

      setStoredUser(me);
      setName(me.first_name || me.username);
      setBookings(bookingResponse.results);
      setDisputes(disputeResponse.results);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSignOut() {
    try {
      const token = getAuthToken();
      if (token) {
        await logout(token);
      }
    } finally {
      clearAuth();
      router.replace("/signin");
    }
  }

  return (
    <div className="app-shell">
      <AppTopNav
        links={[
          { href: "/", label: "Home" },
          { href: "/marketplace", label: "Marketplace" },
          { href: "/bookings", label: "Bookings" },
          { href: "/messages", label: "Messages" },
          { href: "/disputes", label: "Disputes" },
          { href: "/notifications", label: "Notifications" }
        ]}
        actions={
          <button className="btn btn-ghost" onClick={handleSignOut}>
            {t("Sign Out", "تسجيل الخروج")}
          </button>
        }
      />

      <main className="container page-container">
        <section className="panel">
          <h1 className="page-title">{t("Customer Dashboard", "لوحة تحكم العميل")}</h1>
          <p className="page-sub">{t("Welcome back,", "مرحباً بعودتك،")} {name}. {t("Track your bookings, chat with providers, and manage disputes.", "تابع حجوزاتك وتواصل مع المزودين وأدِر النزاعات.")}</p>

          <div className="kpi-grid">
            <article>
              <strong>{bookings.length}</strong>
              <span>{t("Total Bookings", "إجمالي الحجوزات")}</span>
            </article>
            <article>
              <strong>{openBookings}</strong>
              <span>{t("Active Bookings", "الحجوزات النشطة")}</span>
            </article>
            <article>
              <strong>{disputes.length}</strong>
              <span>{t("Disputes", "النزاعات")}</span>
            </article>
          </div>

          <div className="quick-links">
            <Link href="/marketplace" className="btn btn-primary">
              {t("Find a Provider", "ابحث عن مزود خدمة")}
            </Link>
            <Link href="/bookings" className="btn btn-outline">
              {t("View All Bookings", "عرض كل الحجوزات")}
            </Link>
            <Link href="/messages" className="btn btn-ghost">
              {t("Open Messages", "فتح الرسائل")}
            </Link>
            <Link href="/notifications" className="btn btn-ghost">
              {t("Notifications", "الإشعارات")}
            </Link>
          </div>
        </section>

        {loading ? <section className="panel">{t("Loading dashboard data...", "جاري تحميل بيانات لوحة التحكم...")}</section> : null}
        {error ? <p className="notice error">{error}</p> : null}

        {!loading && !error ? (
          <section className="panel">
            <h2 className="section-title">{t("Recent Bookings", "أحدث الحجوزات")}</h2>
            {bookings.length === 0 ? (
              <p className="page-sub">{t("No bookings yet. Browse services in the marketplace.", "لا توجد حجوزات بعد. تصفح الخدمات في السوق.")}</p>
            ) : (
              <div className="cards-grid bookings-grid">
                {bookings.slice(0, 6).map((booking) => (
                  <article key={booking.id} className="panel booking-card-ui compact-card">
                    <h3 className="section-title">{booking.service_title}</h3>
                    <p className="page-sub mini">{t("Ref", "المرجع")}: {booking.reference}</p>
                    <div className="meta-row">
                      <span className={`status-pill status-${booking.status.toLowerCase()}`}>{pretty(booking.status)}</span>
                      <span className={`status-pill status-${booking.escrow_status.toLowerCase()}`}>{pretty(booking.escrow_status)}</span>
                    </div>
                    <p className="page-sub mini">
                      {booking.total_amount} {booking.service_currency} • {booking.provider_name}
                    </p>
                    <Link href={`/bookings/${booking.id}`} className="inline-link">
                      {t("View Details", "عرض التفاصيل")}
                    </Link>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}
      </main>
    </div>
  );
}
