"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import AppTopNav from "@/components/AppTopNav";
import { useLanguage } from "@/components/LanguageProvider";
import {
  Booking,
  BookingStatusEvent,
  PaymentMethod,
  Review,
  cancelBooking,
  createReview,
  createThread,
  getBooking,
  getErrorMessage,
  getMe,
  initializePesapalPayment,
  listBookingEvents,
  listReviews,
  logout,
  updateBookingStatus,
  verifyPesapalPayment,
} from "@/lib/api";
import { clearAuth, getAuthToken, setStoredUser } from "@/lib/auth-client";
import { withLocale } from "@/lib/i18n";

const STATUS_TRANSITIONS: Record<string, string[]> = {
  REQUESTED: ["ACCEPTED", "REJECTED", "CANCELLED"],
  ACCEPTED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"]
};

const FINAL_STATUSES = new Set(["COMPLETED", "CANCELLED", "REJECTED"]);

function pretty(value: string) {
  return value.replaceAll("_", " ");
}

export default function BookingDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale } = useLanguage();
  const t = (enText: string, arText: string) => withLocale(locale, enText, arText);
  const bookingId = useMemo(() => Number.parseInt(params.id ?? "", 10), [params.id]);
  const hasAutoVerifiedRef = useRef(false);

  const [role, setRole] = useState<"CUSTOMER" | "PROVIDER" | "ADMIN" | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [events, setEvents] = useState<BookingStatusEvent[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);

  const [cancelReason, setCancelReason] = useState("");
  const [reviewRating, setReviewRating] = useState("5");
  const [reviewComment, setReviewComment] = useState("");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>("CARD");

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadBookingData() {
    setLoading(true);
    setError(null);

    try {
      if (Number.isNaN(bookingId)) {
        throw new Error(t("Invalid booking id.", "معرّف الحجز غير صالح."));
      }

      const token = getAuthToken();
      if (!token) {
        router.replace("/signin");
        return;
      }

      const [me, bookingData, eventData, reviewData] = await Promise.all([
        getMe(token),
        getBooking(token, bookingId),
        listBookingEvents(token, bookingId),
        listReviews({ booking: bookingId })
      ]);

      setStoredUser(me);
      setRole(me.role);
      setBooking(bookingData);
      setEvents(eventData);
      setReviews(reviewData.results);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBookingData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

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

  async function handleCancelBooking() {
    if (!booking) {
      return;
    }

    setActionLoading("cancel");
    setError(null);
    setMessage(null);

    try {
      const token = getAuthToken();
      if (!token) {
        throw new Error(t("Please sign in first.", "يرجى تسجيل الدخول أولاً."));
      }

      await cancelBooking(token, booking.id, cancelReason || undefined);
      setMessage(t("Booking cancelled successfully.", "تم إلغاء الحجز بنجاح."));
      setCancelReason("");
      await loadBookingData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleStatusUpdate(nextStatus: string) {
    if (!booking) {
      return;
    }

    setActionLoading(`status-${nextStatus}`);
    setError(null);
    setMessage(null);

    try {
      const token = getAuthToken();
      if (!token) {
        throw new Error(t("Please sign in first.", "يرجى تسجيل الدخول أولاً."));
      }

      await updateBookingStatus(token, booking.id, nextStatus);
      setMessage(t(`Booking moved to ${pretty(nextStatus)}.`, `تم نقل الحجز إلى ${pretty(nextStatus)}.`));
      await loadBookingData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleOpenChat() {
    if (!booking) {
      return;
    }

    setActionLoading("chat");
    setError(null);

    try {
      const token = getAuthToken();
      if (!token) {
        throw new Error(t("Please sign in first.", "يرجى تسجيل الدخول أولاً."));
      }

      const thread = await createThread(token, booking.id);
      router.push(`/messages/${thread.id}`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSubmitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!booking) {
      return;
    }

    setActionLoading("review");
    setError(null);
    setMessage(null);

    try {
      const token = getAuthToken();
      if (!token) {
        throw new Error(t("Please sign in first.", "يرجى تسجيل الدخول أولاً."));
      }

      const rating = Number.parseInt(reviewRating, 10);
      if (Number.isNaN(rating) || rating < 1 || rating > 5) {
        throw new Error(t("Rating must be between 1 and 5.", "يجب أن يكون التقييم بين 1 و5."));
      }

      await createReview(token, {
        booking: booking.id,
        service: booking.service,
        rating,
        comment: reviewComment
      });

      setMessage(t("Review submitted successfully.", "تم إرسال التقييم بنجاح."));
      setReviewComment("");
      await loadBookingData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleStartPesapalPayment(methodOverride?: PaymentMethod) {
    if (!booking) {
      return;
    }

    const methodToUse = methodOverride ?? selectedPaymentMethod;
    setSelectedPaymentMethod(methodToUse);

    setActionLoading("payment-init");
    setError(null);
    setMessage(null);

    try {
      const token = getAuthToken();
      if (!token) {
        throw new Error(t("Please sign in first.", "يرجى تسجيل الدخول أولاً."));
      }

      const response = await initializePesapalPayment(token, booking.id, {
        payment_method: methodToUse
      });

      if (!response.redirect_url) {
        throw new Error(t("Checkout URL was not returned.", "لم يتم إرجاع رابط الدفع."));
      }

      window.location.href = response.redirect_url;
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleVerifyPayment(orderTrackingId?: string, merchantReference?: string, clearParams = false) {
    if (!booking) {
      return;
    }

    setActionLoading("payment-verify");
    setError(null);
    setMessage(null);

    try {
      const token = getAuthToken();
      if (!token) {
        throw new Error(t("Please sign in first.", "يرجى تسجيل الدخول أولاً."));
      }

      const response = await verifyPesapalPayment(token, booking.id, {
        order_tracking_id: orderTrackingId || booking.payment_reference,
        merchant_reference: merchantReference || booking.reference
      });

      if (response.event_type === "PENDING") {
        setMessage(t("Payment is still pending. Please check again in a moment.", "ما زال الدفع قيد الانتظار. يرجى التحقق مرة أخرى بعد قليل."));
      } else if (response.event_type === "PAYMENT_SUCCEEDED") {
        setMessage(t("Payment confirmed successfully. Escrow is now HELD.", "تم تأكيد الدفع بنجاح. حالة الضمان الآن محتجز."));
      } else if (response.event_type === "PAYMENT_REFUNDED") {
        setMessage(t("Payment was refunded.", "تم استرداد المبلغ."));
      } else {
        setMessage(t("Payment status updated.", "تم تحديث حالة الدفع."));
      }

      await loadBookingData();
      if (clearParams) {
        router.replace(`/bookings/${booking.id}`);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  const canCancel = useMemo(() => {
    if (!booking) {
      return false;
    }
    return !FINAL_STATUSES.has(booking.status);
  }, [booking]);

  const statusOptions = useMemo(() => {
    if (!booking || (role !== "PROVIDER" && role !== "ADMIN")) {
      return [];
    }
    return STATUS_TRANSITIONS[booking.status] ?? [];
  }, [booking, role]);

  const canSubmitReview = useMemo(() => {
    if (!booking || role !== "CUSTOMER") {
      return false;
    }
    return booking.status === "COMPLETED" && reviews.length === 0;
  }, [booking, reviews.length, role]);

  const chatEnabled = useMemo(() => {
    if (!booking) {
      return false;
    }

    const escrowReady = ["PAID", "HELD", "RELEASED"].includes(booking.escrow_status);
    const notCancelled = !["CANCELLED", "REJECTED"].includes(booking.status);
    return escrowReady && notCancelled;
  }, [booking]);

  const canSimulatePayment = useMemo(() => {
    if (!booking || role !== "CUSTOMER") {
      return false;
    }
    if (booking.status === "CANCELLED" || booking.status === "REJECTED") {
      return false;
    }
    return booking.escrow_status === "UNPAID" || booking.escrow_status === "FAILED";
  }, [booking, role]);

  useEffect(() => {
    if (!booking) {
      return;
    }
    const orderTrackingId = searchParams.get("OrderTrackingId");
    if (!orderTrackingId || hasAutoVerifiedRef.current) {
      return;
    }
    const merchantReference = searchParams.get("OrderMerchantReference") || booking.reference;
    hasAutoVerifiedRef.current = true;
    void handleVerifyPayment(orderTrackingId, merchantReference, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking, searchParams]);

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

      <main className="container page-container">
        <section className="panel">
          <h1 className="page-title">{t("Booking Details", "تفاصيل الحجز")}</h1>
          <p className="page-sub">{t("Manage booking progress, escrow state, messaging, disputes, and reviews.", "أدر تقدم الحجز وحالة الضمان والمحادثات والنزاعات والتقييمات.")}</p>
        </section>

        {loading ? <section className="panel">{t("Loading booking...", "جاري تحميل الحجز...")}</section> : null}
        {error ? <p className="notice error">{error}</p> : null}
        {message ? <p className="notice success">{message}</p> : null}

        {!loading && booking ? (
          <>
            <section className="panel detail-grid">
              <article className="summary-card">
                <h2 className="section-title">{booking.service_title}</h2>
                <p className="page-sub mini">{t("Reference", "المرجع")}: {booking.reference}</p>
                <p className="summary-price">
                  {booking.total_amount} {booking.service_currency}
                </p>

                <div className="meta-row">
                  <span className={`status-pill status-${booking.status.toLowerCase()}`}>{pretty(booking.status)}</span>
                  <span className={`status-pill status-${booking.escrow_status.toLowerCase()}`}>{pretty(booking.escrow_status)}</span>
                </div>

                <div className="meta-row">
                  <span>{t("Provider", "المزود")}: {booking.provider_name}</span>
                  <span>{t("Customer", "العميل")}: {booking.customer_name || t("Customer", "العميل")}</span>
                </div>

                <p className="page-sub mini">{t("Requested Language", "اللغة المطلوبة")}: {booking.requested_language || t("No preference", "لا يوجد تفضيل")}</p>
                <p className="page-sub mini">{t("Travel Date", "تاريخ السفر")}: {booking.travel_date || t("Not set", "غير محدد")}</p>
                <p className="page-sub mini">{t("Availability Slot", "موعد التوفر")}: {booking.availability_start_at ? `${new Date(booking.availability_start_at).toLocaleString()} - ${new Date(booking.availability_end_at || booking.availability_start_at).toLocaleString()}` : t("Not selected", "غير محدد")}</p>
                <p className="page-sub mini">{t("Payment Reference", "مرجع الدفع")}: {booking.payment_reference || t("Not created yet", "لم يتم إنشاؤه بعد")}</p>
              </article>

              <article className="panel compact-card">
                <h3 className="section-title">{t("Actions", "الإجراءات")}</h3>

                <div className="inline-actions-wrap">
                  {canCancel ? (
                    <>
                      <textarea
                        className="textarea"
                        rows={2}
                        value={cancelReason}
                        onChange={(event) => setCancelReason(event.target.value)}
                        placeholder={t("Cancellation reason (optional)", "سبب الإلغاء (اختياري)")}
                      />
                      <button className="btn btn-outline" onClick={() => void handleCancelBooking()} disabled={actionLoading === "cancel"}>
                        {actionLoading === "cancel" ? t("Cancelling...", "جاري الإلغاء...") : t("Cancel Booking", "إلغاء الحجز")}
                      </button>
                    </>
                  ) : (
                    <p className="page-sub mini">{t("This booking is in a final state and cannot be cancelled.", "هذا الحجز في حالة نهائية ولا يمكن إلغاؤه.")}</p>
                  )}

                  {statusOptions.length > 0 ? (
                    <>
                      <p className="page-sub mini">{t("Provider status transitions:", "تحويلات حالة المزود:")}</p>
                      <div className="inline-actions-wrap">
                        {statusOptions.map((nextStatus) => (
                          <button
                            key={nextStatus}
                            className="mini-btn"
                            onClick={() => void handleStatusUpdate(nextStatus)}
                            disabled={actionLoading === `status-${nextStatus}`}
                          >
                            {pretty(nextStatus)}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : null}

                  <button className="btn btn-primary" onClick={() => void handleOpenChat()} disabled={!chatEnabled || actionLoading === "chat"}>
                    {actionLoading === "chat" ? t("Opening...", "جاري الفتح...") : t("Open Chat", "فتح المحادثة")}
                  </button>
                  {!chatEnabled ? (
                    <p className="page-sub mini">{t("Messaging unlocks only after payment.", "تتفعّل المحادثة فقط بعد الدفع.")}</p>
                  ) : null}

                  {canSimulatePayment ? (
                    <div className="payment-box">
                      <p className="page-sub mini">
                        {t("Choose payment method", "اختر طريقة الدفع")}
                      </p>
                      <div className="payment-method-row">
                        <button
                          className={`mini-btn payment-option ${selectedPaymentMethod === "CARD" ? "payment-option-active" : ""}`}
                          onClick={() => void handleStartPesapalPayment("CARD")}
                          type="button"
                          disabled={actionLoading === "payment-init"}
                        >
                          💳 {t("Card Details", "بطاقة بنكية")}
                        </button>
                        <button
                          className={`mini-btn payment-option ${selectedPaymentMethod === "APPLE_PAY" ? "payment-option-active" : ""}`}
                          onClick={() => void handleStartPesapalPayment("APPLE_PAY")}
                          type="button"
                          disabled={actionLoading === "payment-init"}
                        >
                           {t("Apple Pay", "آبل باي")}
                        </button>
                        <button
                          className={`mini-btn payment-option ${selectedPaymentMethod === "MPESA" ? "payment-option-active" : ""}`}
                          onClick={() => void handleStartPesapalPayment("MPESA")}
                          type="button"
                          disabled={actionLoading === "payment-init"}
                        >
                          📲 M-Pesa
                        </button>
                      </div>
                      <button
                        className="btn btn-primary"
                        onClick={() => void handleStartPesapalPayment()}
                        disabled={actionLoading === "payment-init"}
                      >
                        {actionLoading === "payment-init"
                          ? t("Opening checkout...", "جاري فتح صفحة الدفع...")
                          : t("Pay with selected method", "ادفع بالطريقة المحددة")}
                      </button>
                      <button
                        className="btn btn-ghost"
                        onClick={() => void handleVerifyPayment()}
                        disabled={actionLoading === "payment-verify"}
                      >
                        {actionLoading === "payment-verify"
                          ? t("Checking...", "جاري التحقق...")
                          : t("Check Payment Status", "تحقق من حالة الدفع")}
                      </button>
                      <p className="page-sub mini">
                        {t(
                          "Checkout is handled by Pesapal. Available rails depend on your region and gateway support.",
                          "يتم الدفع عبر بيسابال. وسائل الدفع المتاحة تعتمد على المنطقة ودعم البوابة."
                        )}
                      </p>
                    </div>
                  ) : null}

                  <div className="quick-links">
                    <Link href={`/disputes?booking=${booking.id}`} className="btn btn-outline">
                      {t("Open Dispute", "فتح نزاع")}
                    </Link>
                    <Link href="/bookings" className="btn btn-ghost">
                      {t("Back to Bookings", "العودة للحجوزات")}
                    </Link>
                  </div>
                </div>
              </article>
            </section>

            <section className="panel">
              <h2 className="section-title">{t("Status Timeline", "الجدول الزمني للحالة")}</h2>
              {events.length === 0 ? (
                <p className="page-sub mini">{t("No status updates yet.", "لا توجد تحديثات حالة بعد.")}</p>
              ) : (
                <div className="timeline-list">
                  {events.map((entry) => (
                    <article key={entry.id} className="timeline-event">
                      <p>
                        <strong>{pretty(entry.from_status)}</strong> {"->"} <strong>{pretty(entry.to_status)}</strong>
                      </p>
                      <p className="page-sub mini">{entry.note || t("No note", "لا توجد ملاحظة")}</p>
                      <p className="page-sub mini">{new Date(entry.created_at).toLocaleString()}</p>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="panel">
              <h2 className="section-title">{t("Reviews", "التقييمات")}</h2>
              {reviews.length > 0 ? (
                <div className="review-list">
                  {reviews.map((review) => (
                    <article key={review.id} className="review-card">
                      <p className="rating-stars">{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</p>
                      <p className="page-sub mini">{review.comment || t("No written review.", "لا يوجد تعليق مكتوب.")}</p>
                      <p className="page-sub mini">{t("By", "بواسطة")} {review.customer_name || t("Customer", "العميل")}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="page-sub mini">{t("No review submitted yet.", "لا يوجد تقييم مرسل بعد.")}</p>
              )}

              {canSubmitReview ? (
                <form className="form-grid" onSubmit={handleSubmitReview}>
                  <label className="field">
                    {t("Rating", "التقييم")}
                    <select className="select" value={reviewRating} onChange={(event) => setReviewRating(event.target.value)}>
                      <option value="5">{t("5 - Excellent", "5 - ممتاز")}</option>
                      <option value="4">{t("4 - Good", "4 - جيد")}</option>
                      <option value="3">{t("3 - Fair", "3 - مقبول")}</option>
                      <option value="2">{t("2 - Weak", "2 - ضعيف")}</option>
                      <option value="1">{t("1 - Poor", "1 - سيئ")}</option>
                    </select>
                  </label>

                  <label className="field">
                    {t("Comment", "التعليق")}
                    <textarea
                      className="textarea"
                      rows={3}
                      value={reviewComment}
                      onChange={(event) => setReviewComment(event.target.value)}
                      placeholder={t("Share your experience", "شارك تجربتك")}
                    />
                  </label>

                  <button className="btn btn-primary" type="submit" disabled={actionLoading === "review"}>
                    {actionLoading === "review" ? t("Submitting...", "جاري الإرسال...") : t("Submit Review", "إرسال التقييم")}
                  </button>
                </form>
              ) : null}
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
