"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";

import AppTopNav from "@/components/AppTopNav";
import { useLanguage } from "@/components/LanguageProvider";
import { Booking, Dispute, createDispute, getErrorMessage, getMe, listDisputes, listMyBookings, logout } from "@/lib/api";
import { clearAuth, getAuthToken, setStoredUser } from "@/lib/auth-client";
import { withLocale } from "@/lib/i18n";

const RESOLUTION_OPTIONS = ["REFUND", "RELEASE", "PARTIAL", "OTHER"] as const;
type ResolutionOption = (typeof RESOLUTION_OPTIONS)[number];

function pretty(value: string) {
  return value.replaceAll("_", " ");
}

function DisputesPageContent() {
  const router = useRouter();
  const { locale } = useLanguage();
  const t = (enText: string, arText: string) => withLocale(locale, enText, arText);
  const searchParams = useSearchParams();
  const bookingFromQuery = useMemo(() => Number.parseInt(searchParams.get("booking") ?? "", 10), [searchParams]);

  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);

  const [selectedBookingId, setSelectedBookingId] = useState("");
  const [resolution, setResolution] = useState<ResolutionOption>("REFUND");
  const [reason, setReason] = useState("");

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);

      try {
        const token = getAuthToken();
        if (!token) {
          router.replace("/signin");
          return;
        }

        const [me, disputeResponse, bookingResponse] = await Promise.all([
          getMe(token),
          listDisputes(token),
          listMyBookings(token)
        ]);

        setStoredUser(me);
        setDisputes(disputeResponse.results);
        setBookings(bookingResponse.results);

        if (!Number.isNaN(bookingFromQuery)) {
          setSelectedBookingId(String(bookingFromQuery));
        } else if (bookingResponse.results.length > 0) {
          setSelectedBookingId(String(bookingResponse.results[0].id));
        }
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [bookingFromQuery, router]);

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

  async function handleCreateDispute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setCreating(true);
    setError(null);

    try {
      const token = getAuthToken();
      if (!token) {
        throw new Error(t("Please sign in first.", "يرجى تسجيل الدخول أولاً."));
      }

      const bookingId = Number.parseInt(selectedBookingId, 10);
      if (Number.isNaN(bookingId)) {
        throw new Error(t("Please select a booking.", "يرجى اختيار حجز."));
      }
      if (!reason.trim()) {
        throw new Error(t("Please enter the dispute reason.", "يرجى إدخال سبب النزاع."));
      }

      const created = await createDispute(token, {
        booking: bookingId,
        requested_resolution: resolution,
        reason: reason.trim()
      });

      router.push(`/disputes/${created.id}`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  const eligibleForDispute = useMemo(() => bookings.filter((booking) => booking.status !== "REQUESTED"), [bookings]);

  return (
    <div className="app-shell">
      <AppTopNav
        links={[
          { href: "/", label: "Home" },
          { href: "/dashboard", label: "Dashboard" },
          { href: "/bookings", label: "Bookings" },
          { href: "/messages", label: "Messages" },
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
          <h1 className="page-title">{t("Disputes", "النزاعات")}</h1>
          <p className="page-sub">{t("Open and track dispute cases with evidence and admin decision history.", "افتح وتتبع حالات النزاع مع الأدلة وسجل قرارات الإدارة.")}</p>
        </section>

        {loading ? <section className="panel">{t("Loading disputes...", "جاري تحميل النزاعات...")}</section> : null}
        {error ? <p className="notice error">{error}</p> : null}

        {!loading && !error ? (
          <>
            <section className="panel">
              <h2 className="section-title">{t("Open a New Dispute", "فتح نزاع جديد")}</h2>
              {eligibleForDispute.length === 0 ? (
                <p className="page-sub mini">{t("No eligible booking found. Disputes can be opened only after booking is accepted.", "لا يوجد حجز مؤهل. يمكن فتح النزاع فقط بعد قبول الحجز.")}</p>
              ) : (
                <form className="form-grid" onSubmit={handleCreateDispute}>
                  <div className="field-grid">
                    <label className="field">
                      {t("Booking", "الحجز")}
                      <select className="select" value={selectedBookingId} onChange={(event) => setSelectedBookingId(event.target.value)}>
                        {eligibleForDispute.map((booking) => (
                          <option key={booking.id} value={booking.id}>
                            {booking.reference} - {booking.service_title}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="field">
                      {t("Requested Resolution", "الحل المطلوب")}
                      <select className="select" value={resolution} onChange={(event) => setResolution(event.target.value as ResolutionOption)}>
                        {RESOLUTION_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {pretty(option)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label className="field">
                    {t("Dispute Reason", "سبب النزاع")}
                    <textarea
                      className="textarea"
                      rows={4}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder={t("Describe the issue clearly", "اشرح المشكلة بوضوح")}
                    />
                  </label>

                  <button className="btn btn-primary" type="submit" disabled={creating}>
                    {creating ? t("Opening dispute...", "جاري فتح النزاع...") : t("Open Dispute", "فتح النزاع")}
                  </button>
                </form>
              )}
            </section>

            <section className="panel">
              <h2 className="section-title">{t("Your Disputes", "نزاعاتك")}</h2>
              {disputes.length === 0 ? (
                <p className="page-sub">{t("No dispute cases yet.", "لا توجد حالات نزاع بعد.")}</p>
              ) : (
                <div className="cards-grid">
                  {disputes.map((dispute) => (
                    <article key={dispute.id} className="panel compact-card">
                      <h3 className="section-title">{t("Case", "الحالة")} #{dispute.id}</h3>
                      <p className="page-sub mini">{t("Booking", "الحجز")}: {dispute.booking_reference}</p>
                      <div className="meta-row">
                        <span className={`status-pill status-${dispute.status.toLowerCase()}`}>{pretty(dispute.status)}</span>
                        <span className="status-pill">{pretty(dispute.requested_resolution)}</span>
                      </div>
                      <p className="page-sub mini">{dispute.reason}</p>
                      <div className="card-actions">
                        <Link href={`/disputes/${dispute.id}`} className="inline-link">
                          {t("Open Case", "فتح الحالة")}
                        </Link>
                        <Link href={`/bookings/${dispute.booking}`} className="inline-link">
                          {t("Booking Details", "تفاصيل الحجز")}
                        </Link>
                      </div>
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

export default function DisputesPage() {
  return (
    <Suspense fallback={<section className="panel">Loading...</section>}>
      <DisputesPageContent />
    </Suspense>
  );
}
