"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CircleDollarSign,
  Globe2,
  Handshake,
  Heart,
  Languages,
  MapPin,
  MessageCircle,
  ShieldCheck,
  Star,
  Users,
  Wallet
} from "lucide-react";

import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useLanguage } from "@/components/LanguageProvider";
import { ApiUser, logout } from "@/lib/api";
import { clearAuth, getAuthToken, getStoredUser } from "@/lib/auth-client";
import { withLocale } from "@/lib/i18n";

const processSteps = [
  {
    id: 1,
    title: { en: "Tell Us Your Needs", ar: "أخبرنا باحتياجاتك" },
    text: {
      en: "Choose service type, travel date, city, and preferred language in under a minute.",
      ar: "اختر نوع الخدمة وتاريخ السفر والمدينة واللغة المفضلة خلال أقل من دقيقة."
    },
    icon: CalendarClock
  },
  {
    id: 2,
    title: { en: "We Find Your Match", ar: "نجد لك المزود المناسب" },
    text: {
      en: "Compare verified providers by rating, language, pricing, and availability.",
      ar: "قارن بين المزودين المعتمدين حسب التقييم واللغة والسعر والتوفر."
    },
    icon: Users
  },
  {
    id: 3,
    title: { en: "Book With Confidence", ar: "احجز بثقة" },
    text: {
      en: "Confirm your booking with protected payment and clear service terms.",
      ar: "أكد حجزك مع دفع محمي وشروط خدمة واضحة."
    },
    icon: ShieldCheck
  },
  {
    id: 4,
    title: { en: "Begin Your Journey", ar: "ابدأ رحلتك" },
    text: {
      en: "Track booking updates, chat after payment, and complete with peace of mind.",
      ar: "تابع تحديثات الحجز وابدأ المحادثة بعد الدفع وأكمل الخدمة بكل اطمئنان."
    },
    icon: Handshake
  }
];

const trustCards = [
  {
    title: { en: "Verified Providers", ar: "مزودون معتمدون" },
    text: {
      en: "Provider onboarding includes profile checks and service moderation.",
      ar: "تتضمن عملية اعتماد المزودين التحقق من الملفات ومراجعة الخدمات."
    },
    icon: BadgeCheck
  },
  {
    title: { en: "Secure Payments", ar: "مدفوعات آمنة" },
    text: {
      en: "Escrow lifecycle: paid, held, completed, released or refunded.",
      ar: "حالة الضمان: مدفوع، محتجز، مكتمل، مُفرج عنه أو مُسترد."
    },
    icon: Wallet
  },
  {
    title: { en: "Real Reviews", ar: "تقييمات حقيقية" },
    text: {
      en: "Reviews are tied to completed bookings to protect trust quality.",
      ar: "جميع التقييمات مرتبطة بحجوزات مكتملة لضمان الموثوقية."
    },
    icon: Star
  },
  {
    title: { en: "Dispute Resolution", ar: "حل النزاعات" },
    text: {
      en: "Evidence upload and admin decisions are built directly into platform flows.",
      ar: "رفع الأدلة وقرارات الإدارة مدمجة مباشرة داخل سير العمل في المنصة."
    },
    icon: MessageCircle
  },
  {
    title: { en: "Major Languages", ar: "لغات عالمية" },
    text: {
      en: "Arabic, English, Urdu, French, Turkish, Malay, Indonesian and more.",
      ar: "العربية والإنجليزية والأردية والفرنسية والتركية والماليزية والإندونيسية وغيرها."
    },
    icon: Languages
  },
  {
    title: { en: "Transparent Pricing", ar: "أسعار واضحة" },
    text: {
      en: "Clear pricing in USD with no hidden service surprises.",
      ar: "أسعار واضحة بالدولار الأمريكي بدون رسوم أو مفاجآت مخفية."
    },
    icon: CircleDollarSign
  }
];

const languageList = {
  en: ["Arabic", "English", "Urdu", "French", "Turkish", "Malay", "Indonesian", "Hindi", "Bengali", "Persian", "Swahili", "Spanish"],
  ar: ["العربية", "الإنجليزية", "الأردية", "الفرنسية", "التركية", "الماليزية", "الإندونيسية", "الهندية", "البنغالية", "الفارسية", "السواحلية", "الإسبانية"]
};

