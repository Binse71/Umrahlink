"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import AppTopNav from "@/components/AppTopNav";
import { useLanguage } from "@/components/LanguageProvider";
import { ProviderAvailability, Service, createBooking, getErrorMessage, getMe, getService, listAvailability } from "@/lib/api";
import { getAuthToken, setStoredUser } from "@/lib/auth-client";
import { withLocale } from "@/lib/i18n";

export default function NewBookingPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const t = (enText: string, arText: string) => withLocale(locale, enText, arText);
  const searchParams = useSearchParams();
  const serviceId = useMemo(() => Number.parseInt(searchParams.get("service") ?? "", 10), [searchParams]);

  const [service, setService] = useState<Service | null>(null);
  const [availabilitySlots, setAvailabilitySlots] = useState<ProviderAvailability[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [requestedLanguage, setRequestedLanguage] = useState("");
  const [travelDate, setTravelDate] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        if (Number.isNaN(serviceId)) {
          throw new Error(withLocale(locale, "Missing service selection. Choose a service from marketplace.", "لا يوجد اختيار للخدمة. اختر خدمة من السوق."));
        }

        const token = getAuthToken();
        if (!token) {
          router.replace("/signin");
          return;
        }

        const [me, selectedService] = await Promise.all([getMe(token), getService(serviceId)]);
        if (!mounted) {
          return;
        }

        setStoredUser(me);
        if (me.role !== "CUSTOMER") {
          throw new Error(withLocale(locale, "Only customer accounts can create bookings.", "فقط حسابات العملاء يمكنها إنشاء الحجوزات."));
        }

        const today = new Date();
        const dateFrom = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        const availabilityResponse = await listAvailability({
          provider: selectedService.provider,
          service_type: selectedService.service_type,
          available: 1,
          date_from: dateFrom
        });
        if (!mounted) {
          return;
        }

        setService(selectedService);
        setAvailabilitySlots(availabilityResponse.results);
      } catch (err) {
        if (!mounted) {
          return;
        }
        setError(getErrorMessage(err));
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadData();
    return () => {
      mounted = false;
    };
  }, [locale, router, serviceId]);

  useEffect(() => {
    if (!selectedSlotId) {
      return;
    }
    const slot = availabilitySlots.find((item) => item.id === Number.parseInt(selectedSlotId, 10));
    if (!slot) {
      return;
    }
    setTravelDate(slot.start_at.slice(0, 10));
  }, [availabilitySlots, selectedSlotId]);

  async function handleCreateBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!service) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const token = getAuthToken();
      if (!token) {
        throw new Error(t("Please sign in first.", "يرجى تسجيل الدخول أولاً."));
      }

      const booking = await createBooking(token, {
        service: service.id,
        availability_slot: selectedSlotId ? Number.parseInt(selectedSlotId, 10) : undefined,
        requested_language: requestedLanguage || undefined,
        travel_date: travelDate || undefined,
      });

      router.replace(`/bookings/${booking.id}`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app-shell">
      <AppTopNav links={[{ href: "/", label: "Home" }, { href: "/marketplace", label: "Marketplace" }, { href: "/bookings", label: "Bookings" }, { href: "/notifications", label: "Notifications" }]} />

      <main className="container page-container narrow">
        <section className="panel">
          <h1 className="page-title">{t("Confirm Booking", "تأكيد الحجز")}</h1>
          <p className="page-sub">{t("Review service details and submit your booking request.", "راجع تفاصيل الخدمة ثم أرسل طلب الحجز.")}</p>
        </section>

        {loading ? <section className="panel">{t("Loading service...", "جاري تحميل الخدمة...")}</section> : null}
        {error ? <p className="notice error">{error}</p> : null}

        {!loading && !error && service ? (
          <section className="panel">
            <div className="summary-card">
              <div className="provider-inline-head">
                {service.provider_photo_url ? (
                  <img
                    src={service.provider_photo_url}
                    alt={service.provider_name}
                    className="provider-photo-sm"
                  />
                ) : (
                  <div className="provider-photo-fallback provider-photo-sm">
                    {(service.provider_name || "P").slice(0, 1).toUpperCase()}
                  </div>
                )}
                <p className="page-sub mini">{service.provider_name}</p>
              </div>

              <h2 className="section-title">{service.title}</h2>
              <p className="page-sub mini">
                {service.city_scope.replaceAll("_", " ")}
              </p>
              <p className="page-sub mini">{service.description}</p>
              <p className="summary-price">
                {service.price_amount} {service.currency}
              </p>
            </div>

            <form className="form-grid" onSubmit={handleCreateBooking}>
              <label className="field">
                {t("Availability Slot (recommended)", "موعد التوفر (مستحسن)")}
                {availabilitySlots.length === 0 ? (
                  <p className="page-sub mini">{t("No published slots for this service yet. You can still submit a booking request.", "لا توجد مواعيد متاحة منشورة لهذه الخدمة حالياً. ما زال بإمكانك إرسال طلب الحجز.")}</p>
                ) : (
                  <select className="select" value={selectedSlotId} onChange={(event) => setSelectedSlotId(event.target.value)}>
                    <option value="">{t("No slot selected", "بدون اختيار موعد")}</option>
                    {availabilitySlots.map((slot) => (
                      <option key={slot.id} value={slot.id}>
                        {new Date(slot.start_at).toLocaleString()} - {new Date(slot.end_at).toLocaleTimeString()}
                      </option>
                    ))}
                  </select>
                )}
              </label>

              <div className="field-grid">
                <label className="field">
                  {t("Requested Language (optional)", "اللغة المطلوبة (اختياري)")}
                  <input
                    className="input"
                    value={requestedLanguage}
                    onChange={(event) => setRequestedLanguage(event.target.value)}
                    list="service-languages"
                    placeholder={t("No preference", "لا يوجد تفضيل")}
                  />
                  <datalist id="service-languages">
                    {service.languages.map((languageOption) => (
                      <option key={languageOption} value={languageOption} />
                    ))}
                  </datalist>
                </label>

                <label className="field">
                  {selectedSlotId ? t("Travel Date (auto from selected slot)", "تاريخ السفر (تلقائي من الموعد المختار)") : t("Travel Date", "تاريخ السفر")}
                  <input className="input" type="date" value={travelDate} onChange={(event) => setTravelDate(event.target.value)} disabled={Boolean(selectedSlotId)} />
                </label>
              </div>

              <div className="quick-links">
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {saving ? t("Creating booking...", "جاري إنشاء الحجز...") : t("Create Booking", "إنشاء الحجز")}
                </button>
                <Link href="/marketplace" className="btn btn-ghost">
                  {t("Back to Marketplace", "العودة إلى السوق")}
                </Link>
              </div>
            </form>
          </section>
        ) : null}
      </main>
    </div>
  );
}
