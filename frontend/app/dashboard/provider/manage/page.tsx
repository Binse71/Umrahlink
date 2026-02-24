"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import AppTopNav from "@/components/AppTopNav";
import { useLanguage } from "@/components/LanguageProvider";
import {
  AdminProviderProfile,
  CityScope,
  ProviderAvailability,
  Service,
  ServiceType,
  createAvailability,
  createService,
  deleteAvailability,
  deleteService,
  getErrorMessage,
  getMe,
  getMyProviderProfile,
  listAvailability,
  listServices,
  logout,
  updateAvailability,
  updateMyProviderProfile,
  updateService
} from "@/lib/api";
import { clearAuth, getAuthToken, setStoredUser } from "@/lib/auth-client";
import { withLocale } from "@/lib/i18n";
import { INTERNATIONAL_LANGUAGES } from "@/lib/languages";

const SERVICE_TYPE_OPTIONS: ServiceType[] = ["UMRAH_BADAL", "ZIYARAH_GUIDE", "UMRAH_ASSISTANT"];
const CITY_SCOPE_OPTIONS: CityScope[] = ["MAKKAH", "MADINAH"];
const PROVIDER_LOCATION_OPTIONS = ["Makkah", "Madinah"] as const;
type ProviderLocation = (typeof PROVIDER_LOCATION_OPTIONS)[number];
type ProviderBioOption = "GUIDED_SUPPORT" | "FAMILY_SUPPORT" | "RELIABLE_SERVICE" | "PLATFORM_UPDATES";
type ProviderCredentialOption =
  | "UMRAH_BADAL_SUPPORT"
  | "ZIYARAH_GUIDE_SUPPORT"
  | "ELDERLY_FAMILY_SUPPORT"
  | "MULTILINGUAL_ASSISTANCE"
  | "ON_TIME_UPDATES";

const PROVIDER_BIO_CHOICES: ReadonlyArray<{ key: ProviderBioOption; text: string; en: string; ar: string }> = [
  {
    key: "GUIDED_SUPPORT",
    text: "Guided step-by-step Umrah support.",
    en: "Guided step-by-step Umrah support",
    ar: "دعم العمرة خطوة بخطوة",
  },
  {
    key: "FAMILY_SUPPORT",
    text: "Comfortable assisting families and elderly pilgrims.",
    en: "Comfortable assisting families and elderly pilgrims",
    ar: "القدرة على مساعدة العائلات وكبار السن",
  },
  {
    key: "RELIABLE_SERVICE",
    text: "Committed to respectful and reliable service.",
    en: "Committed to respectful and reliable service",
    ar: "ملتزم بخدمة موثوقة ومحترمة",
  },
  {
    key: "PLATFORM_UPDATES",
    text: "Provides clear updates through Umrah Link.",
    en: "Provides clear updates through Umrah Link",
    ar: "يقدم تحديثات واضحة عبر عمرة لينك",
  },
];

const PROVIDER_CREDENTIAL_CHOICES: ReadonlyArray<{ key: ProviderCredentialOption; en: string; ar: string }> = [
  {
    key: "UMRAH_BADAL_SUPPORT",
    en: "Umrah Badal support",
    ar: "دعم عمرة البدل",
  },
  {
    key: "ZIYARAH_GUIDE_SUPPORT",
    en: "Ziyarah guide support",
    ar: "دعم الإرشاد في الزيارة",
  },
  {
    key: "ELDERLY_FAMILY_SUPPORT",
    en: "Elderly and family support",
    ar: "دعم كبار السن والعائلات",
  },
  {
    key: "MULTILINGUAL_ASSISTANCE",
    en: "Multilingual assistance",
    ar: "مساندة بعدة لغات",
  },
  {
    key: "ON_TIME_UPDATES",
    en: "On-time status updates",
    ar: "تحديثات منتظمة في الوقت المناسب",
  },
];

function pretty(value: string) {
  return value.replaceAll("_", " ");
}

function resolveProviderLocation(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "madinah" || normalized === "madina" || normalized === "medina") {
    return "Madinah" as ProviderLocation;
  }
  return "Makkah" as ProviderLocation;
}

function buildProviderBio(selectedOptions: ProviderBioOption[]) {
  return PROVIDER_BIO_CHOICES
    .filter((option) => selectedOptions.includes(option.key))
    .map((option) => option.text)
    .join("\n");
}

