/**
 * Hands the temporary password typed on Sign in to "Set a new password" (F-50), which must send it
 * as currentPassword to POST /auth/password. Memory only: never storage, router state or the URL,
 * so a reload drops it and the page then asks for it again.
 */
let held = null;

export function holdTemporaryPassword(password) {
    held = typeof password === 'string' && password ? password : null;
}

export function heldTemporaryPassword() {
    return held;
}

export function forgetTemporaryPassword() {
    held = null;
}
