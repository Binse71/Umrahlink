"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import AppTopNav from "@/components/AppTopNav";
import { useLanguage } from "@/components/LanguageProvider";
import { Dispute, addDisputeEvidence, addDisputeEvidenceUpload, getDispute, getErrorMessage, getMe, logout } from "@/lib/api";
import { clearAuth, getAuthToken, setStoredUser } from "@/lib/auth-client";
import { withLocale } from "@/lib/i18n";

function pretty(value: string) {
  return value.replaceAll("_", " ");
}

export default function DisputeDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { locale } = useLanguage();
  const t = (enText: string, arText: string) => withLocale(locale, enText, arText);
  const disputeId = useMemo(() => Number.parseInt(params.id ?? "", 10), [params.id]);

  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidenceNote, setEvidenceNote] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadDisputeData() {
    setLoading(true);
    setError(null);

    try {
      if (Number.isNaN(disputeId)) {
        throw new Error(t("Invalid dispute id.", "معرّف النزاع غير صالح."));
      }

      const token = getAuthToken();
      if (!token) {
        router.replace("/signin");
        return;
      }

      const [me, disputeResponse] = await Promise.all([getMe(token), getDispute(token, disputeId)]);
      setStoredUser(me);
      setDispute(disputeResponse);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDisputeData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disputeId]);

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

  async function handleAddEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dispute) {
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const token = getAuthToken();
      if (!token) {
        throw new Error(t("Please sign in first.", "يرجى تسجيل الدخول أولاً."));
      }
      if (!evidenceUrl.trim() && !evidenceFile) {
        throw new Error(t("Provide a file upload or evidence URL.", "أرفق ملفاً أو رابط دليل."));
      }

      if (evidenceFile) {
        await addDisputeEvidenceUpload(token, dispute.id, {
          file: evidenceFile,
          note: evidenceNote
        });
      } else {
        await addDisputeEvidence(token, dispute.id, {
          file_url: evidenceUrl.trim(),
          note: evidenceNote
        });
      }

      setMessage(t("Evidence added.", "تمت إضافة الدليل."));
      setEvidenceUrl("");
      setEvidenceFile(null);
      setEvidenceNote("");
      await loadDisputeData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app-shell">
      <AppTopNav
        links={[
          { href: "/", label: "Home" },
          { href: "/disputes", label: "Disputes" },
          { href: dispute ? `/bookings/${dispute.booking}` : "/bookings", label: "Booking" },
          { href: "/notifications", label: "Notifications" }
        ]}
        actions={
          <button className="btn btn-ghost" onClick={handleSignOut}>
            {t("Sign Out", "تسجيل الخروج")}
          </button>
        }
      />

      <main className="container page-container">
        {loading ? <section className="panel">{t("Loading dispute...", "جاري تحميل النزاع...")}</section> : null}
        {error ? <p className="notice error">{error}</p> : null}
        {message ? <p className="notice success">{message}</p> : null}

        {!loading && !error && dispute ? (
          <>
            <section className="panel detail-grid">
              <article className="summary-card">
                <h1 className="page-title">{t("Dispute Case", "حالة النزاع")} #{dispute.id}</h1>
                <p className="page-sub mini">{t("Booking", "الحجز")}: {dispute.booking_reference}</p>
                <div className="meta-row">
                  <span className={`status-pill status-${dispute.status.toLowerCase()}`}>{pretty(dispute.status)}</span>
                  <span className="status-pill">{pretty(dispute.requested_resolution)}</span>
                </div>
                <p className="page-sub">{dispute.reason}</p>
              </article>

              <article className="panel compact-card">
                <h3 className="section-title">{t("Admin Decision", "قرار الإدارة")}</h3>
                <p className="page-sub mini">{t("Decision", "القرار")}: {dispute.admin_decision ? pretty(dispute.admin_decision) : t("Pending", "قيد الانتظار")}</p>
                <p className="page-sub mini">{t("Note", "الملاحظة")}: {dispute.admin_note || t("No admin note yet.", "لا توجد ملاحظة من الإدارة بعد.")}</p>
                <p className="page-sub mini">{t("Resolved at", "تم الحل بتاريخ")}: {dispute.resolved_at ? new Date(dispute.resolved_at).toLocaleString() : t("Not resolved", "لم يتم الحل بعد")}</p>
                <Link href={`/bookings/${dispute.booking}`} className="btn btn-outline">
                  {t("Open Booking", "فتح الحجز")}
                </Link>
              </article>
            </section>

            <section className="panel">
              <h2 className="section-title">{t("Evidence", "الأدلة")}</h2>
              {dispute.evidence_items.length === 0 ? (
                <p className="page-sub mini">{t("No evidence uploaded yet.", "لا توجد أدلة مرفوعة بعد.")}</p>
              ) : (
                <div className="evidence-grid">
                  {dispute.evidence_items.map((item) => (
                    <article key={item.id} className="evidence-card">
                      <p className="page-sub mini">{t("By", "بواسطة")} {item.uploader_name || t("User", "مستخدم")}</p>
                      <p className="page-sub mini">{item.note || t("No note", "لا توجد ملاحظة")}</p>
                      {item.resolved_file_url ? (
                        <a className="inline-link" href={item.resolved_file_url} target="_blank" rel="noreferrer">
                          {t("Open evidence", "فتح الدليل")}
                        </a>
                      ) : (
                        <span className="page-sub mini">{t("No file link", "لا يوجد رابط ملف")}</span>
                      )}
                      <p className="page-sub mini">{new Date(item.created_at).toLocaleString()}</p>
                    </article>
                  ))}
                </div>
              )}
            </section>

            {dispute.status !== "RESOLVED" ? (
              <section className="panel">
                <h2 className="section-title">{t("Add Evidence", "إضافة دليل")}</h2>
                <form className="form-grid" onSubmit={handleAddEvidence}>
                  <label className="field">
                    {t("Evidence URL (optional)", "رابط الدليل (اختياري)")}
                    <input
                      className="input"
                      value={evidenceUrl}
                      onChange={(event) => setEvidenceUrl(event.target.value)}
                      placeholder="https://..."
                    />
                  </label>

                  <label className="field">
                    {t("Evidence File (optional)", "ملف الدليل (اختياري)")}
                    <input
                      className="input"
                      type="file"
                      onChange={(event) => setEvidenceFile(event.target.files?.[0] ?? null)}
                    />
                  </label>

                  <label className="field">
                    {t("Note (optional)", "ملاحظة (اختياري)")}
                    <textarea className="textarea" rows={3} value={evidenceNote} onChange={(event) => setEvidenceNote(event.target.value)} />
                  </label>

                  <p className="page-sub mini">{t("Upload a file, paste a URL, or use both.", "يمكنك رفع ملف أو إضافة رابط أو استخدام الاثنين.")}</p>

                  <button className="btn btn-primary" type="submit" disabled={saving}>
                    {saving ? t("Uploading...", "جاري الرفع...") : t("Add Evidence", "إضافة الدليل")}
                  </button>
                </form>
              </section>
            ) : null}
          </>
        ) : null}
      </main>
    </div>
  );
}
