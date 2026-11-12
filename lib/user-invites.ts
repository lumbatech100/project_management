import { randomBytes } from "crypto";

export const INVITE_VALID_DAYS = 7;
export const MIN_PASSWORD_LENGTH = 8;

export function newUserInviteToken() {
  return randomBytes(24).toString("base64url");
}

export function inviteExpiry(from = new Date()) {
  return new Date(from.getTime() + INVITE_VALID_DAYS * 24 * 60 * 60 * 1000);
}

export function userInvitePath(token: string) {
  return `/undangan/${token}`;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
