"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import AppTopNav from "@/components/AppTopNav";
import { useLanguage } from "@/components/LanguageProvider";
import {
  Booking,
  BookingStatusEvent,
  PaymentWebhookEvent,
  PaymentMethod,
  Review,
  cancelBooking,
  confirmBookingCompletion,
  createReview,
  createThread,
  getBooking,
  getErrorMessage,
  getMe,
  initializeStripePayment,
  listBookingPaymentEvents,
  listBookingEvents,
  listReviews,
  logout,
  updateBookingStatus,
  verifyStripePayment,
} from "@/lib/api";
import { clearAuth, getAuthToken, setStoredUser } from "@/lib/auth-client";
import { withLocale } from "@/lib/i18n";

const STATUS_TRANSITIONS: Record<string, string[]> = {
  REQUESTED: ["ACCEPTED", "REJECTED", "CANCELLED"],
  ACCEPTED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["CANCELLED"]
};

const FINAL_STATUSES = new Set(["COMPLETED", "CANCELLED", "REJECTED"]);

function pretty(value: string) {
  return value.replaceAll("_", " ");
}

type LifecycleStep = {
  id: string;
  label: string;
  done: boolean;
  at?: string | null;
};

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
  const [paymentEvents, setPaymentEvents] = useState<PaymentWebhookEvent[]>([]);
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

      const [me, bookingData, eventData, paymentEventData, reviewData] = await Promise.all([
        getMe(token),
        getBooking(token, bookingId),
        listBookingEvents(token, bookingId),
        listBookingPaymentEvents(token, bookingId),
        listReviews({ booking: bookingId })
      ]);

      setStoredUser(me);
      setRole(me.role);
      setBooking(bookingData);
      setEvents(eventData);
      setPaymentEvents(paymentEventData);
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

  async function handleConfirmCompletion() {
    if (!booking) {
      return;
    }

    setActionLoading("confirm-completion");
    setError(null);
    setMessage(null);

    try {
      const token = getAuthToken();
      if (!token) {
        throw new Error(t("Please sign in first.", "يرجى تسجيل الدخول أولاً."));
      }

      const updated = await confirmBookingCompletion(token, booking.id);
      const bothConfirmed = updated.provider_completed_confirmed_at && updated.customer_completed_confirmed_at;
      if (bothConfirmed) {
        setMessage(
          t(
            "Both confirmations received. Booking is completed and ready for admin escrow release.",
            "تم تسجيل تأكيد الطرفين. الحجز مكتمل وجاهز لإفراج الإدارة عن الضمان."
          )
        );
      } else {
        setMessage(
          t(
            "Your completion confirmation has been recorded. Waiting for the other party.",
            "تم تسجيل تأكيد الإكمال الخاص بك. بانتظار تأكيد الطرف الآخر."
          )
        );
      }
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

  async function handleStartStripePayment(methodOverride?: PaymentMethod) {
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

      const response = await initializeStripePayment(token, booking.id, {
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

      const sessionId = orderTrackingId || booking.payment_reference;
      const response = await verifyStripePayment(token, booking.id, {
        checkout_session_id: sessionId,
        order_tracking_id: sessionId,
        merchant_reference: merchantReference || booking.reference,
        booking_reference: booking.reference,
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

  const canInitiatePayment = useMemo(() => {
    if (!booking || role !== "CUSTOMER") {
      return false;
    }
    if (["CANCELLED", "REJECTED", "COMPLETED"].includes(booking.status)) {
      return false;
    }
    return booking.escrow_status === "UNPAID" || booking.escrow_status === "FAILED";
  }, [booking, role]);

  const canConfirmCompletion = useMemo(() => {
    if (!booking || !role) {
      return false;
    }
    if (!["PAID", "HELD", "RELEASED"].includes(booking.escrow_status)) {
      return false;
    }
    if (["CANCELLED", "REJECTED"].includes(booking.status) || booking.status === "REQUESTED") {
      return false;
    }
    if (role === "CUSTOMER") {
      return !booking.customer_completed_confirmed_at;
    }
    if (role === "PROVIDER") {
      return !booking.provider_completed_confirmed_at;
    }
    return false;
  }, [booking, role]);

  const needsOtherPartyConfirmation = useMemo(() => {
    if (!booking || !role) {
      return false;
    }
    if (role === "CUSTOMER") {
      return Boolean(booking.customer_completed_confirmed_at) && !booking.provider_completed_confirmed_at;
    }
    if (role === "PROVIDER") {
      return Boolean(booking.provider_completed_confirmed_at) && !booking.customer_completed_confirmed_at;
    }
    return false;
  }, [booking, role]);

  const lifecycleSteps: LifecycleStep[] = (() => {
    if (!booking) {
      return [];
    }

    const paymentDone = ["PAID", "HELD", "RELEASED", "REFUNDED"].includes(booking.escrow_status);
    const acceptedDone = ["ACCEPTED", "IN_PROGRESS", "COMPLETED"].includes(booking.status);
    const inProgressDone = ["IN_PROGRESS", "COMPLETED"].includes(booking.status);
    const completedDone = booking.status === "COMPLETED";
    const escrowReleasedDone = booking.escrow_status === "RELEASED";

    return [
      {
        id: "requested",
        label: t("Booking requested", "تم إرسال طلب الحجز"),
        done: true,
        at: booking.created_at,
      },
      {
        id: "paid",
        label: t("Payment held in escrow", "تم حجز الدفع في الضمان"),
        done: paymentDone,
      },
      {
        id: "accepted",
        label: t("Provider accepted booking", "وافق المزود على الحجز"),
        done: acceptedDone,
      },
      {
        id: "in_progress",
        label: t("Service in progress", "الخدمة قيد التنفيذ"),
        done: inProgressDone,
      },
      {
        id: "completed",
        label: t("Both parties confirmed completion", "أكد الطرفان اكتمال الخدمة"),
        done: completedDone && Boolean(booking.provider_completed_confirmed_at && booking.customer_completed_confirmed_at),
        at: booking.completed_at,
      },
      {
        id: "escrow_released",
        label: t("Escrow released by admin", "تم إفراج الضمان بواسطة الإدارة"),
        done: escrowReleasedDone,
      },
      {
        id: "payout_window",
        label: t("Provider payout window: 24-48h (anti-fraud)", "نافذة سحب المزود: 24-48 ساعة (مكافحة احتيال)"),
        done: escrowReleasedDone,
      },
    ];
  })();

  useEffect(() => {
    if (!booking) {
      return;
    }
    const orderTrackingId = searchParams.get("session_id") || searchParams.get("OrderTrackingId");
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
                <div className="price-breakdown">
                  <p className="page-sub mini">
                    {t("Subtotal", "المبلغ الأساسي")}: {booking.subtotal_amount} {booking.service_currency}
                  </p>
                  <p className="page-sub mini">
                    {t("Platform Fee (4%)", "رسوم المنصة (4٪)")}: {booking.platform_fee} {booking.service_currency}
                  </p>
                </div>

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
                <p className="page-sub mini">
                  {t("Provider completion", "تأكيد المزود للإكمال")}:{" "}
                  {booking.provider_completed_confirmed_at ? new Date(booking.provider_completed_confirmed_at).toLocaleString() : t("Pending", "قيد الانتظار")}
                </p>
                <p className="page-sub mini">
                  {t("Customer completion", "تأكيد العميل للإكمال")}:{" "}
                  {booking.customer_completed_confirmed_at ? new Date(booking.customer_completed_confirmed_at).toLocaleString() : t("Pending", "قيد الانتظار")}
                </p>
                {booking.status === "REQUESTED" && booking.acceptance_deadline_at ? (
                  <p className="page-sub mini">
                    {t("Provider acceptance deadline", "الموعد النهائي لقبول المزود")}:{" "}
                    {new Date(booking.acceptance_deadline_at).toLocaleString()}
                  </p>
                ) : null}
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

                  {canInitiatePayment ? (
                    <div className="payment-box">
                      <div className="price-breakdown">
                        <p className="page-sub mini">
                          {t("Subtotal", "المبلغ الأساسي")}: {booking.subtotal_amount} {booking.service_currency}
                        </p>
                        <p className="page-sub mini">
                          {t("Platform Fee (4%)", "رسوم المنصة (4٪)")}: {booking.platform_fee} {booking.service_currency}
                        </p>
                        <p className="page-sub mini">
                          {t("Total to pay", "إجمالي الدفع")}: {booking.total_amount} {booking.service_currency}
                        </p>
                      </div>
                      <p className="page-sub mini">
                        {t("Choose payment method", "اختر طريقة الدفع")}
                      </p>
                      <div className="payment-method-row">
                        <button
                          className={`mini-btn payment-option ${selectedPaymentMethod === "CARD" ? "payment-option-active" : ""}`}
                          onClick={() => void handleStartStripePayment("CARD")}
                          type="button"
                          disabled={actionLoading === "payment-init"}
                        >
                          💳 {t("Card Details", "بطاقة بنكية")}
                        </button>
                        <button
                          className={`mini-btn payment-option ${selectedPaymentMethod === "APPLE_PAY" ? "payment-option-active" : ""}`}
                          onClick={() => void handleStartStripePayment("APPLE_PAY")}
                          type="button"
                          disabled={actionLoading === "payment-init"}
                        >
                           {t("Apple Pay", "آبل باي")}
                        </button>
                      </div>
                      <button
                        className="btn btn-primary"
                        onClick={() => void handleStartStripePayment()}
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
                          "You can pay before provider acceptance. Provider has 24 hours to accept before auto-cancellation.",
                          "يمكنك الدفع قبل قبول المزود. لدى المزود 24 ساعة للقبول قبل الإلغاء التلقائي."
                        )}
                      </p>
                      <p className="page-sub mini">
                        {t(
                          "Checkout is handled by Stripe. Apple Pay appears automatically when available on the device/browser.",
                          "يتم الدفع عبر Stripe. يظهر Apple Pay تلقائياً عند توفره على الجهاز والمتصفح."
                        )}
                      </p>
                    </div>
                  ) : null}

                  {canConfirmCompletion ? (
                    <button
                      className="btn btn-primary"
                      onClick={() => void handleConfirmCompletion()}
                      disabled={actionLoading === "confirm-completion"}
                    >
                      {actionLoading === "confirm-completion"
                        ? t("Saving...", "جاري الحفظ...")
                        : t("Confirm Service Completed", "تأكيد اكتمال الخدمة")}
                    </button>
                  ) : null}
                  {needsOtherPartyConfirmation ? (
                    <p className="page-sub mini">
                      {t(
                        "Your completion confirmation is saved. Waiting for the other party before admin can release escrow.",
                        "تم حفظ تأكيد الإكمال الخاص بك. ننتظر الطرف الآخر قبل أن تتمكن الإدارة من إفراج الضمان."
                      )}
                    </p>
                  ) : null}
                  {booking.ready_for_escrow_release ? (
                    <p className="page-sub mini">
                      {t(
                        "Both confirmations are complete. Admin can now release escrow.",
                        "اكتمل تأكيد الطرفين. يمكن للإدارة الآن إفراج الضمان."
                      )}
                    </p>
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
              <h2 className="section-title">{t("Service Lifecycle", "دورة الخدمة")}</h2>
              <div className="timeline-list">
                {lifecycleSteps.map((step) => (
                  <article key={step.id} className="timeline-event">
                    <p>
                      <strong>{step.done ? "✓" : "•"}</strong> {step.label}
                    </p>
                    {step.at ? <p className="page-sub mini">{new Date(step.at).toLocaleString()}</p> : null}
                  </article>
                ))}
              </div>
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
              <h2 className="section-title">{t("Payment Activity", "نشاط الدفع")}</h2>
              {paymentEvents.length === 0 ? (
                <p className="page-sub mini">{t("No payment events yet.", "لا توجد أحداث دفع بعد.")}</p>
              ) : (
                <div className="timeline-list">
                  {paymentEvents.map((entry) => (
                    <article key={entry.id} className="timeline-event">
                      <p>
                        <strong>{pretty(entry.event_type)}</strong>
                      </p>
                      <p className="page-sub mini">
                        {t("Reference", "المرجع")}: {entry.external_reference || t("Not available", "غير متوفر")}
                      </p>
                      <p className="page-sub mini">{new Date(entry.processed_at || entry.received_at).toLocaleString()}</p>
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
