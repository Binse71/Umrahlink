"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useLanguage } from "@/components/LanguageProvider";
import {
  getErrorMessage,
  healthCheck,
  login,
  loginCustomer,
  loginProvider,
  registerCustomer,
  registerProvider,
  resolveApiBaseUrl
} from "@/lib/api";
import { withLocale } from "@/lib/i18n";
import { INTERNATIONAL_LANGUAGES } from "@/lib/languages";
import { saveAuth } from "@/lib/auth-client";

type AuthMode = "login" | "register";
type AccountRole = "CUSTOMER" | "PROVIDER" | "ADMIN";
type AuthContext = "auth" | "signin" | "signup-customer" | "signup-provider";
type ProviderBioOption = "GUIDED_SUPPORT" | "FAMILY_SUPPORT" | "RELIABLE_SERVICE" | "PLATFORM_UPDATES";
type ProviderCredentialOption =
  | "UMRAH_BADAL_SUPPORT"
  | "ZIYARAH_GUIDE_SUPPORT"
  | "ELDERLY_FAMILY_SUPPORT"
  | "MULTILINGUAL_ASSISTANCE"
  | "ON_TIME_UPDATES";

const PROVIDER_LOCATION_OPTIONS = ["Makkah", "Madinah"] as const;
type ProviderLocation = (typeof PROVIDER_LOCATION_OPTIONS)[number];

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

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

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

function buildProviderBio(selectedOptions: ProviderBioOption[]) {
  return PROVIDER_BIO_CHOICES
    .filter((option) => selectedOptions.includes(option.key))
    .map((option) => option.text)
    .join("\n");
}

function contextDefaults(context: AuthContext) {
  if (context === "signin") {
    return {
      initialMode: "login" as AuthMode,
      allowModeSwitch: false,
      fixedRegisterRole: undefined as "CUSTOMER" | "PROVIDER" | undefined
    };
  }

  if (context === "signup-customer") {
    return {
      initialMode: "register" as AuthMode,
      allowModeSwitch: false,
      fixedRegisterRole: "CUSTOMER" as "CUSTOMER" | "PROVIDER"
    };
  }

  if (context === "signup-provider") {
    return {
      initialMode: "register" as AuthMode,
      allowModeSwitch: false,
      fixedRegisterRole: "PROVIDER" as "CUSTOMER" | "PROVIDER"
    };
  }

  return {
    initialMode: "login" as AuthMode,
    allowModeSwitch: true,
    fixedRegisterRole: undefined as "CUSTOMER" | "PROVIDER" | undefined
  };
}

