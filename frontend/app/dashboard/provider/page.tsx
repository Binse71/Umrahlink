"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import AppTopNav from "@/components/AppTopNav";
import { useLanguage } from "@/components/LanguageProvider";
import {
  Booking,
  CityScope,
  PayoutLedger,
  ProviderPayoutProfile,
  Service,
  ServiceType,
  createService,
  getErrorMessage,
  getMe,
  getMyPayoutProfile,
  listMyBookings,
  listPayoutLedger,
  listServices,
  logout,
  updateBookingStatus,
  upsertMyPayoutProfile,
} from "@/lib/api";
import { clearAuth, getAuthToken, setStoredUser } from "@/lib/auth-client";
import { withLocale } from "@/lib/i18n";

const STATUS_TRANSITIONS: Record<string, string[]> = {
  REQUESTED: ["ACCEPTED", "REJECTED", "CANCELLED"],
  ACCEPTED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
};

function pretty(value: string) {
  return value.replaceAll("_", " ");
}

type ProviderTab = "BOOKINGS" | "PAYOUT_SETTINGS" | "PAYOUT_HISTORY";
type BookingFilter = "ALL" | "COMPLETED" | "REFUNDED" | "CANCELLED" | "IN_PROGRESS";

export default function ProviderDashboardPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const t = (enText: string, arText: string) => withLocale(locale, enText, arText);

  const [name, setName] = useState(withLocale(locale, "Provider", "مزود الخدمة"));
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [payoutHistory, setPayoutHistory] = useState<PayoutLedger[]>([]);
  const [payoutProfile, setPayoutProfile] = useState<ProviderPayoutProfile | null>(null);

  const [activeTab, setActiveTab] = useState<ProviderTab>("BOOKINGS");
  const [bookingFilter, setBookingFilter] = useState<BookingFilter>("ALL");

  const [serviceType, setServiceType] = useState<ServiceType>("UMRAH_BADAL");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [cityScope, setCityScope] = useState<CityScope>("MAKKAH");
  const [languages, setLanguages] = useState("Arabic, English");
  const [price, setPrice] = useState("250");

  const [payoutMethod, setPayoutMethod] = useState<"SAUDI_BANK" | "MPESA" | "USDT">("SAUDI_BANK");
  const [bankAccountName, setBankAccountName] = useState("");
  const [bankName, setBankName] = useState("");
  const [saudiIban, setSaudiIban] = useState("");
  const [mpesaFullName, setMpesaFullName] = useState("");
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [usdtNetwork, setUsdtNetwork] = useState<"TRC20" | "ERC20">("TRC20");
  const [usdtWalletAddress, setUsdtWalletAddress] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusLoading, setStatusLoading] = useState<number | null>(null);
  const [payoutSaving, setPayoutSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeBookings = useMemo(
    () => bookings.filter((booking) => !["COMPLETED", "CANCELLED", "REJECTED"].includes(booking.status)).length,
    [bookings]
  );

  const filteredBookings = useMemo(() => {
    if (bookingFilter === "ALL") {
      return bookings;
    }
    if (bookingFilter === "REFUNDED") {
      return bookings.filter((booking) => booking.escrow_status === "REFUNDED");
    }
    if (bookingFilter === "IN_PROGRESS") {
      return bookings.filter((booking) => ["REQUESTED", "ACCEPTED", "IN_PROGRESS"].includes(booking.status));
    }
    return bookings.filter((booking) => booking.status === bookingFilter);
  }, [bookingFilter, bookings]);

  function hydratePayoutForm(profile: ProviderPayoutProfile | null) {
    if (!profile) {
      return;
    }

    setPayoutMethod(profile.method);
    setBankAccountName(profile.bank_account_name || "");
    setBankName(profile.bank_name || "");
    setSaudiIban(profile.saudi_iban || "");
    setMpesaFullName(profile.mpesa_full_name || "");
    setMpesaPhone(profile.mpesa_phone || "");
    setUsdtNetwork((profile.usdt_network as "TRC20" | "ERC20") || "TRC20");
    setUsdtWalletAddress(profile.usdt_wallet_address || "");
  }

  async function loadDashboard() {
    setLoading(true);
    setError(null);

    try {
      const token = getAuthToken();
      if (!token) {
        router.replace("/signin");
        return;
      }

      const [me, bookingResponse, serviceResponse, payoutResponse] = await Promise.all([
        getMe(token),
        listMyBookings(token),
        listServices({ mine: 1 }, token),
        listPayoutLedger(token),
      ]);

      if (me.role !== "PROVIDER") {
        router.replace("/dashboard/customer");
        return;
      }

      setStoredUser(me);
      setName(me.first_name || me.username);
      setBookings(bookingResponse.results);
      setServices(serviceResponse.results);
      setPayoutHistory(payoutResponse.results);

      try {
        const profile = await getMyPayoutProfile(token);
        setPayoutProfile(profile);
        hydratePayoutForm(profile);
      } catch {
        setPayoutProfile(null);
      }
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
        currency: "USD",
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

  async function handleSavePayoutSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPayoutSaving(true);
    setError(null);
    setMessage(null);

    try {
      const token = getAuthToken();
      if (!token) {
        throw new Error(t("Please sign in first.", "يرجى تسجيل الدخول أولاً."));
      }

      const payload: Record<string, string> = { method: payoutMethod };
      if (payoutMethod === "SAUDI_BANK") {
        payload.bank_account_name = bankAccountName;
        payload.bank_name = bankName;
        payload.saudi_iban = saudiIban;
      } else if (payoutMethod === "MPESA") {
        payload.mpesa_full_name = mpesaFullName;
        payload.mpesa_phone = mpesaPhone;
      } else {
        payload.usdt_network = usdtNetwork;
        payload.usdt_wallet_address = usdtWalletAddress;
      }

      const updated = await upsertMyPayoutProfile(token, payload);
      setPayoutProfile(updated);
      setMessage(t("Payout settings saved.", "تم حفظ إعدادات السحب."));
      await loadDashboard();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPayoutSaving(false);
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
          { href: "/notifications", label: "Notifications" },
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
              <p className="page-sub">
                {t("Welcome,", "مرحباً،")} {name}. {t("Manage services, bookings, and payouts.", "أدر خدماتك وحجوزاتك وعمليات السحب.")}
              </p>
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
              <h3 className="section-title">{t("Keep your operations clean", "حافظ على تنظيم عملياتك")}</h3>
              <div className="provider-focus-list">
                <article>
                  <strong>{activeBookings}</strong>
                  <span>{t("Active Requests", "طلبات نشطة")}</span>
                </article>
                <article>
                  <strong>{services.length}</strong>
                  <span>{t("Live Services", "خدمات منشورة")}</span>
                </article>
                <article>
                  <strong>{payoutHistory.length}</strong>
                  <span>{t("Payout Records", "سجلات السحب")}</span>
                </article>
              </div>
            </aside>
          </div>
        </section>

        <section className="panel provider-section-card fade-up" style={{ animationDelay: "0.14s" }}>
          <div className="toolbar">
            <button className={`btn ${activeTab === "BOOKINGS" ? "btn-primary" : "btn-ghost"}`} onClick={() => setActiveTab("BOOKINGS")}>
              {t("Bookings", "الحجوزات")}
            </button>
            <button className={`btn ${activeTab === "PAYOUT_SETTINGS" ? "btn-primary" : "btn-ghost"}`} onClick={() => setActiveTab("PAYOUT_SETTINGS")}>
              {t("Payout Settings", "إعدادات السحب")}
            </button>
            <button className={`btn ${activeTab === "PAYOUT_HISTORY" ? "btn-primary" : "btn-ghost"}`} onClick={() => setActiveTab("PAYOUT_HISTORY")}>
              {t("Payout History", "سجل السحوبات")}
            </button>
          </div>
        </section>

        <section className="panel provider-section-card fade-up" style={{ animationDelay: "0.16s" }}>
          <div className="section-head-inline">
            <h2 className="section-title">{t("Create Service Listing", "إنشاء خدمة جديدة")}</h2>
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
              <textarea className="textarea" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} required />
            </label>

            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? t("Saving...", "جارٍ الحفظ...") : t("Create Service", "إنشاء الخدمة")}
            </button>
          </form>
        </section>

        {loading ? <section className="panel">{t("Loading provider data...", "جاري تحميل بيانات المزود...")}</section> : null}
        {message ? <p className="notice success">{message}</p> : null}
        {error ? <p className="notice error">{error}</p> : null}

        {!loading && activeTab === "BOOKINGS" ? (
          <section className="panel provider-section-card fade-up" style={{ animationDelay: "0.24s" }}>
            <div className="section-head-inline">
              <h2 className="section-title">{t("Incoming Bookings", "الحجوزات الواردة")}</h2>
              <label className="field" style={{ maxWidth: 240 }}>
                {t("Filter", "فلتر")}
                <select className="select" value={bookingFilter} onChange={(event) => setBookingFilter(event.target.value as BookingFilter)}>
                  <option value="ALL">{t("All", "الكل")}</option>
                  <option value="IN_PROGRESS">{t("In Progress", "قيد التنفيذ")}</option>
                  <option value="COMPLETED">{t("Completed", "مكتمل")}</option>
                  <option value="CANCELLED">{t("Cancelled", "ملغي")}</option>
                  <option value="REFUNDED">{t("Refunded", "مسترد")}</option>
                </select>
              </label>
            </div>
            {filteredBookings.length === 0 ? (
              <p className="page-sub">{t("No bookings for this filter.", "لا توجد حجوزات لهذا الفلتر.")}</p>
            ) : (
              <div className="cards-grid bookings-grid provider-bookings-grid">
                {filteredBookings.map((booking) => {
                  const availableTransitions = STATUS_TRANSITIONS[booking.status] ?? [];
                  return (
                    <article key={booking.id} className="panel booking-card-ui compact-card provider-booking-card">
                      <h3 className="section-title">{booking.service_title}</h3>
                      <p className="page-sub mini">{t("Ref", "المرجع")}: {booking.reference}</p>
                      <div className="meta-row">
                        <span className={`status-pill status-${booking.status.toLowerCase()}`}>{pretty(booking.status)}</span>
                        <span className={`status-pill status-${booking.escrow_status.toLowerCase()}`}>{pretty(booking.escrow_status)}</span>
                      </div>
                      <p className="page-sub mini">{booking.total_amount} {booking.service_currency}</p>
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

        {!loading && activeTab === "PAYOUT_SETTINGS" ? (
          <section className="panel provider-section-card fade-up" style={{ animationDelay: "0.24s" }}>
            <h2 className="section-title">{t("Payout Settings", "إعدادات السحب")}</h2>
            <p className="page-sub mini">
              {t("Admins can view this information to process manual payouts.", "يمكن للإدارة رؤية هذه البيانات لمعالجة السحوبات اليدوية.")}
            </p>
            <form className="form-grid" onSubmit={handleSavePayoutSettings}>
              <label className="field">
                {t("Payout Method", "طريقة السحب")}
                <select className="select" value={payoutMethod} onChange={(event) => setPayoutMethod(event.target.value as "SAUDI_BANK" | "MPESA" | "USDT")}>
                  <option value="SAUDI_BANK">{t("Saudi Bank", "تحويل بنكي سعودي")}</option>
                  <option value="MPESA">{t("M-Pesa", "M-Pesa")}</option>
                  <option value="USDT">USDT</option>
                </select>
              </label>

              {payoutMethod === "SAUDI_BANK" ? (
                <div className="field-grid">
                  <label className="field">
                    {t("Account Name", "اسم الحساب")}
                    <input className="input" value={bankAccountName} onChange={(event) => setBankAccountName(event.target.value)} required />
                  </label>
                  <label className="field">
                    {t("Bank Name", "اسم البنك")}
                    <input className="input" value={bankName} onChange={(event) => setBankName(event.target.value)} required />
                  </label>
                  <label className="field">
                    {t("Saudi IBAN (SA...)", "الآيبان السعودي (SA...)")}
                    <input className="input" value={saudiIban} onChange={(event) => setSaudiIban(event.target.value)} required />
                  </label>
                </div>
              ) : null}

              {payoutMethod === "MPESA" ? (
                <div className="field-grid">
                  <label className="field">
                    {t("Full Name", "الاسم الكامل")}
                    <input className="input" value={mpesaFullName} onChange={(event) => setMpesaFullName(event.target.value)} required />
                  </label>
                  <label className="field">
                    {t("Kenya Number (+254...)", "رقم كينيا (+254...)")}
                    <input className="input" value={mpesaPhone} onChange={(event) => setMpesaPhone(event.target.value)} required />
                  </label>
                </div>
              ) : null}

              {payoutMethod === "USDT" ? (
                <div className="field-grid">
                  <label className="field">
                    {t("Network", "الشبكة")}
                    <select className="select" value={usdtNetwork} onChange={(event) => setUsdtNetwork(event.target.value as "TRC20" | "ERC20")}>
                      <option value="TRC20">TRC20</option>
                      <option value="ERC20">ERC20</option>
                    </select>
                  </label>
                  <label className="field">
                    {t("Wallet Address", "عنوان المحفظة")}
                    <input className="input" value={usdtWalletAddress} onChange={(event) => setUsdtWalletAddress(event.target.value)} required />
                  </label>
                </div>
              ) : null}

              <button className="btn btn-primary" type="submit" disabled={payoutSaving}>
                {payoutSaving ? t("Saving...", "جارٍ الحفظ...") : t("Save Payout Settings", "حفظ إعدادات السحب")}
              </button>
            </form>
            {payoutProfile ? (
              <p className="page-sub mini">
                {t("Last updated", "آخر تحديث")}: {new Date(payoutProfile.updated_at).toLocaleString()}
              </p>
            ) : null}
          </section>
        ) : null}

        {!loading && activeTab === "PAYOUT_HISTORY" ? (
          <section className="panel provider-section-card fade-up" style={{ animationDelay: "0.24s" }}>
            <h2 className="section-title">{t("Payout History", "سجل السحوبات")}</h2>
            <p className="page-sub mini">
              {t(
                "Anti-fraud policy: provider payouts are processed within 24-48 hours after admin approval.",
                "سياسة مكافحة الاحتيال: تتم معالجة سحوبات المزود خلال 24-48 ساعة بعد موافقة الإدارة."
              )}
            </p>
            {payoutHistory.length === 0 ? (
              <p className="page-sub">{t("No payout records yet.", "لا توجد سجلات سحب بعد.")}</p>
            ) : (
              <div className="cards-grid bookings-grid provider-bookings-grid">
                {payoutHistory.map((payout) => (
                  <article key={payout.id} className="panel compact-card">
                    <h3 className="section-title">{t("Booking", "الحجز")} #{payout.booking}</h3>
                    <p className="page-sub mini">{t("Reference", "المرجع")}: {payout.booking_reference}</p>
                    <div className="meta-row">
                      <span className={`status-pill status-${payout.status.toLowerCase()}`}>{pretty(payout.status)}</span>
                      <span className="status-pill">{payout.payout_method || t("Not set", "غير محدد")}</span>
                    </div>
                    <p className="page-sub mini">{t("Gross", "الإجمالي")}: {payout.gross_amount}</p>
                    <p className="page-sub mini">{t("Platform Fee", "رسوم المنصة")}: {payout.platform_fee}</p>
                    <p className="page-sub mini"><strong>{t("Net", "الصافي")}: {payout.net_amount}</strong></p>
                    {payout.payout_window_start_at ? (
                      <p className="page-sub mini">
                        {t("Payout Window", "نافذة السحب")}:{" "}
                        {new Date(payout.payout_window_start_at).toLocaleString()} -{" "}
                        {payout.payout_window_end_at ? new Date(payout.payout_window_end_at).toLocaleString() : "-"}
                      </p>
                    ) : null}
                    {payout.status === "APPROVED" ? (
                      <p className="page-sub mini">
                        {payout.payout_window_state === "EARLY_HOLD"
                          ? t("Status: in anti-fraud hold (waiting for 24h).", "الحالة: تحت فترة حماية الاحتيال (انتظار 24 ساعة).")
                          : payout.payout_window_state === "IN_WINDOW"
                            ? t("Status: in 24-48h payout window.", "الحالة: ضمن نافذة السحب 24-48 ساعة.")
                            : payout.payout_window_state === "OVERDUE"
                              ? t("Status: payout is overdue beyond 48h window.", "الحالة: السحب متأخر بعد نافذة 48 ساعة.")
                              : ""}
                      </p>
                    ) : null}
                    {payout.payout_date ? <p className="page-sub mini">{t("Payout Date", "تاريخ السحب")}: {new Date(payout.payout_date).toLocaleString()}</p> : null}
                    {payout.admin_note ? <p className="page-sub mini">{t("Admin Note", "ملاحظة الإدارة")}: {payout.admin_note}</p> : null}
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
