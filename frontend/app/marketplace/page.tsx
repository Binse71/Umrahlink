"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import AppTopNav from "@/components/AppTopNav";
import { useLanguage } from "@/components/LanguageProvider";
import { CityScope, ProviderAvailability, Service, ServiceType, getErrorMessage, listAvailability, listProviders, listServices } from "@/lib/api";
import { getStoredUser } from "@/lib/auth-client";
import { withLocale } from "@/lib/i18n";

const SERVICE_TYPE_OPTIONS: ServiceType[] = ["UMRAH_BADAL", "ZIYARAH_GUIDE", "UMRAH_ASSISTANT"];
const CITY_SCOPE_OPTIONS: CityScope[] = ["MAKKAH", "MADINAH"];

function pretty(value: string) {
  return value.replaceAll("_", " ");
}

export default function MarketplacePage() {
  const { locale } = useLanguage();
  const t = (enText: string, arText: string) => withLocale(locale, enText, arText);
  const [services, setServices] = useState<Service[]>([]);
  const [availabilitySlots, setAvailabilitySlots] = useState<ProviderAvailability[]>([]);
  const [providerCount, setProviderCount] = useState(0);

  const [serviceType, setServiceType] = useState<ServiceType | "">("");
  const [cityScope, setCityScope] = useState<CityScope | "">("");
  const [language, setLanguage] = useState("");
  const [maxPrice, setMaxPrice] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const viewer = useMemo(() => getStoredUser(), []);

  async function loadMarketplace() {
    setLoading(true);
    setError(null);

    try {
      const parsedMaxPrice = Number.parseFloat(maxPrice);
      const today = new Date();
      const dateFrom = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const [servicesResponse, providersResponse, availabilityResponse] = await Promise.all([
        listServices({
          service_type: serviceType || undefined,
          city_scope: cityScope || undefined,
          language: language || undefined,
          max_price: Number.isNaN(parsedMaxPrice) ? undefined : parsedMaxPrice
        }),
        listProviders({
          language: language || undefined,
          service_type: serviceType || undefined
        }),
        listAvailability({
          service_type: serviceType || undefined,
          city_scope: cityScope || undefined,
          language: language || undefined,
          available: 1,
          date_from: dateFrom
        })
      ]);

      setServices(servicesResponse.results);
      setProviderCount(providersResponse.count);
      setAvailabilitySlots(availabilityResponse.results);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMarketplace();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function getServiceSlotCount(service: Service) {
    return availabilitySlots.filter(
      (slot) => slot.provider === service.provider && slot.service_type === service.service_type && slot.is_available
    ).length;
  }

  return (
    <div className="app-shell">
      <AppTopNav
        links={[
          { href: "/", label: "Home" },
          { href: "/signin", label: "Sign In" },
          { href: "/dashboard", label: "Dashboard" },
          { href: "/bookings", label: "Bookings" }
        ]}
      />

      <main className="container page-container">
        <section className="panel">
          <h1 className="page-title">{t("Marketplace", "السوق")}</h1>
          <p className="page-sub">
            {t("Browse verified providers, compare USD prices, language coverage, and ratings before booking.", "تصفح المزودين المعتمدين وقارن الأسعار بالدولار واللغات والتقييمات قبل الحجز.")}
          </p>

          <div className="kpi-grid">
            <article>
              <strong>{providerCount}</strong>
              <span>{t("Verified Providers", "مزودون معتمدون")}</span>
            </article>
            <article>
              <strong>{services.length}</strong>
              <span>{t("Active Services", "خدمات نشطة")}</span>
            </article>
            <article>
              <strong>USD</strong>
              <span>{t("Unified Pricing", "تسعير موحد")}</span>
            </article>
          </div>

          <form
            className="filter-grid"
            onSubmit={(event) => {
              event.preventDefault();
              void loadMarketplace();
            }}
          >
            <label className="field">
              {t("Service Type", "نوع الخدمة")}
              <select className="select" value={serviceType} onChange={(event) => setServiceType(event.target.value as ServiceType | "")}> 
                <option value="">{t("All", "الكل")}</option>
                {SERVICE_TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {pretty(option)}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              {t("City Scope", "نطاق المدينة")}
              <select className="select" value={cityScope} onChange={(event) => setCityScope(event.target.value as CityScope | "")}> 
                <option value="">{t("All", "الكل")}</option>
                {CITY_SCOPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {pretty(option)}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              {t("Language", "اللغة")}
              <input className="input" value={language} onChange={(event) => setLanguage(event.target.value)} placeholder={t("Arabic", "العربية")} />
            </label>

            <label className="field">
              {t("Max Price (USD)", "أقصى سعر (USD)")}
              <input
                className="input"
                value={maxPrice}
                onChange={(event) => setMaxPrice(event.target.value)}
                inputMode="decimal"
                placeholder="500"
              />
            </label>

            <button className="btn btn-primary" type="submit">
              {t("Apply Filters", "تطبيق الفلاتر")}
            </button>
          </form>

          <p className="page-sub mini">{t("Viewer", "المستخدم")}: {viewer ? `${viewer.username} (${viewer.role})` : t("Guest", "زائر")}</p>
        </section>

        {loading ? <section className="panel">{t("Loading services...", "جاري تحميل الخدمات...")}</section> : null}
        {error ? <p className="notice error">{error}</p> : null}

        {!loading && !error ? (
          <section className="cards-grid services-grid">
            {services.length === 0 ? (
              <article className="panel">{t("No services match your current filters.", "لا توجد خدمات تطابق الفلاتر الحالية.")}</article>
            ) : (
              services.map((service) => (
                <article key={service.id} className="panel service-card">
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

                  <p className="eyebrow">{pretty(service.service_type)}</p>
                  <h2 className="section-title">{service.title}</h2>
                  <p className="page-sub mini">{service.description}</p>

                  <div className="meta-row">
                    <span>{t("Rating", "التقييم")}: {service.provider_rating}</span>
                    <span>{t("City", "المدينة")}: {pretty(service.city_scope)}</span>
                  </div>

                  <div className="meta-row">
                    <span>{t("Languages", "اللغات")}: {service.languages.join(", ") || t("Any", "أي لغة")}</span>
                    <span>
                      {t("Price", "السعر")}: {service.price_amount} {service.currency}
                    </span>
                    <span>{t("Available Slots", "المواعيد المتاحة")}: {getServiceSlotCount(service)}</span>
                  </div>

                  <div className="card-actions">
                    <Link href={`/providers/${service.provider}`} className="inline-link">
                      {t("View Provider", "عرض المزود")}
                    </Link>

                    {viewer?.role === "PROVIDER" ? (
                      <span className="inline-note">{t("Customer accounts can book services.", "حسابات العملاء فقط يمكنها حجز الخدمات.")}</span>
                    ) : (
                      <Link
                        href={viewer ? `/bookings/new?service=${service.id}` : "/signin"}
                        className="btn btn-primary"
                      >
                        {viewer ? t("Book Service", "احجز الخدمة") : t("Sign In to Book", "سجّل الدخول للحجز")}
                      </Link>
                    )}
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
