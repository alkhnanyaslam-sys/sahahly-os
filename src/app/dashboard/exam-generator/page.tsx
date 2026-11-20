import { requirePermission } from "@/lib/auth";
import ExamGenerator from "@/components/dashboard/ExamGenerator";

export const dynamic = "force-dynamic";

export default async function ExamGeneratorPage() {
  const auth = await requirePermission("exam_generator.use");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-ink">مولد الامتحانات الموازية</h1>
        <p className="mt-1 text-sm text-ink-muted">
          ضع نص امتحان أو صورته لتحصل على 3 نماذج موازية (أ، ب، ج) بأرقام وصياغة مختلفة مع
          نماذج الإجابة جاهزة للطباعة.
        </p>
      </header>

      <ExamGenerator teacherId={auth.teacherId} />
    </div>
  );
}
