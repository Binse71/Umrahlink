"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import AppTopNav from "@/components/AppTopNav";
import { useLanguage } from "@/components/LanguageProvider";
import {
  ProviderAvailability,
  ProviderProfile,
  Review,
  Service,
  getErrorMessage,
  getMe,
  getProvider,
  listAvailability,
  listReviews,
  listServices,
  logout
} from "@/lib/api";
import { clearAuth, getAuthToken, getStoredUser, setStoredUser } from "@/lib/auth-client";
import { withLocale } from "@/lib/i18n";

function pretty(value: string) {
  return value.replaceAll("_", " ");
}

export default function ProviderDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { locale } = useLanguage();
  const t = (enText: string, arText: string) => withLocale(locale, enText, arText);
  const providerId = useMemo(() => Number.parseInt(params.id ?? "", 10), [params.id]);

  const [provider, setProvider] = useState<ProviderProfile | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [availabilitySlots, setAvailabilitySlots] = useState<ProviderAvailability[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const viewer = useMemo(() => getStoredUser(), []);

  useEffect(() => {
    let mounted = true;

    async function loadProvider() {
      setLoading(true);
      setError(null);

      try {
        if (Number.isNaN(providerId)) {
          throw new Error(withLocale(locale, "Invalid provider id.", "معرّف المزود غير صالح."));
        }

        const token = getAuthToken();
        if (token) {
          try {
            const me = await getMe(token);
            setStoredUser(me);
          } catch {}
        }

        const today = new Date();
        const dateFrom = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        const [providerResponse, servicesResponse, reviewsResponse, availabilityResponse] = await Promise.all([
          getProvider(providerId),
          listServices({ provider: providerId }),
          listReviews({ provider: providerId }),
          listAvailability({ provider: providerId, available: 1, date_from: dateFrom })
        ]);

        if (!mounted) {
          return;
        }

        setProvider(providerResponse);
        setServices(servicesResponse.results);
        setReviews(reviewsResponse.results);
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

    void loadProvider();
    return () => {
      mounted = false;
    };
  }, [locale, providerId]);

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
          { href: "/dashboard", label: "Dashboard" },
          { href: "/notifications", label: "Notifications" }
        ]}
        actions={
          viewer ? (
            <button className="btn btn-ghost" onClick={handleSignOut}>
              {t("Sign Out", "تسجيل الخروج")}
            </button>
          ) : (
            <Link className="btn btn-primary" href="/signin">
              {t("Sign In", "تسجيل الدخول")}
            </Link>
          )
        }
      />

      <main className="container page-container">
        {loading ? <section className="panel">{t("Loading provider...", "جاري تحميل المزود...")}</section> : null}
        {error ? <p className="notice error">{error}</p> : null}

        {!loading && !error && provider ? (
          <>
            <section className="panel provider-hero">
              <div>
                {provider.profile_photo_url ? (
                  <img
                    src={provider.profile_photo_url}
                    alt={provider.professional_name}
                    className="provider-photo-xl"
                  />
                ) : (
                  <div className="provider-photo-fallback provider-photo-xl">
                    {(provider.professional_name || "P").slice(0, 1).toUpperCase()}
                  </div>
                )}

                <p className="eyebrow">{t("Verified Provider", "مزود معتمد")}</p>
                <h1 className="page-title">{provider.professional_name}</h1>
                <p className="page-sub">{provider.bio || t("No bio added yet.", "لا توجد نبذة بعد.")}</p>

                <div className="meta-row">
                  <span>{t("City", "المدينة")}: {provider.city || t("Saudi Arabia", "السعودية")}</span>
                  <span>{t("Rating", "التقييم")}: {provider.rating_average}</span>
                  <span>{t("Reviews", "التقييمات")}: {provider.total_reviews}</span>
                  <span>{t("Experience", "الخبرة")}: {provider.years_experience} {t("years", "سنوات")}</span>
                </div>

                <div className="chip-wrap">
                  {provider.languages.map((language) => (
                    <span key={language} className="chip">
                      {language}
                    </span>
                  ))}
                </div>
              </div>

              <div className="summary-card">
                <h3 className="section-title">{t("Profile Trust", "موثوقية الملف")}</h3>
                <p className="page-sub mini">{t("Verification", "الاعتماد")}: {provider.verification_status}</p>
                <p className="page-sub mini">{t("Accepting bookings", "استقبال الحجوزات")}: {provider.is_accepting_bookings ? t("Yes", "نعم") : t("No", "لا")}</p>
                <p className="page-sub mini">{t("Live services", "الخدمات المتاحة")}: {provider.services_count}</p>
                <Link href="/marketplace" className="btn btn-outline">
                  {t("Back to Marketplace", "العودة إلى السوق")}
                </Link>
              </div>
            </section>

            <section className="panel">
              <h2 className="section-title">{t("Availability", "التوفر")}</h2>
              {availabilitySlots.length === 0 ? (
                <p className="page-sub">{t("No public slots published yet.", "لا توجد مواعيد متاحة منشورة حتى الآن.")}</p>
              ) : (
                <div className="cards-grid">
                  {availabilitySlots.slice(0, 8).map((slot) => (
                    <article key={slot.id} className="panel compact-card">
                      <p className="eyebrow">{pretty(slot.service_type)} • {pretty(slot.city_scope)}</p>
                      <p className="page-sub mini">{new Date(slot.start_at).toLocaleString()} - {new Date(slot.end_at).toLocaleString()}</p>
                      <p className="page-sub mini">{t("Languages", "اللغات")}: {slot.languages.join(", ") || t("Any", "أي لغة")}</p>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="panel">
              <h2 className="section-title">{t("Services", "الخدمات")}</h2>
              {services.length === 0 ? (
                <p className="page-sub">{t("No active services listed yet.", "لا توجد خدمات نشطة حتى الآن.")}</p>
              ) : (
                <div className="cards-grid services-grid">
                  {services.map((service) => (
                    <article key={service.id} className="panel service-card compact-card">
                      <p className="eyebrow">{pretty(service.service_type)}</p>
                      <h3 className="section-title">{service.title}</h3>
                      <p className="page-sub mini">{service.description}</p>

                      <div className="meta-row">
                        <span>{t("City", "المدينة")}: {pretty(service.city_scope)}</span>
                        <span>
                          {t("Price", "السعر")}: {service.price_amount} {service.currency}
                        </span>
                      </div>

                      <div className="meta-row">
                        <span>{t("Languages", "اللغات")}: {service.languages.join(", ") || t("Any", "أي لغة")}</span>
                      </div>

                      <div className="card-actions">
                        {viewer?.role === "PROVIDER" ? (
                          <span className="inline-note">{t("Customers can place bookings.", "العملاء فقط يمكنهم إجراء الحجوزات.")}</span>
                        ) : (
                          <Link href={viewer ? `/bookings/new?service=${service.id}` : "/signin"} className="btn btn-primary">
                            {viewer ? t("Book This Service", "احجز هذه الخدمة") : t("Sign In to Book", "سجّل الدخول للحجز")}
                          </Link>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="panel">
              <h2 className="section-title">{t("Recent Reviews", "أحدث التقييمات")}</h2>
              {reviews.length === 0 ? (
                <p className="page-sub">{t("No reviews yet.", "لا توجد تقييمات بعد.")}</p>
              ) : (
                <div className="review-list">
                  {reviews.slice(0, 8).map((review) => (
                    <article key={review.id} className="review-card">
                      <p className="rating-stars">{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</p>
                      <p className="page-sub mini">{review.comment || t("No comment provided.", "لا يوجد تعليق.")}</p>
                      <p className="page-sub mini">{t("By", "بواسطة")} {review.customer_name || t("Customer", "عميل")}</p>
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
