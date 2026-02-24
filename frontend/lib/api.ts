const API_BASE_FROM_ENV = process.env.NEXT_PUBLIC_API_BASE_URL;

export function resolveApiBaseUrl() {
  if (API_BASE_FROM_ENV && API_BASE_FROM_ENV.length > 0) {
    return API_BASE_FROM_ENV;
  }

  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:8000/api`;
  }

  return "http://127.0.0.1:8000/api";
}

export type UserRole = "CUSTOMER" | "PROVIDER" | "ADMIN";
export type ServiceType = "UMRAH_BADAL" | "ZIYARAH_GUIDE" | "UMRAH_ASSISTANT";
export type CityScope = "MAKKAH" | "MADINAH";
export type PaymentMethod = "CARD" | "APPLE_PAY" | "MPESA";

export interface ApiUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  role: UserRole;
  is_banned: boolean;
  is_active: boolean;
  is_staff: boolean;
  is_superuser: boolean;
}

export interface AuthResponse {
  token: string;
  user: ApiUser;
}

export interface ProviderProfile {
  id: number;
  professional_name: string;
  bio: string;
  city: string;
  languages: string[];
  profile_photo_url: string;
  years_experience: number;
  rating_average: string;
  total_reviews: number;
  is_accepting_bookings: boolean;
  verification_status: string;
  services_count: number;
}

export interface Service {
  id: number;
  provider: number;
  provider_name: string;
  provider_rating: string;
  provider_photo_url: string;
  service_type: ServiceType;
  title: string;
  description: string;
  city_scope: CityScope;
  languages: string[];
  price_amount: string;
  currency: string;
  duration_hours: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Booking {
  id: number;
  reference: string;
  customer: number;
  customer_name: string;
  provider: number;
  provider_name: string;
  service: number;
  service_title: string;
  service_currency: string;
  availability_slot: number | null;
  availability_start_at: string | null;
  availability_end_at: string | null;
  requested_language: string;
  travel_date: string | null;
  notes: string;
  status: string;
  escrow_status: string;
  subtotal_amount: string;
  platform_fee: string;
  total_amount: string;
  payment_reference: string;
  cancellation_reason: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookingStatusEvent {
  id: number;
  from_status: string;
  to_status: string;
  note: string;
  changed_by: number | null;
  created_at: string;
}

export interface PesapalInitializeResponse {
  booking_id: number;
  merchant_reference: string;
  order_tracking_id: string;
  redirect_url: string;
  payment_method: PaymentMethod;
  provider: "PESAPAL";
  webhook_url: string;
}

export interface PesapalVerifyResponse {
  detail: string;
  booking_id: number;
  merchant_reference: string;
  order_tracking_id: string;
  payment_status: string;
  event_type: string;
  escrow_status: string;
  booking_status: string;
  provider: "PESAPAL";
}

export interface BookingThread {
  id: number;
  booking: number;
  booking_reference: string;
  customer: number;
  provider: number;
  provider_name: string;
  is_closed: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: number;
  thread: number;
  sender: number;
  sender_name: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

export interface DisputeEvidence {
  id: number;
  file_url: string;
  file_upload: string | null;
  resolved_file_url: string;
  note: string;
  uploaded_by: number;
  uploader_name: string;
  created_at: string;
}

export interface Dispute {
  id: number;
  booking: number;
  booking_reference: string;
  opened_by: number;
  opened_by_name: string;
  status: string;
  requested_resolution: "REFUND" | "RELEASE" | "PARTIAL" | "OTHER";
  reason: string;
  admin_decision: string;
  admin_note: string;
  resolved_by: number | null;
  resolved_at: string | null;
  evidence_items: DisputeEvidence[];
  created_at: string;
  updated_at: string;
}

export interface Review {
  id: number;
  booking: number | null;
  service: number;
  provider: number;
  provider_name: string;
  customer: number;
  customer_name: string;
  rating: number;
  comment: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProviderAvailability {
  id: number;
  provider: number;
  provider_name: string;
  service_type: ServiceType;
  city_scope: CityScope;
  languages: string[];
  start_at: string;
  end_at: string;
  is_available: boolean;
  booked_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface AdminProviderProfile {
  id: number;
  user: ApiUser;
  professional_name: string;
  bio: string;
  city: string;
  base_locations: string[];
  supported_languages: string[];
  profile_photo_url: string;
  years_experience: number;
  credentials_summary: string;
  is_accepting_bookings: boolean;
  verification_status: string;
  rating_average: string;
  total_reviews: number;
  created_at: string;
  updated_at: string;
}

export interface NotificationItem {
  id: number;
  event_type: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  is_read: boolean;
  read_at: string | null;
  actor: number | null;
  actor_name: string;
  created_at: string;
}

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export class ApiError extends Error {
  status: number;
  data?: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const data = error.data as Record<string, unknown> | undefined;
    const detail = data?.detail;
    if (typeof detail === "string" && detail.length > 0) {
      const lowered = detail.toLowerCase();
      if (
        lowered.includes("load failed") ||
        lowered.includes("failed to fetch") ||
        lowered.includes("networkerror")
      ) {
        return `Cannot reach backend API. Make sure Django is running at ${resolveApiBaseUrl()}.`;
      }
      return detail;
    }
    if (data && typeof data === "object") {
      const firstEntry = Object.values(data)[0];
      if (Array.isArray(firstEntry) && typeof firstEntry[0] === "string") {
        return firstEntry[0];
      }
      if (typeof firstEntry === "string") {
        return firstEntry;
      }
    }
    return `${error.message} (HTTP ${error.status})`;
  }

  if (error instanceof Error) {
    const lowered = error.message.toLowerCase();
    if (lowered.includes("load failed") || lowered.includes("failed to fetch")) {
      return `Cannot reach backend API. Make sure Django is running at ${resolveApiBaseUrl()}.`;
    }
    return error.message;
  }

  return "Something went wrong. Please try again.";
}

function toQueryString(params: Record<string, string | number | undefined | null>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && `${value}`.length > 0) {
      search.set(key, String(value));
    }
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

async function request<T>(
  path: string,
  options: {
    method?: Method;
    token?: string;
    body?: unknown;
    formData?: FormData;
  } = {}
): Promise<T> {
  const { method = "GET", token, body, formData } = options;
  const apiBaseUrl = resolveApiBaseUrl();
  const headers: Record<string, string> = {
    Accept: "application/json"
  };

  if (token) {
    headers.Authorization = `Token ${token}`;
  }

  const init: RequestInit = {
    method,
    headers,
    cache: "no-store"
  };

  if (body !== undefined && formData !== undefined) {
    throw new ApiError("Cannot send both JSON body and form data.", 0);
  }

  if (formData !== undefined) {
    init.body = formData;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, init);
  } catch (error) {
    throw new ApiError(
      `Cannot reach backend API at ${apiBaseUrl}. Make sure Django is running.`,
      0,
      { detail: error instanceof Error ? error.message : "Network request failed." }
    );
  }

  const raw = await response.text();
  let data: unknown;
  if (raw) {
    try {
      data = JSON.parse(raw) as unknown;
    } catch {
      data = { detail: raw.slice(0, 500) };
    }
  }

  if (!response.ok) {
    throw new ApiError(response.statusText || "Request failed", response.status, data);
  }

  return data as T;
}

export function login(payload: { username_or_email: string; password: string }) {
  return request<AuthResponse>("/auth/login/", { method: "POST", body: payload });
}

export function loginCustomer(payload: { username_or_email: string; password: string }) {
  return request<AuthResponse>("/auth/login/customer/", { method: "POST", body: payload });
}

export function loginProvider(payload: { username_or_email: string; password: string }) {
  return request<AuthResponse>("/auth/login/provider/", { method: "POST", body: payload });
}

export function logout(token: string) {
  return request<{ detail: string }>("/auth/logout/", { method: "POST", token });
}

export function registerCustomer(payload: {
  username: string;
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  preferred_languages?: string[];
  country?: string;
  city?: string;
}) {
  return request<AuthResponse>("/auth/register/customer/", { method: "POST", body: payload });
}

export function registerProvider(payload: {
  username: string;
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  professional_name: string;
  bio?: string;
  city?: string;
  base_locations?: string[];
  supported_languages?: string[];
  years_experience?: number;
  credentials_summary?: string;
  profile_photo: File;
}) {
  const { profile_photo, ...rest } = payload;
  const formData = new FormData();
  Object.entries(rest).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => formData.append(key, String(item)));
      return;
    }
    formData.append(key, String(value));
  });
  formData.append("profile_photo", profile_photo);
  return request<AuthResponse>("/auth/register/provider/", { method: "POST", formData });
}

export function getMe(token: string) {
  return request<ApiUser>("/auth/me/", { token });
}

export function getMyProviderProfile(token: string) {
  return request<AdminProviderProfile>("/auth/provider/profile/", { token });
}

export function updateMyProviderProfile(
  token: string,
  payload: Partial<{
    professional_name: string;
    bio: string;
    city: string;
    base_locations: string[];
    supported_languages: string[];
    years_experience: number;
    credentials_summary: string;
    is_accepting_bookings: boolean;
    profile_photo: File | null;
    remove_profile_photo: boolean;
  }>
) {
  const shouldUseFormData = payload.profile_photo instanceof File || payload.remove_profile_photo === true;
  if (shouldUseFormData) {
    const formData = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") {
        return;
      }
      if (key === "profile_photo" && value instanceof File) {
        formData.append("profile_photo", value);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((item) => formData.append(key, String(item)));
        return;
      }
      formData.append(key, String(value));
    });
    return request<AdminProviderProfile>("/auth/provider/profile/", { method: "PATCH", token, formData });
  }
  return request<AdminProviderProfile>("/auth/provider/profile/", { method: "PATCH", token, body: payload });
}

export function listProviders(filters: { language?: string; city?: string; service_type?: ServiceType } = {}) {
  const query = toQueryString(filters);
  return request<PaginatedResponse<ProviderProfile>>(`/marketplace/providers/${query}`);
}

export function getProvider(providerId: number) {
  return request<ProviderProfile>(`/marketplace/providers/${providerId}/`);
}

export function listServices(
  filters: {
    service_type?: ServiceType;
    city_scope?: CityScope;
    language?: string;
    max_price?: number;
    provider?: number;
    mine?: 1;
  } = {},
  token?: string
) {
  const query = toQueryString(filters);
  return request<PaginatedResponse<Service>>(`/marketplace/services/${query}`, { token });
}

export function getService(serviceId: number) {
  return request<Service>(`/marketplace/services/${serviceId}/`);
}

export function createBooking(
  token: string,
  payload: {
    service: number;
    availability_slot?: number;
    requested_language?: string;
    travel_date?: string;
    notes?: string;
  }
) {
  return request<Booking>("/bookings/", { method: "POST", token, body: payload });
}

export function listMyBookings(token: string) {
  return request<PaginatedResponse<Booking>>("/bookings/", { token });
}

export function getBooking(token: string, bookingId: number) {
  return request<Booking>(`/bookings/${bookingId}/`, { token });
}

export function listBookingEvents(token: string, bookingId: number) {
  return request<BookingStatusEvent[]>(`/bookings/${bookingId}/events/`, { token });
}

export function cancelBooking(token: string, bookingId: number, reason?: string) {
  return request<Booking>(`/bookings/${bookingId}/cancel/`, {
    method: "POST",
    token,
    body: { reason: reason ?? "" }
  });
}

export function updateBookingStatus(token: string, bookingId: number, status: string, note?: string) {
  return request<Booking>(`/bookings/${bookingId}/update_status/`, {
    method: "POST",
    token,
    body: { status, note: note ?? "" }
  });
}

export function createService(
  token: string,
  payload: {
    service_type: ServiceType;
    title: string;
    description: string;
    city_scope: CityScope;
    languages: string[];
    price_amount: number;
    currency?: string;
    duration_hours?: number;
    is_active?: boolean;
  }
) {
  return request<Service>("/marketplace/services/", {
    method: "POST",
    token,
    body: {
      currency: "USD",
      duration_hours: 2,
      is_active: true,
      ...payload
    }
  });
}

export function updateService(
  token: string,
  serviceId: number,
  payload: Partial<{
    service_type: ServiceType;
    title: string;
    description: string;
    city_scope: CityScope;
    languages: string[];
    price_amount: number;
    currency: string;
    duration_hours: number;
    is_active: boolean;
  }>
) {
  return request<Service>(`/marketplace/services/${serviceId}/`, { method: "PATCH", token, body: payload });
}

export function deleteService(token: string, serviceId: number) {
  return request<void>(`/marketplace/services/${serviceId}/`, { method: "DELETE", token });
}

export function listAvailability(
  filters: {
    provider?: number;
    service_type?: ServiceType;
    city_scope?: CityScope;
    language?: string;
    date_from?: string;
    date_to?: string;
    available?: 1;
    mine?: 1;
  } = {},
  token?: string
) {
  const query = toQueryString(filters);
  return request<PaginatedResponse<ProviderAvailability>>(`/marketplace/availability/${query}`, { token });
}

export function createAvailability(
  token: string,
  payload: {
    service_type: ServiceType;
    city_scope: CityScope;
    languages?: string[];
    start_at: string;
    end_at: string;
    is_available?: boolean;
  }
) {
  return request<ProviderAvailability>("/marketplace/availability/", {
    method: "POST",
    token,
    body: {
      languages: [],
      is_available: true,
      ...payload,
    },
  });
}

export function updateAvailability(
  token: string,
  availabilityId: number,
  payload: Partial<{
    service_type: ServiceType;
    city_scope: CityScope;
    languages: string[];
    start_at: string;
    end_at: string;
    is_available: boolean;
  }>
) {
  return request<ProviderAvailability>(`/marketplace/availability/${availabilityId}/`, {
    method: "PATCH",
    token,
    body: payload,
  });
}

export function deleteAvailability(token: string, availabilityId: number) {
  return request<void>(`/marketplace/availability/${availabilityId}/`, { method: "DELETE", token });
}

export function listReviews(filters: { provider?: number; service?: number; booking?: number } = {}) {
  const query = toQueryString(filters);
  return request<PaginatedResponse<Review>>(`/marketplace/reviews/${query}`);
}

export function createReview(
  token: string,
  payload: { booking: number; service: number; rating: number; comment?: string; is_public?: boolean }
) {
  return request<Review>("/marketplace/reviews/", {
    method: "POST",
    token,
    body: {
      is_public: true,
      comment: "",
      ...payload
    }
  });
}

export function listThreads(token: string) {
  return request<PaginatedResponse<BookingThread>>("/messaging/threads/", { token });
}

export function createThread(token: string, booking: number) {
  return request<BookingThread>("/messaging/threads/", { method: "POST", token, body: { booking } });
}

export function getThread(token: string, threadId: number) {
  return request<BookingThread>(`/messaging/threads/${threadId}/`, { token });
}

export function listMessages(token: string, thread?: number) {
  const query = toQueryString({ thread });
  return request<PaginatedResponse<ChatMessage>>(`/messaging/messages/${query}`, { token });
}

export function sendMessage(token: string, payload: { thread: number; body: string }) {
  return request<ChatMessage>("/messaging/messages/", { method: "POST", token, body: payload });
}

export function markMessageRead(token: string, messageId: number) {
  return request<ChatMessage>(`/messaging/messages/${messageId}/mark_read/`, { method: "POST", token });
}

export function listDisputes(token: string) {
  return request<PaginatedResponse<Dispute>>("/disputes/", { token });
}

export function getDispute(token: string, disputeId: number) {
  return request<Dispute>(`/disputes/${disputeId}/`, { token });
}

export function createDispute(
  token: string,
  payload: { booking: number; requested_resolution: "REFUND" | "RELEASE" | "PARTIAL" | "OTHER"; reason: string }
) {
  return request<Dispute>("/disputes/", { method: "POST", token, body: payload });
}

export function addDisputeEvidence(token: string, disputeId: number, payload: { file_url: string; note?: string }) {
  return request<DisputeEvidence>(`/disputes/${disputeId}/add_evidence/`, {
    method: "POST",
    token,
    body: payload
  });
}

export function addDisputeEvidenceUpload(
  token: string,
  disputeId: number,
  payload: { file: File; note?: string }
) {
  const formData = new FormData();
  formData.append("file_upload", payload.file);
  if (payload.note) {
    formData.append("note", payload.note);
  }
  return request<DisputeEvidence>(`/disputes/${disputeId}/add_evidence/`, {
    method: "POST",
    token,
    formData,
  });
}

export function simulatePaymentSucceeded(bookingId: number, paymentReference?: string) {
  return request<{ detail: string; booking_found: boolean }>("/bookings/webhook/", {
    method: "POST",
    body: {
      event_type: "PAYMENT_SUCCEEDED",
      booking_id: bookingId,
      payment_reference: paymentReference ?? `demo-${bookingId}-${Date.now()}`,
      payload: {
        source: "frontend-demo"
      }
    }
  });
}

export function initializePesapalPayment(
  token: string,
  bookingId: number,
  payload: {
    payment_method: PaymentMethod;
    callback_url?: string;
  }
) {
  return request<PesapalInitializeResponse>(`/bookings/${bookingId}/pesapal_initialize/`, {
    method: "POST",
    token,
    body: payload,
  });
}

export function verifyPesapalPayment(
  token: string,
  bookingId: number,
  payload: {
    order_tracking_id?: string;
    merchant_reference?: string;
  } = {}
) {
  return request<PesapalVerifyResponse>(`/bookings/${bookingId}/pesapal_verify/`, {
    method: "POST",
    token,
    body: payload,
  });
}

export function releaseEscrow(token: string, bookingId: number) {
  return request<Booking>(`/bookings/${bookingId}/release_escrow/`, { method: "POST", token });
}

export function adminRefundBooking(token: string, bookingId: number) {
  return request<Booking>(`/bookings/${bookingId}/admin_refund/`, { method: "POST", token });
}

export function listAdminProviders(token: string, status?: string) {
  const query = toQueryString({ status });
  return request<PaginatedResponse<AdminProviderProfile>>(`/auth/admin/providers/${query}`, { token });
}

export function approveAdminProvider(token: string, providerId: number) {
  return request<AdminProviderProfile>(`/auth/admin/providers/${providerId}/approve/`, { method: "POST", token });
}

export function rejectAdminProvider(token: string, providerId: number, reason?: string) {
  return request<AdminProviderProfile>(`/auth/admin/providers/${providerId}/reject/`, {
    method: "POST",
    token,
    body: { reason: reason ?? "" },
  });
}

export function banAdminProvider(token: string, providerId: number) {
  return request<{ detail: string }>(`/auth/admin/providers/${providerId}/ban_user/`, { method: "POST", token });
}

export function listAdminUsers(token: string, filters: { role?: UserRole; banned?: 0 | 1 } = {}) {
  const query = toQueryString(filters);
  return request<PaginatedResponse<ApiUser>>(`/auth/admin/users/${query}`, { token });
}

export function banAdminUser(token: string, userId: number) {
  return request<ApiUser>(`/auth/admin/users/${userId}/ban/`, { method: "POST", token });
}

export function unbanAdminUser(token: string, userId: number) {
  return request<ApiUser>(`/auth/admin/users/${userId}/unban/`, { method: "POST", token });
}

export function moveDisputeToReview(token: string, disputeId: number) {
  return request<Dispute>(`/disputes/${disputeId}/move_to_review/`, { method: "POST", token });
}

export function decideDispute(
  token: string,
  disputeId: number,
  payload: {
    decision:
      | "APPROVE_REFUND"
      | "APPROVE_RELEASE"
      | "PARTIAL_REMEDY"
      | "REJECT_CLAIM";
    note?: string;
  }
) {
  return request<Dispute>(`/disputes/${disputeId}/admin_decision/`, {
    method: "POST",
    token,
    body: payload,
  });
}

export function listNotifications(token: string, filters: { unread?: 1 } = {}) {
  const query = toQueryString(filters);
  return request<PaginatedResponse<NotificationItem>>(`/notifications/${query}`, { token });
}

export function markNotificationRead(token: string, notificationId: number) {
  return request<NotificationItem>(`/notifications/${notificationId}/mark_read/`, { method: "POST", token });
}

export function markAllNotificationsRead(token: string) {
  return request<{ detail: string; updated: number }>("/notifications/mark_all_read/", {
    method: "POST",
    token,
  });
}

export function healthCheck() {
  return request<{ status: string; service?: string }>("/health/");
}
