// Shared API types (mirror the Express responses).

export interface ApiEnvelope<T> {
  data: T;
  message: string;
}

// Cloudinary image subdocument returned by the API (mirrors the backend
// `image.schema`). Cart/order line items snapshot just the URL as a string.
export interface BookImage {
  publicId: string;
  secureUrl: string;
  name?: string;
}

export interface BookCardData {
  _id: string;
  slug: string;
  title: string;
  author: string;
  price: number;
  comparePrice?: number;
  coverImage: BookImage;
  avgRating: number;
  reviewCount: number;
  stockStatus: "in-stock" | "low-stock" | "out-of-stock" | "discontinued";
  genre: string;
  condition?: "new" | "used";
  isBestseller?: boolean;
  isNewArrival?: boolean;
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
