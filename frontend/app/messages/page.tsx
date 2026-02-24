"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import AppTopNav from "@/components/AppTopNav";
import { useLanguage } from "@/components/LanguageProvider";
import { Booking, BookingThread, createThread, getErrorMessage, getMe, listMyBookings, listThreads, logout } from "@/lib/api";
import { clearAuth, getAuthToken, setStoredUser } from "@/lib/auth-client";
import { withLocale } from "@/lib/i18n";

function pretty(value: string) {
  return value.replaceAll("_", " ");
}

export default function MessagesPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const t = (enText: string, arText: string) => withLocale(locale, enText, arText);
  const searchParams = useSearchParams();
  const bookingFromQuery = useMemo(() => Number.parseInt(searchParams.get("booking") ?? "", 10), [searchParams]);

  const [threads, setThreads] = useState<BookingThread[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [role, setRole] = useState<"CUSTOMER" | "PROVIDER" | "ADMIN" | null>(null);

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadMessagesHub() {
    setLoading(true);
    setError(null);

    try {
      const token = getAuthToken();
      if (!token) {
        router.replace("/signin");
        return;
      }

      const [me, threadResponse, bookingsResponse] = await Promise.all([getMe(token), listThreads(token), listMyBookings(token)]);
      setStoredUser(me);
      setRole(me.role);
      setThreads(threadResponse.results);
      setBookings(bookingsResponse.results);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMessagesHub();
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

  async function handleOpenThread(bookingId: number) {
    setActionLoading(bookingId);
    setError(null);
    setMessage(null);

    try {
      const token = getAuthToken();
      if (!token) {
        throw new Error(t("Please sign in first.", "يرجى تسجيل الدخول أولاً."));
      }

      const thread = await createThread(token, bookingId);
      router.push(`/messages/${thread.id}`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  const eligibleBookings = useMemo(
    () =>
      bookings.filter(
        (item) =>
          ["PAID", "HELD", "RELEASED"].includes(item.escrow_status) &&
          !["CANCELLED", "REJECTED"].includes(item.status)
      ),
    [bookings]
  );

  return (
    <div className="app-shell">
      <AppTopNav
        links={[
          { href: "/", label: "Home" },
          { href: "/dashboard", label: "Dashboard" },
          { href: "/bookings", label: "Bookings" },
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
          <h1 className="page-title">{t("Messages", "الرسائل")}</h1>
          <p className="page-sub">{t("In-app messaging unlocks only after payment.", "الرسائل داخل التطبيق تتفعّل فقط بعد الدفع.")}</p>
          <p className="page-sub mini">{t("Role", "الدور")}: {role ?? "-"}</p>
        </section>

        {bookingFromQuery && !Number.isNaN(bookingFromQuery) ? (
          <section className="panel">
            <p className="page-sub mini">{t("Quick action for booking", "إجراء سريع للحجز")} #{bookingFromQuery}</p>
            <button className="btn btn-primary" onClick={() => void handleOpenThread(bookingFromQuery)} disabled={actionLoading === bookingFromQuery}>
              {actionLoading === bookingFromQuery ? t("Opening...", "جاري الفتح...") : t("Open Chat for This Booking", "افتح محادثة لهذا الحجز")}
            </button>
          </section>
        ) : null}

        {loading ? <section className="panel">{t("Loading messages...", "جاري تحميل الرسائل...")}</section> : null}
        {error ? <p className="notice error">{error}</p> : null}
        {message ? <p className="notice success">{message}</p> : null}

        {!loading && !error ? (
          <>
            <section className="panel">
              <h2 className="section-title">{t("Existing Threads", "المحادثات الحالية")}</h2>
              {threads.length === 0 ? (
                <p className="page-sub">{t("No message threads yet.", "لا توجد محادثات بعد.")}</p>
              ) : (
                <div className="cards-grid">
                  {threads.map((thread) => (
                    <article key={thread.id} className="panel thread-card compact-card">
                      <h3 className="section-title">{t("Booking", "الحجز")} {thread.booking_reference}</h3>
                      <p className="page-sub mini">{t("Provider", "المزود")}: {thread.provider_name}</p>
                      <p className="page-sub mini">{t("Status", "الحالة")}: {thread.is_closed ? t("Closed", "مغلقة") : t("Open", "مفتوحة")}</p>
                      <div className="card-actions">
                        <Link href={`/messages/${thread.id}`} className="inline-link">
                          {t("Open Thread", "فتح المحادثة")}
                        </Link>
                        <Link href={`/bookings/${thread.booking}`} className="inline-link">
                          {t("Booking Details", "تفاصيل الحجز")}
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="panel">
              <h2 className="section-title">{t("Start a Chat from Your Bookings", "ابدأ محادثة من حجوزاتك")}</h2>
              {eligibleBookings.length === 0 ? (
                <p className="page-sub mini">{t("No bookings currently eligible for messaging.", "لا توجد حجوزات مؤهلة للمحادثة حالياً.")}</p>
              ) : (
                <div className="cards-grid bookings-grid">
                  {eligibleBookings.map((booking) => (
                    <article key={booking.id} className="panel compact-card">
                      <h3 className="section-title">{booking.service_title}</h3>
                      <p className="page-sub mini">{t("Ref", "المرجع")}: {booking.reference}</p>
                      <div className="meta-row">
                        <span className={`status-pill status-${booking.status.toLowerCase()}`}>{pretty(booking.status)}</span>
                        <span className={`status-pill status-${booking.escrow_status.toLowerCase()}`}>{pretty(booking.escrow_status)}</span>
                      </div>
                      <button className="btn btn-primary" onClick={() => void handleOpenThread(booking.id)} disabled={actionLoading === booking.id}>
                        {actionLoading === booking.id ? t("Opening...", "جاري الفتح...") : t("Open Chat", "فتح المحادثة")}
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
