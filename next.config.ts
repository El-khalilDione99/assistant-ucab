import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // En mode développement (npm run dev), Next.js bloque le JavaScript de la page si on l'ouvre
  // avec une autre adresse que localhost (127.0.0.1, ou l'adresse du PC sur le réseau).
  // Les boutons ne réagissent alors plus. On autorise ces adresses locales.
  allowedDevOrigins: ["127.0.0.1", "192.168.*.*", "10.*.*.*"],
  // La lecture des photos (OCR) lance ses propres fichiers : on ne l'empaquette pas.
  serverExternalPackages: ["tesseract.js"],
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
