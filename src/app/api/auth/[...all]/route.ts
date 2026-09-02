import { auth } from "@/server/auth";
import { toNextJsHandler } from "better-auth/next-js";

// Semua endpoint Better Auth (Google, magic link, sesi) di /api/auth/*
export const { GET, POST } = toNextJsHandler(auth);
