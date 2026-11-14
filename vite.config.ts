import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({ plugins: [react()], test: { environment: "node", env: { VITE_SUPABASE_URL: "http://localhost:54321", VITE_SUPABASE_PUBLISHABLE_KEY: "chave-de-teste" } } });
