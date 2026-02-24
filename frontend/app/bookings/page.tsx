"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import AppTopNav from "@/components/AppTopNav";
import { useLanguage } from "@/components/LanguageProvider";
import { Booking, getErrorMessage, getMe, listMyBookings, logout } from "@/lib/api";
import { clearAuth, getAuthToken, setStoredUser } from "@/lib/auth-client";
import { withLocale } from "@/lib/i18n";

const STATUS_FILTERS = ["ALL", "REQUESTED", "ACCEPTED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "REJECTED"] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number];

function pretty(value: string) {
  return value.replaceAll("_", " ");
}

export default function BookingsPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const t = (enText: string, arText: string) => withLocale(locale, enText, arText);
  const [role, setRole] = useState<string | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filteredBookings = useMemo(() => {
    if (filter === "ALL") {
      return bookings;
    }
    return bookings.filter((booking) => booking.status === filter);
  }, [bookings, filter]);

  async function loadBookings() {
    setLoading(true);
    setError(null);

    try {
      const token = getAuthToken();
      if (!token) {
        router.replace("/signin");
        return;
      }

      const [me, bookingResponse] = await Promise.all([getMe(token), listMyBookings(token)]);
      setStoredUser(me);
      setRole(me.role);
      setBookings(bookingResponse.results);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBookings();
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
          { href: "/dashboard", label: "Dashboard" },
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
          <h1 className="page-title">{t("Bookings", "الحجوزات")}</h1>
          <p className="page-sub">{t("Track booking statuses, escrow updates, and service progress.", "تابع حالة الحجز وتحديثات الضمان وتقدم الخدمة.")}</p>

          <div className="quick-links">
            <Link href="/marketplace" className="btn btn-primary">
              {t("New Booking", "حجز جديد")}
            </Link>
            <Link href="/dashboard" className="btn btn-outline">
              {t("Back to Dashboard", "العودة إلى لوحة التحكم")}
            </Link>
          </div>

          <div className="status-filter-row">
            {STATUS_FILTERS.map((statusValue) => (
              <button
                key={statusValue}
                className={`filter-pill ${filter === statusValue ? "active" : ""}`}
                onClick={() => setFilter(statusValue)}
              >
                {pretty(statusValue)}
              </button>
            ))}
          </div>
        </section>

        {loading ? <section className="panel">{t("Loading bookings...", "جاري تحميل الحجوزات...")}</section> : null}
        {error ? <p className="notice error">{error}</p> : null}

        {!loading && !error ? (
          <section className="cards-grid bookings-grid">
            {filteredBookings.length === 0 ? (
              <div className="panel">{t("No bookings found for this filter.", "لا توجد حجوزات بهذا الفلتر.")}</div>
            ) : (
              filteredBookings.map((booking) => (
                <article key={booking.id} className="panel booking-card-ui">
                  <h2 className="section-title">{booking.service_title}</h2>
                  <p className="page-sub mini">{t("Ref", "المرجع")}: {booking.reference}</p>

                  <div className="meta-row">
                    <span className={`status-pill status-${booking.status.toLowerCase()}`}>{pretty(booking.status)}</span>
                    <span className={`status-pill status-${booking.escrow_status.toLowerCase()}`}>{pretty(booking.escrow_status)}</span>
                  </div>

                  <p className="page-sub mini">{t("Total", "الإجمالي")}: {booking.total_amount} {booking.service_currency}</p>

                  <div className="card-actions">
                    <Link href={`/bookings/${booking.id}`} className="inline-link">
                      {t("Open Details", "فتح التفاصيل")}
                    </Link>
                    {role === "CUSTOMER" ? (
                      <Link href={`/disputes?booking=${booking.id}`} className="inline-link">
                        {t("Open Dispute", "فتح نزاع")}
                      </Link>
                    ) : null}
                  </div>
                </article>
              ))
            )}
          </section>
        ) : null}
      </main>
    </div>
  );
}
