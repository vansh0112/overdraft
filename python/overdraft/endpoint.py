"""An agent's paid x402 endpoint, seen the way a customer sees it.

An unpaid request gets HTTP 402 with the payment terms (the x402 PAYMENT-REQUIRED header): which account
to pay, how much and in which token. Enrolment checks a new agent's endpoint this way, the credit check
requires it to pay into the agent's splitter, and the watcher keeps checking while the agent owes.

The server fetches URLs that owners submit, so only public https addresses are allowed: no private,
loopback or link-local hosts, no redirects, short timeouts and small replies. ALLOW_LOCAL_ENDPOINTS
also admits http and this machine's own address, for testing locally. The host is checked again
before every request, not only when the URL is submitted.
"""

import base64
import ipaddress
import json
import re
import socket
from urllib.parse import urlsplit

import requests

from .config import optional

MAX_URL_LENGTH = 200
TIMEOUT_SECONDS = 10
MAX_TERMS_BYTES = 64 * 1024
SANDBOX_TIMEOUT_SECONDS = 25  # its first answer for a new agent looks the agent up on Hedera
SANDBOX_PATH = re.compile(r"/sandbox/\d{1,9}/translate")


def allow_local() -> bool:
    return (optional("ALLOW_LOCAL_ENDPOINTS") or "").lower() in ("1", "true", "yes")


def check_url(url: str) -> str:
    """Returns the URL if the server may fetch it; raises ValueError saying why not."""
    if len(url) > MAX_URL_LENGTH:
        raise ValueError(f"the endpoint URL is over {MAX_URL_LENGTH} characters")
    parts = urlsplit(url)
    if parts.scheme not in ("https", "http") or not parts.hostname:
        raise ValueError("the endpoint must be an https URL")
    if parts.username or parts.password:
        raise ValueError("the endpoint URL can't contain a username or password")
    local = allow_local()
    if parts.scheme == "http" and not local:
        raise ValueError("the endpoint must use https")
    try:
        port = parts.port or (443 if parts.scheme == "https" else 80)
        addresses = {info[4][0] for info in socket.getaddrinfo(parts.hostname, port, proto=socket.IPPROTO_TCP)}
    except (socket.gaierror, ValueError) as error:
        raise ValueError(f"{parts.hostname} can't be reached") from error
    for address in addresses:
        ip = ipaddress.ip_address(address.split("%")[0])
        if not ip.is_global and not (local and ip.is_loopback):
            raise ValueError(f"{parts.hostname} isn't a public address")
    return url


def own_sandbox(url: str) -> str | None:
    """This server's own sandbox endpoint (see console.sandbox), reached on this machine instead of out through the
    internet and back. PUBLIC_API_DOMAIN, else the domain Railway gives the service, says which host is ours."""
    domain = (optional("PUBLIC_API_DOMAIN") or optional("RAILWAY_PUBLIC_DOMAIN") or "").lower()
    parts = urlsplit(url)
    if domain and parts.scheme == "https" and parts.hostname == domain and parts.port in (None, 443) and SANDBOX_PATH.fullmatch(parts.path) and not parts.query:
        return f"http://127.0.0.1:{optional('GATEWAY_PORT') or 4021}{parts.path}"
    return None


def quote(url: str, *, trusted: bool = False) -> dict:
    """The terms an unpaid request gets: {"accepts": [...], "payTo": {accounts}}. ValueError if it isn't x402.

    `trusted` is for endpoints the operator configured (such as the demo agent's, on this machine); every
    endpoint an owner submitted goes through check_url.
    """
    target, timeout = url, TIMEOUT_SECONDS
    if local := own_sandbox(url):
        target, timeout = local, SANDBOX_TIMEOUT_SECONDS
    elif not trusted:
        check_url(url)
    try:
        response = requests.post(target, json={}, timeout=timeout, allow_redirects=False, stream=True)
    except requests.RequestException as error:
        raise ValueError(f"the endpoint didn't answer ({type(error).__name__})") from error
    with response:
        if response.status_code != 402:
            raise ValueError(f"the endpoint answered {response.status_code}, not 402 Payment Required")
        header = response.headers.get("PAYMENT-REQUIRED")
        if header and len(header) > MAX_TERMS_BYTES:
            raise ValueError("the endpoint's payment terms are too large")
        raw = base64.b64decode(header) if header else response.raw.read(MAX_TERMS_BYTES + 1, decode_content=True)
    if len(raw) > MAX_TERMS_BYTES:
        raise ValueError("the endpoint's payment terms are too large")
    try:
        terms = json.loads(raw)
    except ValueError as error:
        raise ValueError("the endpoint's 402 reply isn't x402 payment terms") from error
    accepts = [a for a in terms.get("accepts", []) if isinstance(a, dict) and a.get("payTo")] if isinstance(terms, dict) else []
    if not accepts:
        raise ValueError("the endpoint's 402 reply has no payment options")
    return {"accepts": accepts, "payTo": {str(a["payTo"]) for a in accepts}}
