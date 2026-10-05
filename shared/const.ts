export const COOKIE_NAME = "app_session_id";
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';
// The sign-in itself was valid, but the server could not load the account (for
// example the database is unreachable). Kept distinct from UNAUTHED_ERR_MSG so
// the client shows the error instead of bouncing back to the login page, which
// would otherwise loop forever without ever explaining what is wrong.
export const AUTH_UNAVAILABLE_ERR_MSG = 'We could not load your account. Please try again shortly (10003)';
