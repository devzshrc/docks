// Adapted from shadcnblocks landing-page1 / footer2.
// Source: https://www.shadcnblocks.com/r/footer2.json
import { AppIcon } from "@/components/app-icon";
import { cx } from "@/utils/cx";

interface FooterLink {
  name: string;
  href: string;
}
interface FooterSection {
  title: string;
  links: FooterLink[];
}
interface FooterLogo {
  url: string;
  src: string;
  alt: string;
  title: string;
}

interface FooterBasicProps {
  logo?: FooterLogo;
  description?: string;
  sections?: FooterSection[];
  copyright?: string;
  legalLinks?: FooterLink[];
  className?: string;
}

interface Footer2Props extends FooterBasicProps {
  logoClassName?: string;
}
type Props = Footer2Props;

const MAX_SECTIONS = 4;

const Footer2 = (props: Props = {}) => {
  const { logo, description, sections, copyright, legalLinks, className } = {
    logo: { url: "/", src: "/icon.svg", alt: "Docks", title: "Docks" },
    description: "Review your GitHub pull requests in one place.",
    sections: [
      {
        title: "Product",
        links: [
          { name: "Home", href: "/" },
          { name: "Pricing", href: "/pricing" },
        ],
      },
      {
        title: "Account",
        links: [
          { name: "Start free", href: "/signup" },
          { name: "Sign in", href: "/login" },
        ],
      },
      {
        title: "Help",
        links: [
          { name: "Common questions", href: "/pricing#faq" },
          { name: "Contact", href: "mailto:devzshrcz@gmail.com" },
        ],
      },
    ],
    copyright: `© ${new Date().getFullYear()} Docks`,
    legalLinks: [],
    ...props,
  };

  const visibleSections = (sections ?? []).slice(0, MAX_SECTIONS);

  return (
    <section className={cx("py-16 md:py-24", className)}>
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <footer>
          <div className="grid grid-cols-2 gap-8 lg:grid-cols-6">
            <div className="col-span-2 mb-8 lg:mb-0">
              <div className="flex items-center lg:justify-start">
                <a
                  href={logo?.url}
                  className="flex items-center gap-2 rounded-md text-title-2-semibold outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                >
                  <AppIcon className="size-7" />
                  {logo?.title}
                </a>
              </div>
              <p className="mt-4 text-body-medium text-text-secondary">
                {description}
              </p>
            </div>
            {visibleSections.map((section, sectionIdx) => (
              <div key={sectionIdx}>
                <h3 className="mb-4 text-body-semibold">{section.title}</h3>
                <ul className="space-y-4 text-body-regular text-text-secondary">
                  {section.links.map((link, linkIdx) => (
                    <li
                      key={linkIdx}
                      className="text-body-medium hover:text-text-primary"
                    >
                      <a
                        className="inline-flex min-h-11 items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                        href={link.href}
                      >
                        {link.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-col justify-between gap-4 border-t border-border-button-default pt-8 text-caption-1-medium text-text-secondary md:flex-row md:items-center">
            <p>{copyright}</p>
            <ul className="flex gap-4">
              {legalLinks?.map((link, linkIdx) => (
                <li key={linkIdx} className="underline hover:text-text-primary">
                  <a
                    className="inline-flex min-h-11 items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                    href={link.href}
                  >
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </footer>
      </div>
    </section>
  );
};

export { Footer2 };
