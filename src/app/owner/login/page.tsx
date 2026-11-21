import type { Metadata } from "next";
import { Fingerprint, ShieldCheck } from "lucide-react";
import { OwnerLoginForm } from "./owner-login-form";

export const metadata: Metadata = {
  title: "تسجيل دخول المالك",
};

export const dynamic = "force-dynamic";

export default function OwnerLoginPage() {
  return (
    <main className="mx-auto flex min-h-[78vh] max-w-7xl items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
      <section className="grid w-full max-w-5xl overflow-hidden rounded-[28px] border border-[#dce6f2] bg-[#ffffff] shadow-[0_24px_70px_rgba(22,54,98,0.10)] md:grid-cols-[1.02fr_0.98fr]">
        <div className="relative hidden min-h-[560px] overflow-hidden bg-[#123f88] p-10 text-white md:flex md:flex-col md:justify-between">
          <div aria-hidden="true" className="absolute -left-24 -top-20 h-72 w-72 rounded-full border border-white/10" />
          <div aria-hidden="true" className="absolute -left-8 -top-4 h-52 w-52 rounded-full border border-white/10" />
          <div aria-hidden="true" className="absolute -bottom-32 -right-24 h-80 w-80 rounded-full bg-[#2b67b8]/50" />
          <div className="relative z-10 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
            <ShieldCheck size={26} aria-hidden="true" />
          </div>
          <div className="relative z-10 max-w-sm">
            <p className="mb-4 text-sm font-bold text-[#c7ddff]">مساحة الإدارة المركزية</p>
            <h1 className="text-3xl font-extrabold leading-[1.45]">إدارة المنصة، بوضوح وتحكّم.</h1>
            <p className="mt-4 text-sm leading-7 text-[#d7e6fb]">
              راقب النشاط، أدر حسابات المدرسين، وراجع سجل الأمان من مكان واحد.
            </p>
          </div>
          <div className="relative z-10 flex items-center gap-2 text-xs font-semibold text-[#c7ddff]">
            <Fingerprint size={16} aria-hidden="true" />
            <span>جلسة مشفّرة ومخصّصة للمالك</span>
          </div>
        </div>

        <div className="flex flex-col justify-center p-6 sm:p-10 lg:p-12">
          <div className="mb-8 md:hidden">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#eaf2ff] text-[#174ea6]">
              <ShieldCheck size={25} aria-hidden="true" />
            </span>
          </div>
          <p className="text-sm font-bold text-[#53729c]">مرحبًا بعودتك</p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-[#15243b]">تسجيل دخول المالك</h2>
          <p className="mt-2 text-sm leading-6 text-[#718198]">
            أرسل رمز تحقق إلى بريد المالك المعتمد، ثم أدخله لإكمال تسجيل الدخول.
          </p>

          <div className="mt-8">
            <OwnerLoginForm />
          </div>

          <p className="mt-6 text-center text-xs leading-6 text-[#7d8ca1]">
            هذه المساحة غير مفهرسة، ولا تملك صلاحية الدخول إلا الحسابات المعتمدة.
          </p>
        </div>
      </section>
    </main>
  );
}