function parseBioSelections(value: string) {
  return PROVIDER_BIO_CHOICES
    .filter((option) => value.includes(option.text))
    .map((option) => option.key);
}

function parseCredentialSelections(value: string) {
  const allowed = new Set(PROVIDER_CREDENTIAL_CHOICES.map((option) => option.key));
  const values = value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => allowed.has(item as ProviderCredentialOption)) as ProviderCredentialOption[];
  return Array.from(new Set(values));
}

export default function ProviderManagePage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const t = (enText: string, arText: string) => withLocale(locale, enText, arText);

  const [profile, setProfile] = useState<AdminProviderProfile | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [availabilitySlots, setAvailabilitySlots] = useState<ProviderAvailability[]>([]);
  const [servicePrices, setServicePrices] = useState<Record<number, string>>({});

  const [professionalName, setProfessionalName] = useState("");
  const [serviceLocation, setServiceLocation] = useState<ProviderLocation>("Makkah");
  const [bioOptions, setBioOptions] = useState<ProviderBioOption[]>([]);
  const [yearsExperience, setYearsExperience] = useState("0");
  const [credentialOptions, setCredentialOptions] = useState<ProviderCredentialOption[]>([]);
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null);
  const [removeProfilePhoto, setRemoveProfilePhoto] = useState(false);
  const [acceptingBookings, setAcceptingBookings] = useState(false);
  const [supportedLanguages, setSupportedLanguages] = useState<string[]>([]);

  const [serviceType, setServiceType] = useState<ServiceType>("UMRAH_BADAL");
  const [serviceTitle, setServiceTitle] = useState("");
  const [serviceDescription, setServiceDescription] = useState("");
  const [serviceCityScope, setServiceCityScope] = useState<CityScope>("MAKKAH");
  const [serviceLanguages, setServiceLanguages] = useState<string[]>([]);
  const [servicePrice, setServicePrice] = useState("250");

  const [slotServiceType, setSlotServiceType] = useState<ServiceType>("UMRAH_BADAL");
  const [slotCityScope, setSlotCityScope] = useState<CityScope>("MAKKAH");
  const [slotLanguages, setSlotLanguages] = useState<string[]>([]);
  const [slotStartAt, setSlotStartAt] = useState("");
  const [slotEndAt, setSlotEndAt] = useState("");

  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingService, setSavingService] = useState(false);
  const [savingSlot, setSavingSlot] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggleSelection<T extends string>(list: T[], setList: (next: T[]) => void, value: T, checked: boolean) {
    if (checked) {
      if (list.includes(value)) {
        return;
      }
      setList([...list, value]);
      return;
    }
    setList(list.filter((item) => item !== value));
  }

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const token = getAuthToken();
      if (!token) {
        router.replace("/signin");
        return;
      }

      const [me, profileResponse, serviceResponse, availabilityResponse] = await Promise.all([
        getMe(token),
        getMyProviderProfile(token),
        listServices({ mine: 1 }, token),
        listAvailability({ mine: 1 }, token)
      ]);

      if (me.role !== "PROVIDER") {
        router.replace("/dashboard");
        return;
      }

      setStoredUser(me);
      setProfile(profileResponse);
      setServices(serviceResponse.results);
      setAvailabilitySlots(availabilityResponse.results);

      setProfessionalName(profileResponse.professional_name || "");
      setServiceLocation(resolveProviderLocation(profileResponse.base_locations[0] || profileResponse.city || "Makkah"));
      setBioOptions(parseBioSelections(profileResponse.bio || ""));
      setYearsExperience(String(profileResponse.years_experience ?? 0));
      setCredentialOptions(parseCredentialSelections(profileResponse.credentials_summary || ""));
      setAcceptingBookings(profileResponse.is_accepting_bookings);
      setSupportedLanguages(profileResponse.supported_languages || []);
      setProfilePhotoFile(null);
      setRemoveProfilePhoto(false);

      setServicePrices(
        Object.fromEntries(serviceResponse.results.map((serviceItem) => [serviceItem.id, String(serviceItem.price_amount)]))
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
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

  async function handleSaveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingProfile(true);
    setError(null);
    setMessage(null);

    try {
      const token = getAuthToken();
      if (!token) {
        throw new Error(t("Please sign in first.", "يرجى تسجيل الدخول أولاً."));
      }
      if (bioOptions.length === 0) {
        throw new Error(t("Select at least one bio option.", "اختر خياراً واحداً على الأقل للنبذة."));
      }
      if (credentialOptions.length === 0) {
        throw new Error(t("Select at least one credential option.", "اختر خياراً واحداً على الأقل للمؤهلات."));
      }
      const parsedYears = Number.parseInt(yearsExperience, 10);
      const updated = await updateMyProviderProfile(token, {
        professional_name: professionalName,
        bio: buildProviderBio(bioOptions),
        city: serviceLocation,
        base_locations: [serviceLocation],
        supported_languages: supportedLanguages,
        years_experience: Number.isNaN(parsedYears) ? 0 : parsedYears,
        credentials_summary: credentialOptions.join(","),
        is_accepting_bookings: acceptingBookings,
        profile_photo: profilePhotoFile,
        remove_profile_photo: removeProfilePhoto || undefined
      });
      setProfile(updated);
      setProfilePhotoFile(null);
      setRemoveProfilePhoto(false);
      setMessage(t("Profile updated successfully.", "تم تحديث الملف بنجاح."));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleCreateService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingService(true);
    setError(null);
    setMessage(null);

    try {
      const token = getAuthToken();
      if (!token) {
        throw new Error(t("Please sign in first.", "يرجى تسجيل الدخول أولاً."));
      }
      const parsedPrice = Number.parseFloat(servicePrice);
      if (Number.isNaN(parsedPrice) || parsedPrice <= 0) {
        throw new Error(t("Enter a valid USD price.", "أدخل سعراً صحيحاً بالدولار الأمريكي."));
      }

      await createService(token, {
        service_type: serviceType,
        title: serviceTitle,
        description: serviceDescription,
        city_scope: serviceCityScope,
        languages: serviceLanguages,
        price_amount: parsedPrice,
        currency: "USD",
        is_active: true
      });

      setServiceTitle("");
      setServiceDescription("");
      setServicePrice("250");
      setServiceLanguages([]);
      setMessage(t("Service created.", "تم إنشاء الخدمة."));
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSavingService(false);
    }
  }

  async function handleUpdateServicePrice(serviceId: number) {
    setActionLoading(`service-price-${serviceId}`);
    setError(null);
    setMessage(null);

    try {
      const token = getAuthToken();
      if (!token) {
        throw new Error(t("Please sign in first.", "يرجى تسجيل الدخول أولاً."));
      }
      const parsedPrice = Number.parseFloat(servicePrices[serviceId] ?? "");
      if (Number.isNaN(parsedPrice) || parsedPrice <= 0) {
        throw new Error(t("Enter a valid USD price.", "أدخل سعراً صحيحاً بالدولار الأمريكي."));
      }
      await updateService(token, serviceId, { price_amount: parsedPrice, currency: "USD" });
      setMessage(t("Service price updated.", "تم تحديث سعر الخدمة."));
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleToggleService(service: Service) {
    setActionLoading(`service-toggle-${service.id}`);
    setError(null);
    setMessage(null);

    try {
      const token = getAuthToken();
      if (!token) {
        throw new Error(t("Please sign in first.", "يرجى تسجيل الدخول أولاً."));
      }
      await updateService(token, service.id, { is_active: !service.is_active });
      setMessage(service.is_active ? t("Service deactivated.", "تم إيقاف الخدمة.") : t("Service activated.", "تم تفعيل الخدمة."));
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDeleteService(serviceId: number) {
    if (!window.confirm(t("Delete this service permanently?", "حذف هذه الخدمة نهائياً؟"))) {
      return;
    }
    setActionLoading(`service-delete-${serviceId}`);
    setError(null);
    setMessage(null);

    try {
      const token = getAuthToken();
      if (!token) {
        throw new Error(t("Please sign in first.", "يرجى تسجيل الدخول أولاً."));
      }
      await deleteService(token, serviceId);
      setMessage(t("Service deleted.", "تم حذف الخدمة."));
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCreateSlot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingSlot(true);
    setError(null);
    setMessage(null);

    try {
      const token = getAuthToken();
      if (!token) {
        throw new Error(t("Please sign in first.", "يرجى تسجيل الدخول أولاً."));
      }
      if (!slotStartAt || !slotEndAt) {
        throw new Error(t("Select start and end times.", "اختر وقت البداية والنهاية."));
      }

      await createAvailability(token, {
        service_type: slotServiceType,
        city_scope: slotCityScope,
        languages: slotLanguages,
        start_at: new Date(slotStartAt).toISOString(),
        end_at: new Date(slotEndAt).toISOString(),
        is_available: true
      });

      setSlotStartAt("");
      setSlotEndAt("");
      setSlotLanguages([]);
      setMessage(t("Availability slot created.", "تم إنشاء موعد التوفر."));
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSavingSlot(false);
    }
  }

  async function handleToggleSlot(slot: ProviderAvailability) {
    setActionLoading(`slot-toggle-${slot.id}`);
    setError(null);
    setMessage(null);

    try {
      const token = getAuthToken();
      if (!token) {
        throw new Error(t("Please sign in first.", "يرجى تسجيل الدخول أولاً."));
      }
      await updateAvailability(token, slot.id, { is_available: !slot.is_available });
      setMessage(slot.is_available ? t("Slot marked unavailable.", "تم وضع الموعد كغير متاح.") : t("Slot marked available.", "تم وضع الموعد كمتاح."));
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDeleteSlot(slotId: number) {
    if (!window.confirm(t("Delete this slot?", "حذف هذا الموعد؟"))) {
      return;
    }
    setActionLoading(`slot-delete-${slotId}`);
    setError(null);
    setMessage(null);

    try {
      const token = getAuthToken();
      if (!token) {
        throw new Error(t("Please sign in first.", "يرجى تسجيل الدخول أولاً."));
      }
      await deleteAvailability(token, slotId);
      setMessage(t("Slot deleted.", "تم حذف الموعد."));
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="app-shell">
      <AppTopNav
        links={[
          { href: "/", label: "Home" },
          { href: "/dashboard/provider", label: "Dashboard" },
          { href: "/bookings", label: "Bookings" },
          { href: "/notifications", label: "Notifications" }
        ]}
        actions={
          <button className="btn btn-ghost" onClick={handleSignOut}>
            {t("Sign Out", "تسجيل الخروج")}
          </button>
        }
      />

      <main className="container page-container provider-flow provider-manage">
        <section className="panel provider-hero-panel fade-up" style={{ animationDelay: "0.08s" }}>
          <div className="provider-hero-grid">
            <div>
              <p className="eyebrow">{t("Provider Studio", "استوديو المزود")}</p>
              <h1 className="page-title">{t("Provider Management", "إدارة حساب المزود")}</h1>
              <p className="page-sub">{t("Manage your profile, services, pricing, and availability slots.", "أدر ملفك الشخصي وخدماتك وأسعارك ومواعيد التوفر.")}</p>
              <div className="quick-links provider-hero-actions">
                <Link href="/dashboard/provider" className="btn btn-outline">{t("Back to Provider Dashboard", "العودة إلى لوحة المزود")}</Link>
              </div>
            </div>
            <aside className="provider-focus-card">
              <p className="eyebrow">{t("Profile Snapshot", "ملخص الملف")}</p>
              <h3 className="section-title">{t("Account health at a glance", "حالة الحساب بنظرة سريعة")}</h3>
              {profile ? (
                <div className="provider-focus-list">
                  <article>
                    <strong>{profile.verification_status}</strong>
                    <span>{t("Verification", "الاعتماد")}</span>
                  </article>
                  <article>
                    <strong>{profile.rating_average}</strong>
                    <span>{t("Rating", "التقييم")}</span>
                  </article>
                  <article>
                    <strong>{profile.total_reviews}</strong>
                    <span>{t("Reviews", "التقييمات")}</span>
                  </article>
                </div>
              ) : (
                <p className="page-sub mini">{t("Load your profile metrics.", "حمّل مؤشرات ملفك الشخصي.")}</p>
              )}
            </aside>
          </div>
        </section>

        {loading ? <section className="panel">{t("Loading provider data...", "جاري تحميل بيانات المزود...")}</section> : null}
        {message ? <p className="notice success">{message}</p> : null}
        {error ? <p className="notice error">{error}</p> : null}

        {!loading ? (
          <>
            <section className="panel provider-section-card fade-up" style={{ animationDelay: "0.16s" }}>
              <h2 className="section-title">{t("Profile Settings", "إعدادات الملف الشخصي")}</h2>
              <form className="form-grid provider-form" onSubmit={handleSaveProfile}>
                <div className="provider-photo-editor provider-photo-editor-premium">
                  {profile?.profile_photo_url && !removeProfilePhoto ? (
                    <img
                      src={profile.profile_photo_url}
                      alt={t("Provider profile photo", "صورة المزود الشخصية")}
                      className="provider-photo-lg"
                    />
                  ) : (
                    <div className="provider-photo-fallback provider-photo-lg">
                      {t("No photo", "لا توجد صورة")}
                    </div>
                  )}

                  <label className="field">
                    {t("Update Profile Photo", "تحديث الصورة الشخصية")}
                    <input
                      className="input"
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        setProfilePhotoFile(event.target.files?.[0] ?? null);
                        if (event.target.files?.[0]) {
                          setRemoveProfilePhoto(false);
                        }
                      }}
                    />
                  </label>

                  <label className="check-item">
                    <input
                      type="checkbox"
                      checked={removeProfilePhoto}
                      onChange={(event) => {
                        setRemoveProfilePhoto(event.target.checked);
                        if (event.target.checked) {
                          setProfilePhotoFile(null);
                        }
                      }}
                    />
                    <span>{t("Remove current photo", "إزالة الصورة الحالية")}</span>
                  </label>
                </div>

                <div className="field-grid provider-tight-grid">
                  <label className="field">
                    {t("Professional Name", "الاسم المهني")}
                    <input className="input" value={professionalName} onChange={(event) => setProfessionalName(event.target.value)} required />
                  </label>
                  <label className="field">
                    {t("Service Location", "موقع الخدمة")}
                    <select
                      className="select"
                      value={serviceLocation}
                      onChange={(event) => setServiceLocation(event.target.value as ProviderLocation)}
                    >
                      {PROVIDER_LOCATION_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    {t("Years of Experience", "سنوات الخبرة")}
                    <input className="input" value={yearsExperience} onChange={(event) => setYearsExperience(event.target.value)} inputMode="numeric" />
                  </label>
                </div>

                <div className="field provider-check-section">
                  {t("Bio Options (no free text)", "خيارات النبذة (بدون كتابة حرة)")}
                  <div className="language-check-grid">
                    {PROVIDER_BIO_CHOICES.map((option) => (
                      <label key={option.key} className="check-item">
                        <input
                          type="checkbox"
                          checked={bioOptions.includes(option.key)}
                          onChange={(event) => toggleSelection(bioOptions, setBioOptions, option.key, event.target.checked)}
                        />
                        <span>{locale === "ar" ? option.ar : option.en}</span>
                      </label>
                    ))}
                  </div>
                  <p className="page-sub mini">{t("Numbers and private-contact wording are blocked.", "يتم منع الأرقام وعبارات التواصل الخاص.")}</p>
                </div>

                <div className="field provider-check-section">
                  {t("Credential Checklist (select only)", "قائمة المؤهلات (اختيارات فقط)")}
                  <div className="language-check-grid">
                    {PROVIDER_CREDENTIAL_CHOICES.map((option) => (
                      <label key={option.key} className="check-item">
                        <input
                          type="checkbox"
                          checked={credentialOptions.includes(option.key)}
                          onChange={(event) => toggleSelection(credentialOptions, setCredentialOptions, option.key, event.target.checked)}
                        />
                        <span>{locale === "ar" ? option.ar : option.en}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="field provider-check-section">
                  {t("Supported Languages", "اللغات المدعومة")}
                  <div className="language-check-grid">
                    {INTERNATIONAL_LANGUAGES.map((languageOption) => (
                      <label key={languageOption.value} className="check-item">
                        <input
                          type="checkbox"
                          checked={supportedLanguages.includes(languageOption.value)}
                          onChange={(event) => toggleSelection(supportedLanguages, setSupportedLanguages, languageOption.value, event.target.checked)}
                        />
                        <span>{locale === "ar" ? languageOption.ar : languageOption.en}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <label className="check-item">
                  <input type="checkbox" checked={acceptingBookings} onChange={(event) => setAcceptingBookings(event.target.checked)} />
                  <span>{t("Accept new bookings", "استقبال حجوزات جديدة")}</span>
                </label>

                <button className="btn btn-primary" type="submit" disabled={savingProfile}>
                  {savingProfile ? t("Saving...", "جارٍ الحفظ...") : t("Save Profile", "حفظ الملف")}
                </button>
              </form>
            </section>

            <section className="panel provider-section-card fade-up" style={{ animationDelay: "0.24s" }}>
              <div className="section-head-inline">
                <h2 className="section-title">{t("Service Listings", "الخدمات المنشورة")}</h2>
                <p className="page-sub mini">{t("Publish and price offers customers can book instantly.", "انشر عروضك وحدد أسعارها ليتمكن العملاء من الحجز فوراً.")}</p>
              </div>
              <form className="form-grid provider-form" onSubmit={handleCreateService}>
                <div className="field-grid">
                  <label className="field">
                    {t("Service Type", "نوع الخدمة")}
                    <select className="select" value={serviceType} onChange={(event) => setServiceType(event.target.value as ServiceType)}>
                      {SERVICE_TYPE_OPTIONS.map((option) => (
                        <option key={option} value={option}>{pretty(option)}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    {t("City Scope", "نطاق المدينة")}
                    <select className="select" value={serviceCityScope} onChange={(event) => setServiceCityScope(event.target.value as CityScope)}>
                      {CITY_SCOPE_OPTIONS.map((option) => (
                        <option key={option} value={option}>{pretty(option)}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    {t("Service Title", "عنوان الخدمة")}
                    <input className="input" value={serviceTitle} onChange={(event) => setServiceTitle(event.target.value)} required />
                  </label>
                  <label className="field">
                    {t("Price (USD)", "السعر (USD)")}
                    <input className="input" value={servicePrice} onChange={(event) => setServicePrice(event.target.value)} inputMode="decimal" required />
                  </label>
                </div>

                <label className="field">
                  {t("Description", "الوصف")}
                  <textarea className="textarea" rows={3} value={serviceDescription} onChange={(event) => setServiceDescription(event.target.value)} required />
                </label>

                <div className="field">
                  {t("Service Languages", "لغات الخدمة")}
                  <div className="language-check-grid">
                    {INTERNATIONAL_LANGUAGES.map((languageOption) => (
                      <label key={languageOption.value} className="check-item">
                        <input
                          type="checkbox"
                          checked={serviceLanguages.includes(languageOption.value)}
                          onChange={(event) => toggleSelection(serviceLanguages, setServiceLanguages, languageOption.value, event.target.checked)}
                        />
                        <span>{locale === "ar" ? languageOption.ar : languageOption.en}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <button className="btn btn-primary" type="submit" disabled={savingService}>
                  {savingService ? t("Creating...", "جارٍ الإنشاء...") : t("Create Service", "إنشاء الخدمة")}
                </button>
              </form>

              <div className="cards-grid services-grid provider-services-grid">
                {services.length === 0 ? (
                  <article className="panel compact-card">{t("No services yet.", "لا توجد خدمات بعد.")}</article>
                ) : (
                  services.map((service) => (
                    <article key={service.id} className="panel compact-card provider-service-card">
                      <h3 className="section-title">{service.title}</h3>
                      <p className="page-sub mini">{pretty(service.service_type)} • {pretty(service.city_scope)}</p>
                      <div className="meta-row">
                        <span className={`status-pill ${service.is_active ? "status-accepted" : "status-unpaid"}`}>
                          {service.is_active ? t("Active", "نشطة") : t("Inactive", "غير نشطة")}
                        </span>
                      </div>
                      <label className="field">
                        {t("Price (USD)", "السعر (USD)")}
                        <input
                          className="input"
                          value={servicePrices[service.id] ?? ""}
                          onChange={(event) => setServicePrices((previous) => ({ ...previous, [service.id]: event.target.value }))}
                          inputMode="decimal"
                        />
                      </label>
                      <div className="card-actions">
                        <button className="btn btn-outline" onClick={() => void handleUpdateServicePrice(service.id)} disabled={actionLoading === `service-price-${service.id}`}>
                          {t("Update Price", "تحديث السعر")}
                        </button>
                        <button className="btn btn-ghost" onClick={() => void handleToggleService(service)} disabled={actionLoading === `service-toggle-${service.id}`}>
                          {service.is_active ? t("Deactivate", "إيقاف") : t("Activate", "تفعيل")}
                        </button>
                        <button className="btn btn-ghost" onClick={() => void handleDeleteService(service.id)} disabled={actionLoading === `service-delete-${service.id}`}>
                          {t("Delete", "حذف")}
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>

            <section className="panel provider-section-card fade-up" style={{ animationDelay: "0.32s" }}>
              <div className="section-head-inline">
                <h2 className="section-title">{t("Availability Slots", "مواعيد التوفر")}</h2>
                <p className="page-sub mini">{t("Keep upcoming slots visible to increase booking speed.", "حافظ على إظهار المواعيد القادمة لزيادة سرعة الحجز.")}</p>
              </div>
              <form className="form-grid provider-form" onSubmit={handleCreateSlot}>
                <div className="field-grid">
                  <label className="field">
                    {t("Service Type", "نوع الخدمة")}
                    <select className="select" value={slotServiceType} onChange={(event) => setSlotServiceType(event.target.value as ServiceType)}>
                      {SERVICE_TYPE_OPTIONS.map((option) => (
                        <option key={option} value={option}>{pretty(option)}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    {t("City Scope", "نطاق المدينة")}
                    <select className="select" value={slotCityScope} onChange={(event) => setSlotCityScope(event.target.value as CityScope)}>
                      {CITY_SCOPE_OPTIONS.map((option) => (
                        <option key={option} value={option}>{pretty(option)}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    {t("Start", "البداية")}
                    <input className="input" type="datetime-local" value={slotStartAt} onChange={(event) => setSlotStartAt(event.target.value)} required />
                  </label>
                  <label className="field">
                    {t("End", "النهاية")}
                    <input className="input" type="datetime-local" value={slotEndAt} onChange={(event) => setSlotEndAt(event.target.value)} required />
                  </label>
                </div>

                <div className="field">
                  {t("Languages for this slot", "لغات هذا الموعد")}
                  <div className="language-check-grid">
                    {INTERNATIONAL_LANGUAGES.map((languageOption) => (
                      <label key={languageOption.value} className="check-item">
                        <input
                          type="checkbox"
                          checked={slotLanguages.includes(languageOption.value)}
                          onChange={(event) => toggleSelection(slotLanguages, setSlotLanguages, languageOption.value, event.target.checked)}
                        />
                        <span>{locale === "ar" ? languageOption.ar : languageOption.en}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <button className="btn btn-primary" type="submit" disabled={savingSlot}>
                  {savingSlot ? t("Publishing...", "جارٍ النشر...") : t("Publish Availability Slot", "نشر موعد توفر")}
                </button>
              </form>

              <div className="cards-grid provider-slots-grid">
                {availabilitySlots.length === 0 ? (
                  <article className="panel compact-card">{t("No slots published yet.", "لا توجد مواعيد منشورة بعد.")}</article>
                ) : (
                  availabilitySlots.map((slot) => (
                    <article key={slot.id} className="panel compact-card provider-slot-card">
                      <p className="eyebrow">{pretty(slot.service_type)} • {pretty(slot.city_scope)}</p>
                      <p className="page-sub mini">{new Date(slot.start_at).toLocaleString()} - {new Date(slot.end_at).toLocaleString()}</p>
                      <p className="page-sub mini">{t("Languages", "اللغات")}: {slot.languages.join(", ") || t("Any", "أي لغة")}</p>
                      <div className="meta-row">
                        <span className={`status-pill ${slot.is_available ? "status-accepted" : "status-unpaid"}`}>
                          {slot.is_available ? t("Available", "متاح") : t("Unavailable", "غير متاح")}
                        </span>
                        {slot.booked_by ? <span className="status-pill">{t("Booked", "محجوز")}</span> : null}
                      </div>
                      <div className="card-actions">
                        <button className="btn btn-outline" onClick={() => void handleToggleSlot(slot)} disabled={Boolean(slot.booked_by) || actionLoading === `slot-toggle-${slot.id}`}>
                          {slot.is_available ? t("Mark Unavailable", "جعله غير متاح") : t("Mark Available", "جعله متاح")}
                        </button>
                        <button className="btn btn-ghost" onClick={() => void handleDeleteSlot(slot.id)} disabled={Boolean(slot.booked_by) || actionLoading === `slot-delete-${slot.id}`}>
                          {t("Delete Slot", "حذف الموعد")}
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
