"""Pure helper functions for authentication. No Flask, no database, no I/O."""

AUTH_TOKEN = "fake-jwt-token"


def has_valid_auth_token(token):
    return token == AUTH_TOKEN


def normalize_credentials(body):
    """Return {"username", "password"} as clean strings, whatever the input was."""
    payload = body if isinstance(body, dict) else {}
    username = payload.get("username")
    password = payload.get("password")
    if not isinstance(username, str):
        username = ""
    if not isinstance(password, str):
        password = ""
    return {"username": username.strip(), "password": password}


def has_login_fields(body):
    creds = normalize_credentials(body)
    return len(creds["username"]) > 0 or len(creds["password"]) > 0
