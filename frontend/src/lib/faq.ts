/**
 * The shop's standing answers, in one place.
 *
 * These are the questions Nepali buyers actually ask before ordering, and the
 * answers were already written down across /terms, /about, llms.txt and the
 * book page's trust row. Scattered like that they were unciteable: an answer
 * engine will lift a clean question-and-answer pair long before it will
 * reconstruct one from three prose pages.
 *
 * The courier answer is the one worth being unusually plain about. Competitors
 * are vague about who charges what, and being specific is both honest and the
 * kind of concrete, attributable detail that gets quoted.
 *
 * Shared by /faq (visible copy + FAQPage schema) and /llms.txt so the two can
 * never drift. Answers are deliberately self-contained: each should make sense
 * lifted out on its own, with no "as mentioned above".
 */
export interface Faq {
  question: string;
  answer: string;
}

export const FAQS: Faq[] = [
  {
    question: "Do you deliver outside Kathmandu?",
    answer:
      "Yes. We deliver to all seven provinces of Nepal. Orders inside the Kathmandu Valley usually arrive in 1 to 2 days, and the rest of the country in 3 to 5 days. Those are typical times rather than guarantees, since the courier controls the final leg.",
  },
  {
    question: "How much does delivery cost?",
    answer:
      "The order total on this site covers the books only. The courier charges its own delivery fee when it hands the parcel over, and that rate is set by the courier based on where it is going. Books Temple Nepal does not set or collect it, which is why you will not see a shipping line at checkout.",
  },
  {
    question: "Can I pay cash on delivery?",
    answer:
      "Yes, and for now it is the only way to pay. You pay the courier in cash when the parcel reaches you. There is no online payment, so nothing leaves your account before the books are in your hands.",
  },
  {
    question: "Are prices in Nepali Rupees?",
    answer:
      "Every price on the site is in Nepali Rupees (NPR). There is no currency conversion and no separate import charge to pay later.",
  },
  {
    question: "Can I cancel an order?",
    answer:
      "You can cancel free of charge any time before the parcel is dispatched, from your account's order page. Once it has been handed to the courier it is on its way and can no longer be cancelled.",
  },
  {
    question: "Do you accept returns?",
    answer:
      "We do not run general change-of-mind returns; margins on books here do not support it. If a book arrives damaged, or it is not the book you ordered, contact us and we will replace it.",
  },
  {
    question: "Do you sell Nepali-language books?",
    answer:
      "Yes. The catalogue carries books in both Nepali and English, including Nepali literature that can be difficult to buy outside the country. Each book's page lists its language in the specifications.",
  },
  {
    question: "How do I know a book is genuine?",
    answer:
      "Every title is sourced as a new copy and the edition details, including publisher, format, page count and ISBN, are listed on the book's page. If what arrives does not match that description, contact us and we will replace it.",
  },
  {
    question: "How do I track my order?",
    answer:
      "Use the order tracking page with the order number from your confirmation email. Order numbers look like PT-YYYYMMDD-XXXXX.",
  },
  {
    question: "Who can leave a review?",
    answer:
      "Only verified buyers can review a book, so every rating on the site comes from someone who actually bought that title from us. Reviews are moderated for abuse, not for being critical.",
  },
];
