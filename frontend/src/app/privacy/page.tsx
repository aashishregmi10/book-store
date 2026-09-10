import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What Books Temple Nepal collects when you shop with us, why we hold it, who else sees it, and how to have it deleted.",
  alternates: { canonical: "/privacy" },
};

/**
 * Written from what the code actually does — the account and address schemas in
 * backend/src/models/user.model.js, the GA4 component, the Google Sign-In flow
 * and the Cloudflare R2 image host. If any of those change, this page has to
 * change with them. It is a factual description of our processing, not a
 * template; it has not been through a Nepali lawyer, which is worth doing
 * before this is relied on in a dispute.
 */

// Kept in one place so the "last updated" line can't drift from reality.
const LAST_UPDATED = "5 August 2026";

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <p className="label-smallcaps font-data text-xs">Legal</p>
      <h1 className="mt-3 font-display text-4xl leading-tight text-text sm:text-5xl">Privacy Policy</h1>
      <p className="mt-3 font-data text-sm text-muted">Last updated {LAST_UPDATED}</p>

      <div className="mt-10 space-y-10 font-body text-base leading-relaxed text-text">
        <p className="text-lg">
          We are a bookshop, not an advertising business. We collect what we need to get a book to your
          door and to let you back into your account (nothing else), and we do not sell any of it.
        </p>

        <Section title="What we collect">
          <p>Only two things generate personal data here: making an account, and placing an order.</p>
          <dl className="mt-4 space-y-3">
            <Item term="Account">
              Your name, email address and, if you add one, a phone number and profile picture. If you
              sign in with Google we receive your name, email address and profile picture from Google; we
              never see your Google password.
            </Item>
            <Item term="Orders">
              Your delivery name, phone number, street address, city and province, plus what you bought and
              when. Cash on delivery means we never handle card or bank details at all.
            </Item>
            <Item term="Sign-in">
              A password, stored only as a bcrypt hash (we cannot read it), and a session cookie so you
              stay signed in. The session cookie is <code className="font-data text-sm">httpOnly</code>,
              which means scripts on the page cannot read it.
            </Item>
            <Item term="Usage">
              If analytics are switched on, Google Analytics records which pages get visited, in aggregate.
              Reviews and questions you post are shown publicly under your display name.
            </Item>
          </dl>
        </Section>

        <Section title="Why we hold it">
          <p>
            To take payment on delivery, to hand the courier an address they can actually find, to show you
            your own order history, to reply when you write to us, and to keep the shop working. We do not
            build advertising profiles and we do not run ads.
          </p>
        </Section>

        <Section title="Who else sees it">
          <p>
            A small number of services we depend on, each seeing only what their job requires. None of them
            are permitted to use your data for their own purposes:
          </p>
          <ul className="mt-4 list-disc space-y-2 pl-5">
            <li><strong>The courier</strong>: your delivery name, address and phone, so they can reach you.</li>
            <li><strong>MongoDB Atlas</strong>: the database the shop runs on.</li>
            <li><strong>Cloudflare R2</strong>: hosts book covers.</li>
            <li><strong>Google</strong>: sign-in, and analytics where enabled.</li>
            <li><strong>Our email provider</strong>: order confirmations and password resets.</li>
          </ul>
          <p className="mt-4">
            We do not sell, rent or trade your personal data. We would only hand it to anyone else if the
            law required it.
          </p>
        </Section>

        <Section title="How long we keep it">
          <p>
            Order records are kept as long as we need them for accounts and returns. Everything else lives
            for as long as your account does. Close it and we delete your personal details, keeping only
            what we are legally obliged to retain against past orders.
          </p>
        </Section>

        <Section title="Your choices">
          <p>
            Write to{" "}
            <a href={`mailto:${SITE.email}`} className="text-link underline-offset-4 hover:underline">
              {SITE.email}
            </a>{" "}
            and we will, within a reasonable time: send you a copy of what we hold, correct anything wrong,
            delete your account, or stop emailing you. You can edit your own details any time under{" "}
            <Link href="/account/settings" className="text-link underline-offset-4 hover:underline">
              account settings
            </Link>
            . You never have to make an account to buy: guest checkout asks only for a delivery address.
          </p>
        </Section>

        <Section title="Children">
          <p>
            The shop is not aimed at children under 13, and we do not knowingly create accounts for them. If
            you believe a child has given us their details, tell us and we will remove them.
          </p>
        </Section>

        <Section title="Changes">
          <p>
            If this policy changes we will update the date at the top. Material changes will be announced on
            the site rather than slipped in quietly.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Books Temple Nepal, Kathmandu, Nepal ·{" "}
            <a href={`mailto:${SITE.email}`} className="text-link underline-offset-4 hover:underline">
              {SITE.email}
            </a>
            <br />
            Questions about any of the above are welcome through the{" "}
            <Link href="/contact" className="text-link underline-offset-4 hover:underline">
              contact page
            </Link>
            .
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border pt-8">
      <h2 className="font-display text-2xl text-text">{title}</h2>
      <div className="mt-3 space-y-3 text-muted">{children}</div>
    </section>
  );
}

function Item({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-display text-base text-text">{term}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}
