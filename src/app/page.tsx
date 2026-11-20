import Link from "next/link";
import {
  Bot,
  CheckCircle2,
  ClipboardCheck,
  FileUp,
  LineChart,
  MessageCircle,
  QrCode,
  ScanLine,
} from "lucide-react";
import Navbar from "@/components/Navbar";

const FEATURES = [
  {
    icon: Bot,
    title: "التصحيح الذكي",
    description:
      "يقرأ الذكاء الاصطناعي حل الطالب المكتوب بخط اليد ويقارنه بنموذج إجابتك، ثم تراجع أنت النتيجة بسرعة قبل اعتمادها.",
  },
  {
    icon: MessageCircle,
    title: "تقارير الواتساب",
    description:
      "بعد الاعتماد يصل ولي الأمر ملف الإجابة مصححًا ودرجة ابنه تلقائيًا، بدون أي مجهود إضافي من المساعد.",
  },
  {
    icon: QrCode,
    title: "حضور بالـ QR",
    description:
      "امسح كود الطالب عند الدخول ليظهر لك فورًا هل سدّد اشتراك الشهر أم لا، مع إشعار تلقائي لولي الأمر.",
  },
  {
    icon: LineChart,
    title: "تحليل نقاط الضعف",
    description:
      "اعرف الدروس والأسئلة التي أخطأ فيها أكثر من نصف الطلاب لتعالجها في الحصة القادمة.",
  },
];

const STEPS = [
  {
    icon: FileUp,
    title: "الطالب يسلّم حله",
    description: "يدخل الطالب كوده من الموبايل ويرفع صور الحل أو ملف PDF بدون تسجيل حساب.",
  },
  {
    icon: ScanLine,
    title: "التصحيح الآلي",
    description: "يستخرج النظام الأسئلة ويصححها خطوة بخطوة ويضع علامات الصح والخطأ والدرجة.",
  },
  {
    icon: ClipboardCheck,
    title: "مراجعة سريعة",
    description: "يراجع المساعد الورقة على شاشة مقسمة، ويعدّل أي درجة أو تعليق بضغطة واحدة.",
  },
  {
    icon: CheckCircle2,
    title: "اعتماد وإرسال",
    description: "بضغطة واحدة يُولَّد ملف PDF النهائي ويصل ولي الأمر عبر واتساب.",
  },
];

export default function HomePage() {
  return (
    <>
      <Navbar />
      <main>
        <section className="border-b border-line bg-white">
          <div className="mx-auto max-w-page px-4 py-16 sm:px-6 sm:py-24">
            <div className="mx-auto max-w-3xl text-center">
              <span className="badge-sky">منصة للمدرسين والسناتر في مصر</span>
              <h1 className="mt-5 text-3xl font-bold text-ink sm:text-5xl sm:leading-tight">
                صحّح الواجبات والامتحانات في دقائق،
                <span className="text-sky-600"> وأرسل النتيجة لولي الأمر تلقائيًا</span>
              </h1>
              <p className="mt-5 text-base text-ink-soft sm:text-lg">
                ساحلي أو إس يدير لك التصحيح بخط اليد، والحضور والغياب، ومتابعة الاشتراكات الشهرية،
                في مكان واحد بسيط يوفّر وقتك ووقت مساعديك.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link href="/signup" className="btn-primary w-full px-6 py-3 text-base sm:w-auto">
                  ابدأ تجربتك الآن
                </Link>
                <Link href="/submit" className="btn-secondary w-full px-6 py-3 text-base sm:w-auto">
                  تسليم واجب (للطلاب)
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="scroll-mt-20">
          <div className="mx-auto max-w-page px-4 py-16 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-bold text-ink sm:text-3xl">كل ما يحتاجه السنتر في نظام واحد</h2>
              <p className="mt-3 text-ink-muted">أدوات عملية صُممت لتناسب يوم العمل الحقيقي للمدرس والمساعد.</p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((feature) => {
                const Icon = feature.icon;
                return (
                  <article key={feature.title} className="card p-5">
                    <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                      <Icon size={22} aria-hidden="true" />
                    </span>
                    <h3 className="mt-4 text-lg font-bold text-ink">{feature.title}</h3>
                    <p className="mt-2 text-sm text-ink-soft">{feature.description}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-20 border-t border-line bg-white">
          <div className="mx-auto max-w-page px-4 py-16 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-bold text-ink sm:text-3xl">كيف يعمل النظام؟</h2>
              <p className="mt-3 text-ink-muted">أربع خطوات من تسليم الطالب حتى وصول النتيجة لولي الأمر.</p>
            </div>
            <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, index) => {
                const Icon = step.icon;
                return (
                  <li key={step.title} className="rounded-card border border-line bg-surface-muted p-5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-600 text-sm font-bold text-white">
                        {index + 1}
                      </span>
                      <Icon size={20} className="text-sky-600" aria-hidden="true" />
                    </div>
                    <h3 className="mt-4 text-base font-bold text-ink">{step.title}</h3>
                    <p className="mt-2 text-sm text-ink-soft">{step.description}</p>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        <section className="border-t border-line">
          <div className="mx-auto max-w-page px-4 py-14 text-center sm:px-6">
            <h2 className="text-2xl font-bold text-ink">جاهز توفّر ساعات التصحيح؟</h2>
            <p className="mt-3 text-ink-muted">أنشئ حسابك وجرّب النظام على أول مجموعة لديك.</p>
            <Link href="/signup" className="btn-primary mt-6 px-6 py-3 text-base">
              ابدأ تجربتك الآن
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
