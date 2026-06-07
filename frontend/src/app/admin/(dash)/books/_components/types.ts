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
  isActive: boolean;
  isFeatured: boolean;
  isBestseller: boolean;
  isNewArrival: boolean;
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
  isActive: true,
  isFeatured: false,
  isBestseller: false,
  isNewArrival: false,
};
