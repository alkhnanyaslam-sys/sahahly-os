"use client";

import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle } from "lucide-react";
import { toArabicDigits } from "@/lib/utils";

export interface AssessmentAveragePoint {
  id: string;
  title: string;
  average_percent: number | null;
  submissions: number;
}

export interface WeakQuestion {
  question_number: number;
  topic: string | null;
  total: number;
  wrong: number;
  wrong_percent: number;
}

export interface WeakTopic {
  topic: string;
  total: number;
  wrong_percent: number;
}

interface AnalyticsChartsProps {
  averages: AssessmentAveragePoint[];
  assessments: { id: string; title: string }[];
  selectedId: string;
  selectedTitle: string;
  approvedCount: number;
  weakQuestions: WeakQuestion[];
  weakTopics: WeakTopic[];
}

const SKY_600 = "#0284C7";
const SKY_300 = "#7DD3FC";
const GRID = "#E2E8F0";
const AXIS = "#64748B";

function shorten(text: string, max = 14): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export default function AnalyticsCharts({
  averages,
  assessments,
  selectedId,
  selectedTitle,
  approvedCount,
  weakQuestions,
  weakTopics,
}: AnalyticsChartsProps) {
  const router = useRouter();

  const lineData = averages
    .filter((point) => point.average_percent !== null)
    .map((point) => ({
      name: shorten(point.title),
      fullTitle: point.title,
      average: point.average_percent as number,
      submissions: point.submissions,
    }));

  const topicData = weakTopics.slice(0, 8).map((topic) => ({
    name: shorten(topic.topic, 18),
    fullName: topic.topic,
    wrong: topic.wrong_percent,
  }));

  return (
    <div className="space-y-6">
      <section className="card p-5" aria-label="متوسط الدرجات">
        <h2 className="text-lg font-bold text-ink">متوسط الدرجات عبر الواجبات</h2>
        <p className="mt-1 text-sm text-ink-muted">
          نسبة متوسط درجات الأوراق المعتمدة من الدرجة الكلية لكل واجب أو امتحان.
        </p>

        {lineData.length > 0 ? (
          <div dir="ltr" className="mt-4 h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fill: AXIS, fontSize: 12 }} stroke={GRID} />
                <YAxis
                  domain={[0, 100]}
                  unit="%"
                  tick={{ fill: AXIS, fontSize: 12 }}
                  stroke={GRID}
                />
                <Tooltip
                  formatter={(value: number) => [`${value}%`, "المتوسط"]}
                  labelFormatter={(_label, payload) =>
                    payload?.[0]?.payload?.fullTitle ?? ""
                  }
                  contentStyle={{ borderRadius: 8, border: `1px solid ${GRID}` }}
                />
                <Line
                  type="monotone"
                  dataKey="average"
                  stroke={SKY_600}
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: SKY_600 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-ink-muted">
            لا توجد أوراق معتمدة بعد لعرض المتوسطات.
          </p>
        )}
      </section>

      <section className="card p-5" aria-label="نقاط الضعف">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-ink">نقاط الضعف في: {selectedTitle}</h2>
            <p className="mt-1 text-sm text-ink-muted">
              محسوبة من {toArabicDigits(approvedCount)} ورقة معتمدة.
            </p>
          </div>
          <div>
            <label htmlFor="analytics-assessment" className="sr-only">
              اختر الواجب
            </label>
            <select
              id="analytics-assessment"
              className="input"
              value={selectedId}
              onChange={(e) =>
                router.push(`/dashboard/analytics?assessment=${encodeURIComponent(e.target.value)}`)
              }
            >
              {assessments.map((assessment) => (
                <option key={assessment.id} value={assessment.id}>
                  {assessment.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {approvedCount === 0 ? (
          <p className="py-10 text-center text-sm text-ink-muted">
            لا توجد أوراق معتمدة لهذا الواجب بعد.
          </p>
        ) : (
          <div className="mt-5 grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-3 text-base font-bold text-ink">الدروس الأضعف (نسبة الخطأ)</h3>
              {topicData.length > 0 ? (
                <div dir="ltr" className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={topicData}
                      layout="vertical"
                      margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                    >
                      <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
                      <XAxis
                        type="number"
                        domain={[0, 100]}
                        unit="%"
                        tick={{ fill: AXIS, fontSize: 12 }}
                        stroke={GRID}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={110}
                        tick={{ fill: AXIS, fontSize: 12 }}
                        stroke={GRID}
                      />
                      <Tooltip
                        formatter={(value: number) => [`${value}%`, "نسبة الخطأ"]}
                        labelFormatter={(_label, payload) =>
                          payload?.[0]?.payload?.fullName ?? ""
                        }
                        contentStyle={{ borderRadius: 8, border: `1px solid ${GRID}` }}
                      />
                      <Bar dataKey="wrong" radius={[0, 4, 4, 0]}>
                        {topicData.map((entry) => (
                          <Cell
                            key={entry.fullName}
                            fill={entry.wrong >= 75 ? SKY_600 : SKY_300}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="rounded-lg border border-line bg-surface-muted px-4 py-8 text-center text-sm text-ink-muted">
                  لا توجد دروس تجاوزت نسبة الخطأ فيها 50%.
                </p>
              )}
            </div>

            <div>
              <h3 className="mb-3 text-base font-bold text-ink">أسئلة أخطأ فيها أكثر من 50%</h3>
              {weakQuestions.length > 0 ? (
                <ul className="space-y-2">
                  {weakQuestions.map((question) => (
                    <li
                      key={question.question_number}
                      className="flex items-start gap-3 rounded-lg border border-warning-100 bg-warning-50 px-3 py-2.5"
                    >
                      <AlertTriangle
                        size={18}
                        className="mt-0.5 shrink-0 text-warning-600"
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-ink">
                          السؤال {toArabicDigits(question.question_number)}
                          {question.topic ? (
                            <span className="font-semibold text-ink-soft"> · {question.topic}</span>
                          ) : null}
                        </p>
                        <p className="text-sm text-ink-soft">
                          أخطأ فيه {toArabicDigits(question.wrong)} من{" "}
                          {toArabicDigits(question.total)} طالب (
                          {toArabicDigits(question.wrong_percent)}%)
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-lg border border-line bg-surface-muted px-4 py-8 text-center text-sm text-ink-muted">
                  لا توجد أسئلة تجاوزت نسبة الخطأ فيها 50%.
                </p>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
                         }
