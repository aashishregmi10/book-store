// Shared API types (mirror the Express responses).

export interface ApiEnvelope<T> {
  data: T;
  message: string;
}

// Stored-image subdocument returned by the API (mirrors the backend
// `image.schema`). Cart/order line items snapshot just the URL as a string.
export interface BookImage {
  publicId: string;
  secureUrl: string;
  name?: string;
}

// A purchasable edition (Hardcover/Paperback) with its own price + stock.
export interface BookVariant {
  _id: string;
  format: "Paperback" | "Hardcover" | "E-book" | "Audiobook";
  price: number;
  comparePrice?: number;
  stock: number;
  isbn?: string;
}

export interface BookCardData {
  _id: string;
  slug: string;
  title: string;
  author: string;
  price: number; // single-format price, or the cheapest variant ("from")
  comparePrice?: number;
  coverImage: BookImage;
  avgRating: number;
  reviewCount: number;
  stockStatus: "in-stock" | "low-stock" | "out-of-stock" | "discontinued";
  stock?: number; // remaining units — drives the "Only N left" urgency badge
  genre: string;
  category?: "manga" | "kids" | "loksewa" | null;
  isBestseller?: boolean;
  isNewArrival?: boolean;
  variants?: BookVariant[]; // present (length > 0) when the title has formats
}

export interface BookDetail extends BookCardData {
  isbn?: string;
  images?: BookImage[];
  description: string;
  shortDescription?: string;
  tags?: string[];
  stock: number;
  metaTitle?: string;
  metaDescription?: string;
  soldCount?: number;
  isStaffPick?: boolean;
  staffPickNote?: string;
  specifications?: {
    format?: string;
    pages?: number;
    language?: string;
    publisher?: string;
    publishedDate?: string;
    dimensions?: string;
    weight?: string;
  };
}

export interface ReviewData {
  _id: string;
  rating: number;
  title?: string;
  body: string;
  isVerifiedPurchase: boolean;
  createdAt: string;
  user?: { fullName: string };
}

export interface ArticleCard {
  _id: string;
  slug: string;
  title: string;
  excerpt?: string;
  coverImage?: BookImage;
  author?: string;
  category?: string;
  tags?: string[];
  publishedAt?: string;
  readingTime?: number;
}

export interface ArticleDetail extends ArticleCard {
  body: string;
  metaTitle?: string;
  metaDesc?: string;
  updatedAt?: string;
  relatedBooks?: BookCardData[];
  /** Sibling guides, ranked server-side by shared tags and recommended-book genres. */
  relatedArticles?: ArticleCard[];
}

export interface QuestionData {
  _id: string;
  question: string;
  answer: string;
  answeredAt?: string;
  createdAt?: string;
}

export interface Genre {
  _id: string;
  slug: string;
  name: string;
  description?: string;
  curatorNote?: string;
  color?: string;
  icon?: string;
  bookCount?: number;
  metaTitle?: string;
  metaDesc?: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
}