export default function HomePage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [viewer, setViewer] = useState<ApiUser | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const t = (enText: string, arText: string) => withLocale(locale, enText, arText);

  useEffect(() => {
    const syncViewer = () => setViewer(getStoredUser());
    syncViewer();

    window.addEventListener("focus", syncViewer);
    window.addEventListener("storage", syncViewer);
    return () => {
      window.removeEventListener("focus", syncViewer);
      window.removeEventListener("storage", syncViewer);
    };
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      const token = getAuthToken();
      if (token) {
        await logout(token);
      }
    } catch {
      // Keep client sign-out reliable even if backend is temporarily unreachable.
    } finally {
      clearAuth();
      setViewer(null);
      setSigningOut(false);
      router.replace("/");
    }
  }

  return (
    <div className="page-shell home-page">
      <div className="bg-orb bg-orb-a" />
      <div className="bg-orb bg-orb-b" />

      <header className="container topbar fade-up" style={{ animationDelay: "0.08s" }}>
        <Link href="/" className="brand brand-header" aria-label="Umrah Link Home">
          <Image
            src="/umrah-link-logo.png"
            alt="Umrah Link logo"
            width={660}
            height={660}
            className="brand-logo brand-logo-header"
            priority
          />
        </Link>

        <nav className="nav-links">
          <a href="#how-it-works">{t("How It Works", "كيف تعمل المنصة")}</a>
          <Link href="/marketplace">{t("Marketplace", "السوق")}</Link>
          <a href="#why-us">{t("Why Umrah Link", "لماذا عمرة لينك")}</a>
          <a href="#legal">{t("Legal", "القانوني")}</a>
          <Link href="/signup/provider">{t("Become a Provider", "انضم كمزود خدمة")}</Link>
        </nav>

        <div className="top-actions">
          <LanguageSwitcher />
          {viewer ? (
            <>
              <Link href="/dashboard" className="btn btn-ghost">
                {t("Dashboard", "لوحة التحكم")}
              </Link>
              <button className="btn btn-outline" onClick={() => void handleSignOut()} disabled={signingOut}>
                {signingOut ? t("Signing out...", "جارٍ تسجيل الخروج...") : t("Sign Out", "تسجيل الخروج")}
              </button>
            </>
          ) : (
            <Link href="/signin" className="btn btn-ghost">
              {t("Sign In", "تسجيل الدخول")}
            </Link>
          )}
          <Link href="/marketplace" className="btn btn-primary">
            {t("Book Now", "احجز الآن")}
          </Link>
        </div>
      </header>

      <main>
        <section className="container home-hero fade-up" style={{ animationDelay: "0.16s" }}>
          <div className="hero-copy">
            <p className="hero-badge">{t("Trusted by pilgrims worldwide", "موثوق من المعتمرين حول العالم")}</p>
            <h1>
              {t("Find Your Perfect", "اعثر على")}
              <span> {t("Umrah Support", "خدمة عمرة المناسبة")}</span>
            </h1>
            <p className="hero-text">
              {t(
                "Umrah Link connects customers with verified providers for Umrah Badal, Ziyarah Guides in Makkah and Madinah, and Umrah Assistants through one secure platform.",
                "تربط عمرة لينك العملاء بالمزودين المعتمدين لخدمات عمرة البدل ومرشدي الزيارة في مكة والمدينة ومساعدي العمرة عبر منصة واحدة آمنة."
              )}
            </p>

            <div className="cta-row">
              <Link href="/marketplace" className="btn btn-primary">
                {t("Browse Providers", "تصفح المزودين")} <ArrowRight size={17} />
              </Link>
              <Link href="/signup/provider" className="btn btn-outline">
                {t("Join as Provider", "انضم كمزود")}
              </Link>
            </div>

            <div className="hero-metrics">
              <div>
                <p>150+</p>
                <span>{t("Pilgrims Guided", "معتمر تمت خدمته")}</span>
              </div>
              <div>
                <p>4.9</p>
                <span>{t("Average Rating", "متوسط التقييم")}</span>
              </div>
              <div>
                <p>20+</p>
                <span>{t("Verified Providers", "مزود معتمد")}</span>
              </div>
            </div>
          </div>

          <aside className="hero-panel">
            <div className="panel-head">
              <p>{t("Get Matched in 2 Minutes", "احصل على المزود المناسب خلال دقيقتين")}</p>
              <span>{t("Step 1 of 2", "الخطوة 1 من 2")}</span>
            </div>

            <div className="package-option">
              <div>
                <p>{t("Umrah Badal", "عمرة بدل")}</p>
                <small>{t("Verified provider • Dedicated completion proof", "مزود معتمد • إثبات إتمام موثق")}</small>
              </div>
              <strong>$250</strong>
            </div>

            <div className="package-option active">
              <div>
                <p>{t("Ziyarah Guide (Makkah + Madinah)", "مرشد زيارة (مكة + المدينة)")}</p>
                <small>{t("Most popular • Arabic, English, Urdu", "الأكثر طلباً • العربية والإنجليزية والأردية")}</small>
              </div>
              <strong>$180</strong>
            </div>

            <div className="package-option">
              <div>
                <p>{t("Umrah Assistant", "مساعد عمرة")}</p>
                <small>{t("Airport support, rituals, local navigation", "دعم المطار والمناسك والتنقل المحلي")}</small>
              </div>
              <strong>$120</strong>
            </div>

            <div className="flow-note">
              <Wallet size={16} />
              <p>
                {t("Escrow flow:", "مسار الضمان المالي:")} <strong>{t("Paid", "مدفوع")}</strong> → <strong>{t("Held", "محتجز")}</strong> →{" "}
                <strong>{t("Completed", "مكتمل")}</strong>
              </p>
            </div>
          </aside>
        </section>

        <section className="container language-strip fade-up" style={{ animationDelay: "0.24s" }}>
          <p>
            <Globe2 size={17} /> {t("Language support across major international languages", "دعم لغوي شامل لأهم اللغات العالمية")}
          </p>
          <div>
            {(locale === "ar" ? languageList.ar : languageList.en).map((language) => (
              <span key={language}>{language}</span>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="container section home-steps fade-up" style={{ animationDelay: "0.32s" }}>
          <div className="section-head">
            <h2>{t("How Umrah Link Works", "كيف تعمل عمرة لينك")}</h2>
            <p>{t("Four simple steps to move from search to verified service delivery.", "أربع خطوات بسيطة من البحث حتى تقديم الخدمة الموثوقة.")}</p>
          </div>

          <div className="step-line" />
          <div className="step-grid">
            {processSteps.map((step) => {
              const Icon = step.icon;
              return (
                <article key={step.id} className="step-card">
                  <div className="step-top">
                    <span>{step.id}</span>
                    <Icon size={18} />
                  </div>
                  <h3>{withLocale(locale, step.title.en, step.title.ar)}</h3>
                  <p>{withLocale(locale, step.text.en, step.text.ar)}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section id="why-us" className="container section fade-up" style={{ animationDelay: "0.4s" }}>
          <div className="section-head">
            <h2>{t("Why Umrah Link?", "لماذا عمرة لينك؟")}</h2>
            <p>{t("Built to make Umrah services accessible, trustworthy, and easy to book.", "منصة مصممة لتجعل خدمات العمرة متاحة وموثوقة وسهلة الحجز.")}</p>
          </div>

          <div className="trust-grid">
            {trustCards.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title.en} className="trust-card">
                  <Icon size={18} />
                  <h3>{withLocale(locale, item.title.en, item.title.ar)}</h3>
                  <p>{withLocale(locale, item.text.en, item.text.ar)}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="container section provider-block fade-up" style={{ animationDelay: "0.48s" }}>
          <div>
            <p className="eyebrow">{t("Become a Verified Provider", "انضم كمزود معتمد")}</p>
            <h2>{t("Share Your Knowledge, Guide Pilgrims", "شارك خبرتك وأرشد المعتمرين")}</h2>
            <p>
              {t(
                "Create a professional profile, list your services, set USD pricing, and build your reputation through verified reviews.",
                "أنشئ ملفاً مهنياً وعرّف خدماتك وحدد أسعارك بالدولار وابنِ سمعتك عبر التقييمات الموثوقة."
              )}
            </p>

            <div className="provider-stats">
              <article>
                <strong>20+</strong>
                <span>{t("Active Providers", "مزود نشط")}</span>
              </article>
              <article>
                <strong>150+</strong>
                <span>{t("Pilgrims Served", "معتمر تمت خدمته")}</span>
              </article>
              <article>
                <strong>$1,000+</strong>
                <span>{t("Top Monthly Earnings", "أعلى دخل شهري")}</span>
              </article>
            </div>

            <Link href="/signup/provider" className="btn btn-primary">
              {t("Apply to Join", "قدّم طلب الانضمام")} <ArrowRight size={17} />
            </Link>
          </div>

          <div className="provider-side-card">
            <h3>{t("Provider Benefits", "مزايا المزود")}</h3>
            <ul>
              <li>
                <Heart size={15} /> {t("Flexible schedule", "جدول مرن")}
              </li>
              <li>
                <MapPin size={15} /> {t("Makkah and Madinah demand", "طلب مرتفع في مكة والمدينة")}
              </li>
              <li>
                <ShieldCheck size={15} /> {t("Secure payout protection", "حماية آمنة للمدفوعات")}
              </li>
              <li>
                <CalendarClock size={15} /> {t("Real booking requests", "طلبات حجز حقيقية")}
              </li>
            </ul>
          </div>
        </section>

        <section id="legal" className="container section legal-row fade-up" style={{ animationDelay: "0.56s" }}>
          <article>
            <h3>{t("Legal Position", "الوضع القانوني")}</h3>
            <p>
              {t(
                "Umrah Link is an online marketplace connecting customers seeking Umrah-related services with independent service providers in Saudi Arabia. The platform acts solely as an intermediary and provides digital tools for listing, booking, communication, and profile management.",
                "عمرة لينك منصة إلكترونية تربط العملاء الباحثين عن خدمات العمرة بمزودي خدمات مستقلين في المملكة العربية السعودية. تعمل المنصة كوسيط فقط وتوفر أدوات رقمية للإدراج والحجز والتواصل وإدارة الملفات الشخصية."
              )}
            </p>
          </article>
        </section>

        <section className="container cta-block fade-up" style={{ animationDelay: "0.64s" }}>
          <div>
            <p className="eyebrow light">{t("Your trusted link to umrah support", "رابطك الموثوق لدعم العمرة")}</p>
            <h2>{t("Ready to start your sacred journey?", "جاهز لبدء رحلتك الروحانية؟")}</h2>
            <p>{t("Compare verified providers and book in minutes through one unified platform.", "قارن بين المزودين المعتمدين واحجز خلال دقائق عبر منصة موحدة.")}</p>
          </div>
          <Link href="/marketplace" className="btn btn-light">
            {t("View Packages", "عرض الباقات")} <ArrowRight size={17} />
          </Link>
        </section>
      </main>

      <footer className="footer">
        <div className="container footer-grid">
          <div>
            <div className="brand footer-brand">
              <Image
                src="/umrah-link-logo.png"
                alt="Umrah Link logo"
                width={660}
                height={660}
                className="brand-logo brand-logo-footer"
              />
            </div>
            <p className="footer-note">{t("Connecting pilgrims with verified Umrah support services worldwide.", "نربط المعتمرين بخدمات دعم عمرة موثوقة حول العالم.")}</p>
          </div>

          <div>
            <p className="footer-heading">{t("Platform", "المنصة")}</p>
            <p>{t("How It Works", "كيف تعمل")}</p>
            <p>{t("Marketplace", "السوق")}</p>
            <p>{t("Trust & Safety", "الثقة والأمان")}</p>
          </div>

          <div>
            <p className="footer-heading">{t("Services", "الخدمات")}</p>
            <p>{t("Umrah Badal", "عمرة بدل")}</p>
            <p>{t("Ziyarah Guide", "مرشد زيارة")}</p>
            <p>{t("Umrah Assistant", "مساعد عمرة")}</p>
          </div>

          <div>
            <p className="footer-heading">{t("Support", "الدعم")}</p>
            <p>support@umrahlink.com</p>
            <p>{t("24/7 Availability", "متاح 24/7")}</p>
            <p>{t("Legal & Privacy", "القانونية والخصوصية")}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
