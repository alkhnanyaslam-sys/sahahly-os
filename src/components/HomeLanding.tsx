"use client";

import Link from "next/link";
import { motion, useReducedMotion, type Variants } from "framer-motion";
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

const reveal: Variants = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
};

export default function HomeLanding() {
  const reduceMotion = useReducedMotion();
  const revealState = reduceMotion ? "visible" : "hidden";

  return (
    <main>
      <section className="relative isolate overflow-hidden border-b border-line bg-white">
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute -left-24 -top-24 -z-10 size-72 rounded-full bg-sky-200/40 blur-3xl"
          animate={reduceMotion ? undefined : { x: [0, 24, 0], y: [0, 18, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -right-20 -z-10 size-80 rounded-full bg-cyan-100/70 blur-3xl"
          animate={reduceMotion ? undefined : { x: [0, -18, 0], y: [0, -22, 0] }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="mx-auto max-w-page px-4 py-16 sm:px-6 sm:py-24">
          <motion.div
            className="mx-auto max-w-3xl text-center"
            initial={revealState}
            animate="visible"
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.1 } },
            }}
          >
            <motion.span variants={reveal} className="badge-sky inline-flex">
              منصة للمدرسين والسناتر في مصر
            </motion.span>
            <motion.h1 variants={reveal} className="mt-5 text-3xl font-bold text-ink sm:text-5xl sm:leading-tight">
              صحّح الواجبات والامتحانات في دقائق،
              <span className="text-sky-600"> وأرسل النتيجة لولي الأمر تلقائيًا</span>
            </motion.h1>
            <motion.p variants={reveal} className="mt-5 text-base text-ink-soft sm:text-lg">
              ساحلي أو إس يدير لك التصحيح بخط اليد، والحضور والغياب، ومتابعة الاشتراكات الشهرية،
              في مكان واحد بسيط يوفّر وقتك ووقت مساعديك.
            </motion.p>
            <motion.div variants={reveal} className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="btn-primary w-full px-6 py-3 text-base shadow-lg shadow-sky-600/20 transition-transform duration-200 hover:-translate-y-1 hover:shadow-xl sm:w-auto"
              >
                ابدأ تجربتك الآن
              </Link>
              <Link
                href="/submit"
                className="btn-secondary w-full px-6 py-3 text-base transition-transform duration-200 hover:-translate-y-1 sm:w-auto"
              >
                تسليم واجب (للطلاب)
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <section id="features" className="scroll-mt-20">
        <div className="mx-auto max-w-page px-4 py-16 sm:px-6">
          <motion.div
            className="mx-auto max-w-2xl text-center"
            initial={revealState}
            whileInView="visible"
            viewport={{ once: true, amount: 0.35 }}
            variants={reveal}
          >
            <h2 className="text-2xl font-bold text-ink sm:text-3xl">كل ما يحتاجه السنتر في نظام واحد</h2>
            <p className="mt-3 text-ink-muted">أدوات عملية صُممت لتناسب يوم العمل الحقيقي للمدرس والمساعد.</p>
          </motion.div>
          <motion.div
            className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
            initial={revealState}
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.09 } },
            }}
          >
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <motion.article
                  key={feature.title}
                  variants={reveal}
                  whileHover={reduceMotion ? undefined : { y: -6, transition: { duration: 0.2 } }}
                  className="card p-5 transition-shadow duration-200 hover:shadow-lg"
                >
                  <span className="flex size-11 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                    <Icon size={22} aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 text-lg font-bold text-ink">{feature.title}</h3>
                  <p className="mt-2 text-sm text-ink-soft">{feature.description}</p>
                </motion.article>
              );
            })}
          </motion.div>
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-20 border-t border-line bg-white">
        <div className="mx-auto max-w-page px-4 py-16 sm:px-6">
          <motion.div
            className="mx-auto max-w-2xl text-center"
            initial={revealState}
            whileInView="visible"
            viewport={{ once: true, amount: 0.35 }}
            variants={reveal}
          >
            <h2 className="text-2xl font-bold text-ink sm:text-3xl">كيف يعمل النظام؟</h2>
            <p className="mt-3 text-ink-muted">أربع خطوات من تسليم الطالب حتى وصول النتيجة لولي الأمر.</p>
          </motion.div>
          <motion.ol
            className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
            initial={revealState}
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.09 } },
            }}
          >
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <motion.li
                  key={step.title}
                  variants={reveal}
                  whileHover={reduceMotion ? undefined : { y: -4 }}
                  className="rounded-card border border-line bg-surface-muted p-5"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-8 items-center justify-center rounded-full bg-sky-600 text-sm font-bold text-white">
                      {index + 1}
                    </span>
                    <Icon size={20} className="text-sky-600" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 text-base font-bold text-ink">{step.title}</h3>
                  <p className="mt-2 text-sm text-ink-soft">{step.description}</p>
                </motion.li>
              );
            })}
          </motion.ol>
        </div>
      </section>

      <motion.section
        className="border-t border-line"
        initial={revealState}
        whileInView="visible"
        viewport={{ once: true, amount: 0.5 }}
        variants={reveal}
      >
        <div className="mx-auto max-w-page px-4 py-14 text-center sm:px-6">
          <h2 className="text-2xl font-bold text-ink">جاهز توفّر ساعات التصحيح؟</h2>
          <p className="mt-3 text-ink-muted">أنشئ حسابك وجرّب النظام على أول مجموعة لديك.</p>
          <Link href="/signup" className="btn-primary mt-6 px-6 py-3 text-base transition-transform duration-200 hover:-translate-y-1">
            ابدأ تجربتك الآن
          </Link>
        </div>
      </motion.section>
    </main>
  );
}