export default function AuthPortal({ context = "auth" }: { context?: AuthContext }) {
  const router = useRouter();
  const defaults = useMemo(() => contextDefaults(context), [context]);
  const { locale } = useLanguage();
  const isProviderSignup = context === "signup-provider";

  const t = (enText: string, arText: string) => withLocale(locale, enText, arText);

  const [mode, setMode] = useState<AuthMode>(defaults.initialMode);
  const [loginRole, setLoginRole] = useState<AccountRole>("CUSTOMER");
  const [registerRole, setRegisterRole] = useState<"CUSTOMER" | "PROVIDER">(defaults.fixedRegisterRole ?? "CUSTOMER");

  const [loginCredential, setLoginCredential] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [languages, setLanguages] = useState("");
  const [providerLanguages, setProviderLanguages] = useState<string[]>([]);

  const [professionalName, setProfessionalName] = useState("");
  const [providerLocation, setProviderLocation] = useState<ProviderLocation>("Makkah");
  const [bioOptions, setBioOptions] = useState<ProviderBioOption[]>([]);
  const [yearsExperience, setYearsExperience] = useState("2");
  const [credentialOptions, setCredentialOptions] = useState<ProviderCredentialOption[]>([]);
  const [providerPhoto, setProviderPhoto] = useState<File | null>(null);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apiState, setApiState] = useState<"checking" | "online" | "offline">("checking");

  const apiBaseUrl = resolveApiBaseUrl();

  useEffect(() => {
    setMode(defaults.initialMode);
    if (defaults.fixedRegisterRole) {
      setRegisterRole(defaults.fixedRegisterRole);
    }
  }, [defaults]);

  useEffect(() => {
    let mounted = true;

    async function verifyApi() {
      try {
        await healthCheck();
        if (mounted) {
          setApiState("online");
        }
      } catch {
        if (mounted) {
          setApiState("offline");
        }
      }
    }

    void verifyApi();
    return () => {
      mounted = false;
    };
  }, []);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (apiState === "offline") {
      setError(t(`Backend API is offline at ${apiBaseUrl}. Start Django server first.`, `واجهة الـ API غير متصلة على ${apiBaseUrl}. شغّل خادم Django أولاً.`));
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const auth = loginRole === "CUSTOMER"
        ? await loginCustomer({
            username_or_email: loginCredential,
            password: loginPassword
          })
        : loginRole === "PROVIDER"
          ? await loginProvider({
              username_or_email: loginCredential,
              password: loginPassword
            })
          : await login({
              username_or_email: loginCredential,
              password: loginPassword
            });

      saveAuth(auth);
      setMessage(t("Signed in successfully.", "تم تسجيل الدخول بنجاح."));
      router.push("/dashboard");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (apiState === "offline") {
      setError(t(`Backend API is offline at ${apiBaseUrl}. Start Django server first.`, `واجهة الـ API غير متصلة على ${apiBaseUrl}. شغّل خادم Django أولاً.`));
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (registerRole === "CUSTOMER") {
        const preferredLanguages = splitList(languages);
        const auth = await registerCustomer({
          username,
          email,
          password,
          first_name: firstName,
          last_name: lastName,
          phone_number: phone,
          city,
          country,
          preferred_languages: preferredLanguages.length > 0 ? preferredLanguages : undefined
        });
        saveAuth(auth);
      } else {
        if (providerLanguages.length === 0) {
          throw new Error(t("Select at least one language you speak.", "اختر لغة واحدة على الأقل تتحدثها."));
        }
        if (bioOptions.length === 0) {
          throw new Error(t("Select at least one bio option.", "اختر خياراً واحداً على الأقل للنبذة."));
        }
        if (credentialOptions.length === 0) {
          throw new Error(t("Select at least one credential option.", "اختر خياراً واحداً على الأقل للمؤهلات."));
        }
        if (!providerPhoto) {
          throw new Error(t("Provider profile photo is required.", "صورة الملف الشخصي للمزود مطلوبة."));
        }

        const parsedYears = Number.parseInt(yearsExperience, 10);
        const auth = await registerProvider({
          username,
          email,
          password,
          first_name: firstName,
          last_name: lastName,
          phone_number: phone,
          city: providerLocation,
          professional_name: professionalName,
          bio: buildProviderBio(bioOptions),
          base_locations: [providerLocation],
          supported_languages: providerLanguages,
          years_experience: Number.isNaN(parsedYears) ? 0 : parsedYears,
          credentials_summary: credentialOptions.join(","),
          profile_photo: providerPhoto
        });
        saveAuth(auth);
      }

      setMessage(t("Account created. Redirecting to dashboard...", "تم إنشاء الحساب. جارٍ تحويلك إلى لوحة التحكم..."));
      router.push("/dashboard");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="container simple-topbar">
        <Link href="/" className="brand brand-header" aria-label="Umrah Link Home">
          <Image
            src="/umrah-link-logo.png"
            alt="Umrah Link logo"
            width={660}
            height={660}
            className="brand-logo brand-logo-header"
          />
        </Link>

        <nav className="inline-links">
          <Link href="/">{t("Home", "الرئيسية")}</Link>
          <Link href="/marketplace">{t("Marketplace", "السوق")}</Link>
          <Link href="/dashboard">{t("Dashboard", "لوحة التحكم")}</Link>
        </nav>

        <div className="inline-actions">
          <LanguageSwitcher />
        </div>
      </header>

      <main className={`container page-container narrow ${isProviderSignup ? "provider-flow provider-signup-flow" : ""}`.trim()}>
        <div className={`panel auth-panel ${isProviderSignup ? "provider-auth-shell fade-up" : ""}`.trim()} style={isProviderSignup ? { animationDelay: "0.08s" } : undefined}>
          {isProviderSignup ? (
            <section className="provider-signup-hero">
              <p className="eyebrow">{t("Verified Provider Onboarding", "الانضمام كمزود معتمد")}</p>
              <h2 className="section-title">{t("Build a trusted provider profile", "ابنِ ملفاً موثوقاً كمزود خدمة")}</h2>
              <p className="page-sub">
                {t(
                  "Complete the guided checklist below to get reviewed faster and appear in customer search results.",
                  "أكمل القائمة الإرشادية أدناه للحصول على مراجعة أسرع والظهور في نتائج بحث العملاء."
                )}
              </p>
            </section>
          ) : null}

          {defaults.allowModeSwitch ? (
            <div className="toolbar">
              <button className={`btn ${mode === "login" ? "btn-primary" : "btn-ghost"}`} onClick={() => setMode("login")}>
                {t("Sign In", "تسجيل الدخول")}
              </button>
              <button
                className={`btn ${mode === "register" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setMode("register")}
              >
                {t("Create Account", "إنشاء حساب")}
              </button>
            </div>
          ) : null}

          <p className={`notice ${apiState === "online" ? "success" : apiState === "offline" ? "error" : "warn"}`}>
            {t("API", "واجهة API")}: {apiState} ({apiBaseUrl})
          </p>

          {mode === "login" ? (
            <form className="form-grid" onSubmit={handleLogin}>
              <h1 className="page-title">{t("Sign in to Umrah Link", "تسجيل الدخول إلى عمرة لينك")}</h1>
              <p className="page-sub">{t("Use the correct portal for your account type.", "استخدم بوابة الدخول المناسبة لنوع حسابك.")}</p>

              <label className="field">
                {t("Sign in as", "تسجيل الدخول كـ")}
                <select className="select" value={loginRole} onChange={(event) => setLoginRole(event.target.value as AccountRole)}>
                  <option value="CUSTOMER">{t("Customer", "عميل")}</option>
                  <option value="PROVIDER">{t("Provider", "مزود خدمة")}</option>
                  <option value="ADMIN">{t("Admin", "إدارة")}</option>
                </select>
              </label>

              <label className="field">
                {t("Username or Email", "اسم المستخدم أو البريد الإلكتروني")}
                <input className="input" value={loginCredential} onChange={(event) => setLoginCredential(event.target.value)} required />
              </label>

              <label className="field">
                {t("Password", "كلمة المرور")}
                <input
                  className="input"
                  type="password"
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                  required
                />
              </label>

              <button className="btn btn-primary" type="submit" disabled={loading}>
                {loading
                  ? t("Signing in...", "جارٍ تسجيل الدخول...")
                  : loginRole === "CUSTOMER"
                    ? t("Sign In as Customer", "دخول كعميل")
                    : loginRole === "PROVIDER"
                      ? t("Sign In as Provider", "دخول كمزود خدمة")
                      : t("Sign In as Admin", "دخول كإدارة")}
              </button>

              {!defaults.allowModeSwitch ? (
                <p className="page-sub mini">
                  {t("Need an account?", "لا تملك حساباً؟")} <Link href="/signup/customer" className="inline-link">{t("Customer signup", "تسجيل عميل")}</Link> {t("or", "أو")} <Link href="/signup/provider" className="inline-link">{t("Provider signup", "تسجيل مزود")}</Link>
                </p>
              ) : null}
            </form>
          ) : (
            <form className={`form-grid ${registerRole === "PROVIDER" ? "provider-form" : ""}`.trim()} onSubmit={handleRegister}>
              <h1 className="page-title">{t("Create your Umrah Link account", "أنشئ حسابك في عمرة لينك")}</h1>
              <p className="page-sub">{t("Choose customer or provider, then continue to the dashboard.", "اختر عميل أو مزود خدمة ثم أكمل إلى لوحة التحكم.")}</p>

              {defaults.fixedRegisterRole ? (
                <p className="notice success">{t("Account type", "نوع الحساب")}: {defaults.fixedRegisterRole === "CUSTOMER" ? t("Customer", "عميل") : t("Provider", "مزود خدمة")}</p>
              ) : (
                <label className="field">
                  {t("Account Type", "نوع الحساب")}
                  <select className="select" value={registerRole} onChange={(event) => setRegisterRole(event.target.value as "CUSTOMER" | "PROVIDER")}>
                    <option value="CUSTOMER">{t("Customer", "عميل")}</option>
                    <option value="PROVIDER">{t("Provider", "مزود خدمة")}</option>
                  </select>
                </label>
              )}

              <div className="field-grid">
                <label className="field">
                  {t("Username", "اسم المستخدم")}
                  <input className="input" value={username} onChange={(event) => setUsername(event.target.value)} required />
                </label>

                <label className="field">
                  {t("Email", "البريد الإلكتروني")}
                  <input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
                </label>

                <label className="field">
                  {t("Password", "كلمة المرور")}
                  <input
                    className="input"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    minLength={8}
                    required
                  />
                </label>

                <label className="field">
                  {t("Phone", "رقم الجوال")}
                  <input className="input" value={phone} onChange={(event) => setPhone(event.target.value)} />
                </label>

                <label className="field">
                  {t("First Name", "الاسم الأول")}
                  <input className="input" value={firstName} onChange={(event) => setFirstName(event.target.value)} />
                </label>

                <label className="field">
                  {t("Last Name", "اسم العائلة")}
                  <input className="input" value={lastName} onChange={(event) => setLastName(event.target.value)} />
                </label>

                {registerRole === "CUSTOMER" ? (
                  <>
                    <label className="field">
                      {t("City", "المدينة")}
                      <input className="input" value={city} onChange={(event) => setCity(event.target.value)} />
                    </label>
                    <label className="field">
                      {t("Country", "الدولة")}
                      <input className="input" value={country} onChange={(event) => setCountry(event.target.value)} />
                    </label>
                  </>
                ) : (
                  <label className="field">
                    {t("Service Location", "موقع الخدمة")}
                    <select
                      className="select"
                      value={providerLocation}
                      onChange={(event) => setProviderLocation(event.target.value as ProviderLocation)}
                    >
                      {PROVIDER_LOCATION_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              {registerRole === "CUSTOMER" ? (
                <label className="field">
                  {t("Languages (optional, comma separated)", "اللغات (اختياري، مفصولة بفاصلة)")}
                  <input
                    className="input"
                    value={languages}
                    onChange={(event) => setLanguages(event.target.value)}
                    placeholder={t("Arabic, English", "العربية، الإنجليزية")}
                  />
                </label>
              ) : (
                <div className="field provider-check-section">
                  {t("Languages Spoken (select all that apply)", "اللغات التي تتحدثها (اختر كل ما ينطبق)")}
                  <div className="language-check-grid">
                    {INTERNATIONAL_LANGUAGES.map((languageOption) => (
                      <label key={languageOption.value} className="check-item">
                        <input
                          type="checkbox"
                          checked={providerLanguages.includes(languageOption.value)}
                          onChange={(event) => toggleSelection(providerLanguages, setProviderLanguages, languageOption.value, event.target.checked)}
                        />
                        <span>{locale === "ar" ? languageOption.ar : languageOption.en}</span>
                      </label>
                    ))}
                  </div>
                  <p className="page-sub mini">{t("Selected", "تم الاختيار")}: {providerLanguages.length}</p>
                </div>
              )}

              {registerRole === "PROVIDER" ? (
                <>
                  <label className="field">
                    {t("Professional Name", "الاسم المهني")}
                    <input
                      className="input"
                      value={professionalName}
                      onChange={(event) => setProfessionalName(event.target.value)}
                      required
                    />
                  </label>

                  <label className="field">
                    {t("Years of Experience", "سنوات الخبرة")}
                    <input
                      className="input"
                      value={yearsExperience}
                      onChange={(event) => setYearsExperience(event.target.value)}
                      inputMode="numeric"
                    />
                  </label>

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

                  <label className="field">
                    {t("Profile Photo", "الصورة الشخصية")}
                    <input
                      className="input"
                      type="file"
                      accept="image/*"
                      required={registerRole === "PROVIDER"}
                      onChange={(event) => setProviderPhoto(event.target.files?.[0] ?? null)}
                    />
                    <p className="page-sub mini">{t("Required for provider verification.", "مطلوبة لاعتماد حساب المزود.")}</p>
                  </label>

                  <div className="field provider-check-section">
                    {t("Credential Checklist (select only)", "قائمة المؤهلات (اختيارات فقط)")}
                    <div className="language-check-grid">
                      {PROVIDER_CREDENTIAL_CHOICES.map((option) => (
                        <label key={option.key} className="check-item">
                          <input
                            type="checkbox"
                            checked={credentialOptions.includes(option.key)}
                            onChange={(event) =>
                              toggleSelection(credentialOptions, setCredentialOptions, option.key, event.target.checked)
                            }
                          />
                          <span>{locale === "ar" ? option.ar : option.en}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              ) : null}

              <button className="btn btn-primary" type="submit" disabled={loading}>
                {loading ? t("Creating account...", "جارٍ إنشاء الحساب...") : t("Create Account", "إنشاء حساب")}
              </button>

              {!defaults.allowModeSwitch ? (
                <p className="page-sub mini">
                  {t("Already have an account?", "لديك حساب بالفعل؟")} <Link href="/signin" className="inline-link">{t("Sign in", "تسجيل الدخول")}</Link>
                </p>
              ) : null}
            </form>
          )}

          {message ? <p className="notice success">{message}</p> : null}
          {error ? <p className="notice error">{error}</p> : null}
        </div>
      </main>
    </div>
  );
}
