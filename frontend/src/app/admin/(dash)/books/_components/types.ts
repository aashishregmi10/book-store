// Cloudinary image subdocument ({ publicId, secureUrl, name }) — matches the
// backend `image.schema` and the /upload response.
export interface BookImage {
  publicId: string;
  secureUrl: string;
  name?: string;
}

// Min/max gallery sizes — tune these to taste from the form.
export const MIN_GALLERY_IMAGES = 0;
export const MAX_GALLERY_IMAGES = 6;

export interface BookSpecifications {
  format: string;
  pages: number;
  language: string;
  publisher: string;
  publishedDate: string;
}

export const FORMATS = ["Paperback", "Hardcover", "E-book", "Audiobook"];

// Shape returned by the Open Library ISBN lookup endpoint.
export interface IsbnLookup {
  title?: string;
  author?: string;
  coverImage?: BookImage | null;
  specifications?: Partial<BookSpecifications>;
}

export interface AdminBook {
  _id: string;
  slug: string;
  title: string;
  author: string;
  genre: string;
  price: number;
  comparePrice?: number;
  stock: number;
  stockStatus: string;
  coverImage: BookImage;
  images?: BookImage[];
  description: string;
  isbn?: string;
  condition?: string;
  specifications?: Partial<BookSpecifications>;
  isActive: boolean;
  isFeatured?: boolean;
  isBestseller?: boolean;
  isNewArrival?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Genre {
  _id: string;
  slug: string;
  name: string;
  description?: string;
  color?: string;
  isActive: boolean;
  bookCount?: number;
}

// Fallback shown only if the genre API is unreachable; real options come from
// the admin-curated genre list (GET /genres).
export const FALLBACK_GENRES = ["self-help", "fiction", "nepali-literature", "business"];

export interface BookFormValues {
  slug?: string;
  title: string;
  author: string;
  genre: string;
  isbn: string;
  price: number;
  comparePrice: number;
  stock: number;
  coverImage: BookImage | null;
  images: BookImage[];
  description: string;
  condition: string;
  specifications: BookSpecifications;
  isActive: boolean;
  isFeatured: boolean;
  isBestseller: boolean;
  isNewArrival: boolean;
}

export const EMPTY_SPECIFICATIONS: BookSpecifications = {
  format: "Paperback",
  pages: 0,
  language: "English",
  publisher: "",
  publishedDate: "",
};

// Drop empty/zero fields so they don't trip the model's validators (pages min 1).
export function cleanSpecifications(s: BookSpecifications) {
  const o: Record<string, string | number> = {};
  if (s.format) o.format = s.format;
  if (s.pages > 0) o.pages = s.pages;
  if (s.language?.trim()) o.language = s.language.trim();
  if (s.publisher?.trim()) o.publisher = s.publisher.trim();
  if (s.publishedDate?.trim()) o.publishedDate = s.publishedDate.trim();
  return o;
}

export const EMPTY_BOOK: BookFormValues = {
  slug: "",
  title: "",
  author: "",
  genre: "fiction",
  isbn: "",
  price: 0,
  comparePrice: 0,
  stock: 0,
  coverImage: null,
  images: [],
  description: "",
  condition: "new",
  specifications: { ...EMPTY_SPECIFICATIONS },
  isActive: true,
  isFeatured: false,
  isBestseller: false,
  isNewArrival: false,
};
