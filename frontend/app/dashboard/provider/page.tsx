"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import AppTopNav from "@/components/AppTopNav";
import { useLanguage } from "@/components/LanguageProvider";
import {
  Booking,
  CityScope,
  Service,
  ServiceType,
  createService,
  getErrorMessage,
  getMe,
  listMyBookings,
  listServices,
  logout,
  updateBookingStatus
} from "@/lib/api";
import { clearAuth, getAuthToken, setStoredUser } from "@/lib/auth-client";
import { withLocale } from "@/lib/i18n";

const STATUS_TRANSITIONS: Record<string, string[]> = {
  REQUESTED: ["ACCEPTED", "REJECTED", "CANCELLED"],
  ACCEPTED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"]
};

function pretty(value: string) {
  return value.replaceAll("_", " ");
}

export default function ProviderDashboardPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const t = (enText: string, arText: string) => withLocale(locale, enText, arText);

  const [name, setName] = useState(withLocale(locale, "Provider", "مزود الخدمة"));
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [services, setServices] = useState<Service[]>([]);

  const [serviceType, setServiceType] = useState<ServiceType>("UMRAH_BADAL");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [cityScope, setCityScope] = useState<CityScope>("MAKKAH");
  const [languages, setLanguages] = useState("Arabic, English");
  const [price, setPrice] = useState("250");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusLoading, setStatusLoading] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeBookings = useMemo(
    () => bookings.filter((booking) => !["COMPLETED", "CANCELLED", "REJECTED"].includes(booking.status)).length,
    [bookings]
  );

  async function loadDashboard() {
    setLoading(true);
    setError(null);

    try {
      const token = getAuthToken();
      if (!token) {
        router.replace("/signin");
        return;
      }

      const [me, bookingResponse, serviceResponse] = await Promise.all([
        getMe(token),
        listMyBookings(token),
        listServices({ mine: 1 }, token)
      ]);

      if (me.role !== "PROVIDER") {
        router.replace("/dashboard/customer");
        return;
      }

      setStoredUser(me);
      setName(me.first_name || me.username);
      setBookings(bookingResponse.results);
      setServices(serviceResponse.results);
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

  async function handleCreateService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const token = getAuthToken();
      if (!token) {
        throw new Error(t("Please sign in first.", "يرجى تسجيل الدخول أولاً."));
      }

      const parsedPrice = Number.parseFloat(price);
      if (Number.isNaN(parsedPrice) || parsedPrice <= 0) {
        throw new Error(t("Enter a valid USD price.", "أدخل سعراً صحيحاً بالدولار الأمريكي."));
      }

      const created = await createService(token, {
        service_type: serviceType,
        title,
        description,
        city_scope: cityScope,
        languages: languages
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        price_amount: parsedPrice,
        currency: "USD"
      });

      setMessage(t(`Service created: ${created.title}`, `تم إنشاء الخدمة: ${created.title}`));
      setTitle("");
      setDescription("");
      await loadDashboard();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(bookingId: number, nextStatus: string) {
    setStatusLoading(bookingId);
    setError(null);

    try {
      const token = getAuthToken();
      if (!token) {
        throw new Error(t("Please sign in first.", "يرجى تسجيل الدخول أولاً."));
      }
      await updateBookingStatus(token, bookingId, nextStatus);
      await loadDashboard();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setStatusLoading(null);
    }
  }

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

      <main className="container page-container provider-flow provider-dashboard">
        <section className="panel provider-hero-panel provider-dashboard-hero fade-up" style={{ animationDelay: "0.08s" }}>
          <div className="provider-hero-grid">
            <div>
              <p className="eyebrow">{t("Provider Command Center", "مركز تحكم المزود")}</p>
              <h1 className="page-title">{t("Provider Dashboard", "لوحة تحكم المزود")}</h1>
              <p className="page-sub">{t("Welcome,", "مرحباً،")} {name}. {t("Manage services, booking requests, and customer support flows.", "أدر خدماتك وطلبات الحجز وتدفقات دعم العملاء.")}</p>
              <div className="quick-links provider-hero-actions">
                <Link href="/dashboard/provider/manage" className="btn btn-primary">
                  {t("Manage Profile & Services", "إدارة الملف والخدمات")}
                </Link>
                <Link href="/notifications" className="btn btn-outline">
                  {t("Notifications", "الإشعارات")}
                </Link>
              </div>
            </div>
            <aside className="provider-focus-card">
              <p className="eyebrow">{t("Today's Focus", "تركيز اليوم")}</p>
              <h3 className="section-title">{t("Keep your service board fresh", "حافظ على تحديث لوحة خدماتك")}</h3>
              <p className="page-sub mini">{t("Update prices quickly, respond to requests, and keep active slots visible to customers.", "حدّث الأسعار بسرعة، واستجب للطلبات، وحافظ على ظهور المواعيد المتاحة للعملاء.")}</p>
              <div className="provider-focus-list">
                <article>
                  <strong>{activeBookings}</strong>
                  <span>{t("Active Requests", "طلبات نشطة")}</span>
                </article>
                <article>
                  <strong>{services.length}</strong>
                  <span>{t("Live Services", "خدمات منشورة")}</span>
                </article>
              </div>
            </aside>
          </div>

          <div className="kpi-grid provider-kpi-grid">
            <article>
              <strong>{services.length}</strong>
              <span>{t("Published Services", "الخدمات المنشورة")}</span>
            </article>
            <article>
              <strong>{bookings.length}</strong>
              <span>{t("Total Bookings", "إجمالي الحجوزات")}</span>
            </article>
            <article>
              <strong>{activeBookings}</strong>
              <span>{t("Active Bookings", "الحجوزات النشطة")}</span>
            </article>
          </div>
        </section>

        <section className="panel provider-section-card fade-up" style={{ animationDelay: "0.16s" }}>
          <div className="section-head-inline">
            <h2 className="section-title">{t("Create Service Listing", "إنشاء خدمة جديدة")}</h2>
            <p className="page-sub mini">{t("Launch a new offer in under one minute.", "أطلق عرضاً جديداً خلال أقل من دقيقة.")}</p>
          </div>
          <form className="form-grid provider-form" onSubmit={handleCreateService}>
            <div className="field-grid">
              <label className="field">
                {t("Service Type", "نوع الخدمة")}
                <select className="select" value={serviceType} onChange={(event) => setServiceType(event.target.value as ServiceType)}>
                  <option value="UMRAH_BADAL">{t("Umrah Badal", "عمرة بدل")}</option>
                  <option value="ZIYARAH_GUIDE">{t("Ziyarah Guide", "مرشد زيارة")}</option>
                  <option value="UMRAH_ASSISTANT">{t("Umrah Assistant", "مساعد عمرة")}</option>
                </select>
              </label>

              <label className="field">
                {t("City Scope", "نطاق المدينة")}
                <select className="select" value={cityScope} onChange={(event) => setCityScope(event.target.value as CityScope)}>
                  <option value="MAKKAH">{t("Makkah", "مكة")}</option>
                  <option value="MADINAH">{t("Madinah", "المدينة")}</option>
                </select>
              </label>

              <label className="field">
                {t("Title", "العنوان")}
                <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} required />
              </label>

              <label className="field">
                {t("Price (USD)", "السعر (USD)")}
                <input className="input" inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} required />
              </label>
            </div>

            <label className="field">
              {t("Languages (comma separated)", "اللغات (مفصولة بفاصلة)")}
              <input className="input" value={languages} onChange={(event) => setLanguages(event.target.value)} required />
            </label>

            <label className="field">
              {t("Description", "الوصف")}
              <textarea className="textarea" rows={4} value={description} onChange={(event) => setDescription(event.target.value)} required />
            </label>

            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? t("Saving...", "جارٍ الحفظ...") : t("Create Service", "إنشاء الخدمة")}
            </button>
          </form>
        </section>

        {loading ? <section className="panel">{t("Loading provider data...", "جاري تحميل بيانات المزود...")}</section> : null}
        {message ? <p className="notice success">{message}</p> : null}
        {error ? <p className="notice error">{error}</p> : null}

        {!loading ? (
          <section className="panel provider-section-card fade-up" style={{ animationDelay: "0.24s" }}>
            <h2 className="section-title">{t("Incoming Bookings", "الحجوزات الواردة")}</h2>
            {bookings.length === 0 ? (
              <p className="page-sub">{t("No bookings yet.", "لا توجد حجوزات بعد.")}</p>
            ) : (
              <div className="cards-grid bookings-grid provider-bookings-grid">
                {bookings.slice(0, 8).map((booking) => {
                  const availableTransitions = STATUS_TRANSITIONS[booking.status] ?? [];

                  return (
                    <article key={booking.id} className="panel booking-card-ui compact-card provider-booking-card">
                      <h3 className="section-title">{booking.service_title}</h3>
                      <p className="page-sub mini">{t("Ref", "المرجع")}: {booking.reference}</p>

                      <div className="meta-row">
                        <span className={`status-pill status-${booking.status.toLowerCase()}`}>{pretty(booking.status)}</span>
                        <span className={`status-pill status-${booking.escrow_status.toLowerCase()}`}>{pretty(booking.escrow_status)}</span>
                      </div>

                      <p className="page-sub mini">
                        {booking.total_amount} {booking.service_currency} • {booking.customer_name || t("Customer", "عميل")}
                      </p>

                      <div className="inline-actions-wrap">
                        <Link href={`/bookings/${booking.id}`} className="inline-link">
                          {t("Details", "التفاصيل")}
                        </Link>

                        {availableTransitions.map((statusValue) => (
                          <button
                            key={statusValue}
                            className="mini-btn"
                            onClick={() => void handleStatusChange(booking.id, statusValue)}
                            disabled={statusLoading === booking.id}
                          >
                            {pretty(statusValue)}
                          </button>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        ) : null}
      </main>
    </div>
  );
}
