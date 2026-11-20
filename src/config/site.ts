export type SocialPlatform = "github" | "linkedin" | "facebook" | "whatsapp" | "telegram";

export interface SocialLink {
  platform: SocialPlatform;
  label: string;
  href: string;
}

export interface SiteConfig {
  name: string;
  nameAr: string;
  description: string;
  url: string;
  designer: {
    name: string;
    credit: string;
    copyright: string;
    socials: SocialLink[];
  };
  navLinks: { label: string; href: string }[];
}

/**
 * ملف الإعدادات المركزي للمنصة.
 * عدّل روابط التواصل الاجتماعي الخاصة بالمصمم من هنا فقط،
 * وستتحدث تلقائيًا في تذييل جميع الصفحات.
 */
export const siteConfig: SiteConfig = {
  name: "Sahahly OS",
  nameAr: "ساحلي أو إس",
  description:
    "منصة سحابية متكاملة للمدرسين والسناتر التعليمية في مصر: تصحيح ذكي للواجبات والامتحانات، حضور بالـ QR، متابعة الاشتراكات، وتقارير واتساب لأولياء الأمور.",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  designer: {
    name: "Eslam sherif",
    credit: "Designed by Eslam sherif",
    copyright: "© 2026 Sahahly OS. All Rights Reserved to Eslam sherif.",
    socials: [
      {
        platform: "github",
        label: "GitHub",
        href: "https://github.com/your-username",
      },
      {
        platform: "linkedin",
        label: "LinkedIn",
        href: "https://www.linkedin.com/in/your-username",
      },
      {
        platform: "facebook",
        label: "Facebook",
        href: "https://www.facebook.com/your-username",
      },
      {
        platform: "whatsapp",
        label: "WhatsApp",
        href: "https://wa.me/201000000000",
      },
    ],
  },
  navLinks: [
    { label: "المميزات", href: "/#features" },
    { label: "كيف يعمل النظام", href: "/#how-it-works" },
    { label: "بوابة الطلاب", href: "/submit" },
    { label: "تسجيل الدخول", href: "/login" },
  ],
};
