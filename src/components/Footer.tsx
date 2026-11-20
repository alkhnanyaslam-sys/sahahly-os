import type { ComponentType, SVGProps } from "react";
import { Github, Linkedin, Facebook, MessageCircle, Send } from "lucide-react";
import { siteConfig, type SocialPlatform } from "@/config/site";

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;

const ICONS: Record<SocialPlatform, IconComponent> = {
  github: Github as IconComponent,
  linkedin: Linkedin as IconComponent,
  facebook: Facebook as IconComponent,
  whatsapp: MessageCircle as IconComponent,
  telegram: Send as IconComponent,
};

export default function Footer() {
  const { designer } = siteConfig;

  return (
    <footer className="no-print w-full border-t border-line bg-white">
      <div className="mx-auto flex max-w-page flex-col items-center gap-4 px-4 py-6 sm:px-6">
        <p
          dir="ltr"
          lang="en"
          className="font-latin text-base font-semibold tracking-wide text-ink-soft"
        >
          {designer.credit}
        </p>

        <ul className="flex items-center gap-3" aria-label="روابط التواصل الاجتماعي">
          {designer.socials.map((social) => {
            const Icon = ICONS[social.platform];
            return (
              <li key={social.platform}>
                <a
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={social.label}
                  title={social.label}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-white text-ink-muted transition-colors hover:border-sky-300 hover:bg-sky-50 hover:text-sky-600"
                >
                  <Icon size={18} aria-hidden="true" />
                </a>
              </li>
            );
          })}
        </ul>

        <p
          dir="ltr"
          lang="en"
          className="text-center font-latin text-xs text-ink-muted"
        >
          {designer.copyright}
        </p>
      </div>
    </footer>
  );
}
