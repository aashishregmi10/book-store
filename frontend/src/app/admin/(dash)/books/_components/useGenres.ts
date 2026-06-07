"use client";

import { useEffect, useState } from "react";
import { clientApi } from "@/lib/client-api";
import type { Genre } from "./types";

/**
 * Reads the admin-curated genre list (public GET /genres returns active genres).
 * Used to populate the book form's genre dropdown so the options stay in sync
 * with what admins add under /admin/genres.
 */
export function useGenres() {
  const [genres, setGenres] = useState<Genre[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    clientApi
      .get<Genre[]>("/genres")
      .then((g) => active && setGenres(g))
      .catch(() => active && setGenres([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  return { genres, loading };
}
