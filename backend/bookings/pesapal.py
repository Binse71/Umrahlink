import json
from decimal import Decimal
from typing import Any, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.conf import settings

SANDBOX_BASE_URL = "https://cybqa.pesapal.com/pesapalv3/api"
LIVE_BASE_URL = "https://pay.pesapal.com/v3/api"


class PesapalError(RuntimeError):
    pass


class PesapalConfigurationError(PesapalError):
    pass


class PesapalAPIError(PesapalError):
    pass


def is_configured() -> bool:
    return bool(settings.PESAPAL_CONSUMER_KEY and settings.PESAPAL_CONSUMER_SECRET)


def resolve_base_url() -> str:
    if settings.PESAPAL_BASE_URL:
        return settings.PESAPAL_BASE_URL.rstrip("/")
    if settings.PESAPAL_ENV == "live":
        return LIVE_BASE_URL
    return SANDBOX_BASE_URL


def _require_configuration() -> None:
    if not settings.PESAPAL_CONSUMER_KEY or not settings.PESAPAL_CONSUMER_SECRET:
        raise PesapalConfigurationError(
            "Pesapal credentials are missing. Set PESAPAL_CONSUMER_KEY and PESAPAL_CONSUMER_SECRET."
        )


def _parse_json_response(raw: bytes) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        payload = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise PesapalAPIError("Pesapal returned invalid JSON.") from exc
    if isinstance(payload, dict):
        return payload
    raise PesapalAPIError("Pesapal returned an unexpected response format.")


def _request_json(
    *,
    method: str,
    path: str,
    token: Optional[str] = None,
    payload: Optional[dict[str, Any]] = None,
    query: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    _require_configuration()
    base_url = resolve_base_url()
    url = f"{base_url}{path}"
    if query:
        url = f"{url}?{urlencode(query)}"

    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")

    request = Request(url, data=data, headers=headers, method=method.upper())

    try:
        with urlopen(request, timeout=25) as response:
            body = response.read()
            data = _parse_json_response(body)
            http_status = response.status
    except HTTPError as exc:
        body = exc.read() if hasattr(exc, "read") else b""
        parsed = _parse_json_response(body) if body else {}
        message = parsed.get("error", {}).get("message") or parsed.get("message") or parsed.get("error")
        if not isinstance(message, str) or not message:
            message = f"Pesapal HTTP {exc.code}"
        raise PesapalAPIError(message)
    except URLError as exc:
        raise PesapalAPIError(f"Unable to reach Pesapal: {exc.reason}") from exc

    if http_status >= 400:
        message = data.get("error", {}).get("message") or data.get("message") or f"Pesapal HTTP {http_status}"
        raise PesapalAPIError(str(message))

    status_value = data.get("status")
    if isinstance(status_value, int) and status_value >= 400:
        message = data.get("error", {}).get("message") or data.get("message")
        if not message:
            message = f"Pesapal status {status_value}: {json.dumps(data)[:320]}"
        raise PesapalAPIError(str(message))
    if isinstance(status_value, str):
        normalized_status = status_value.strip().lower()
        if normalized_status.isdigit() and int(normalized_status) >= 400:
            message = data.get("error", {}).get("message") or data.get("message")
            if not message:
                message = f"Pesapal status {status_value}: {json.dumps(data)[:320]}"
            raise PesapalAPIError(str(message))
        if normalized_status in {"failed", "failure", "error", "invalid"}:
            message = data.get("error", {}).get("message") or data.get("message") or "Pesapal returned an error status."
            raise PesapalAPIError(str(message))

    error_value = data.get("error")
    if isinstance(error_value, str) and error_value.strip():
        raise PesapalAPIError(error_value.strip())
    if isinstance(error_value, dict) and any(v for v in error_value.values() if v):
        message = error_value.get("message") or data.get("message") or "Pesapal returned an error payload."
        raise PesapalAPIError(str(message))

    return data


def request_access_token() -> str:
    payload = {
        "consumer_key": settings.PESAPAL_CONSUMER_KEY,
        "consumer_secret": settings.PESAPAL_CONSUMER_SECRET,
    }
    response = _request_json(method="POST", path="/Auth/RequestToken", payload=payload)
    token = response.get("token")
    if not isinstance(token, str) or not token:
        raise PesapalAPIError("Pesapal token is missing from auth response.")
    return token


def register_ipn(*, token: str, ipn_url: str) -> str:
    payload = {
        "url": ipn_url,
        "ipn_notification_type": "GET",
    }
    response = _request_json(method="POST", path="/URLSetup/RegisterIPN", token=token, payload=payload)
    ipn_id = response.get("ipn_id")
    if not isinstance(ipn_id, str) or not ipn_id:
        raise PesapalAPIError("Pesapal IPN registration did not return ipn_id.")
    return ipn_id


def submit_order_request(
    *,
    token: str,
    notification_id: str,
    merchant_reference: str,
    amount: Decimal,
    currency: str,
    description: str,
    callback_url: str,
    customer_email: str,
    customer_phone: str,
    customer_first_name: str,
    customer_last_name: str,
) -> dict[str, Any]:
    payload = {
        "id": merchant_reference,
        "currency": currency.upper(),
        "amount": float(amount),
        "description": description[:100],
        "callback_url": callback_url,
        "notification_id": notification_id,
        "billing_address": {
            "email_address": customer_email or "customer@umrahlink.app",
            "phone_number": customer_phone or "",
            "country_code": "SA",
            "first_name": customer_first_name or "Customer",
            "middle_name": "",
            "last_name": customer_last_name or "",
            "line_1": "",
            "line_2": "",
            "city": "",
            "state": "",
            "postal_code": "",
            "zip_code": "",
        },
    }
    return _request_json(method="POST", path="/Transactions/SubmitOrderRequest", token=token, payload=payload)


def get_transaction_status(*, token: str, order_tracking_id: str) -> dict[str, Any]:
    return _request_json(
        method="GET",
        path="/Transactions/GetTransactionStatus",
        token=token,
        query={"orderTrackingId": order_tracking_id},
    )
