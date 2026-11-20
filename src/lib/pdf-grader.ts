import {
  LineCapStyle,
  PDFDocument,
  PDFFont,
  PDFPage,
  StandardFonts,
  rgb,
} from "pdf-lib";
import type { BoundingBox } from "@/types/database";

export interface PdfSourcePage {
  /** محتوى الملف الأصلي المرفوع من الطالب (صورة JPG/PNG أو PDF). */
  bytes: Uint8Array;
  mimeType: string;
}

export interface PdfQuestionMark {
  question_number: number;
  awarded_mark: number;
  max_mark: number;
  is_correct: boolean;
  bounding_box: BoundingBox | null;
  /** رقم الصفحة (يبدأ من 0) في الملف النهائي. */
  page_index: number;
}

export interface RenderGradedPdfInput {
  files: PdfSourcePage[];
  marks: PdfQuestionMark[];
  finalScore: number;
  totalMarks: number;
}

const A4_WIDTH = 595.28;

const COLORS = {
  success: rgb(0.086, 0.639, 0.29), // #16A34A
  danger: rgb(0.863, 0.149, 0.149), // #DC2626
  warning: rgb(0.851, 0.467, 0.024), // #D97706
  sky: rgb(0.008, 0.518, 0.78), // #0284C7
  white: rgb(1, 1, 1),
};

function formatMark(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function isPng(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === "image/png") return true;
  return (
    bytes.length > 4 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

function isJpeg(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") return true;
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

function isPdf(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === "application/pdf") return true;
  return (
    bytes.length > 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  );
}

async function appendSource(
  doc: PDFDocument,
  source: PdfSourcePage
): Promise<void> {
  if (isPdf(source.bytes, source.mimeType)) {
    const sourceDoc = await PDFDocument.load(source.bytes, {
      ignoreEncryption: true,
    });
    const copied = await doc.copyPages(sourceDoc, sourceDoc.getPageIndices());
    copied.forEach((page) => doc.addPage(page));
    return;
  }

  let image;
  if (isPng(source.bytes, source.mimeType)) {
    image = await doc.embedPng(source.bytes);
  } else if (isJpeg(source.bytes, source.mimeType)) {
    image = await doc.embedJpg(source.bytes);
  } else {
    throw new Error(
      `صيغة الملف غير مدعومة (${source.mimeType}). الصيغ المقبولة: JPG, PNG, PDF.`
    );
  }

  const width = A4_WIDTH;
  const height = (image.height / image.width) * width;
  const page = doc.addPage([width, height]);
  page.drawImage(image, { x: 0, y: 0, width, height });
}

function drawCheck(
  page: PDFPage,
  x: number,
  y: number,
  size: number,
  color: ReturnType<typeof rgb>
) {
  const thickness = Math.max(1.8, size * 0.14);
  const start = { x, y: y + size * 0.45 };
  const mid = { x: x + size * 0.35, y };
  const end = { x: x + size, y: y + size };
  page.drawLine({
    start,
    end: mid,
    thickness,
    color,
    lineCap: LineCapStyle.Round,
  });
  page.drawLine({
    start: mid,
    end,
    thickness,
    color,
    lineCap: LineCapStyle.Round,
  });
}

function drawCross(
  page: PDFPage,
  x: number,
  y: number,
  size: number,
  color: ReturnType<typeof rgb>
) {
  const thickness = Math.max(1.8, size * 0.14);
  page.drawLine({
    start: { x, y },
    end: { x: x + size, y: y + size },
    thickness,
    color,
    lineCap: LineCapStyle.Round,
  });
  page.drawLine({
    start: { x, y: y + size },
    end: { x: x + size, y },
    thickness,
    color,
    lineCap: LineCapStyle.Round,
  });
}

function drawQuestionMark(
  page: PDFPage,
  font: PDFFont,
  mark: PdfQuestionMark,
  fallbackIndex: number
) {
  const { width, height } = page.getSize();
  const size = Math.min(26, Math.max(16, width * 0.042));

  const isFull = mark.is_correct;
  const isZero = mark.awarded_mark <= 0;
  const color = isFull ? COLORS.success : isZero ? COLORS.danger : COLORS.warning;

  const label = `${formatMark(mark.awarded_mark)}/${formatMark(mark.max_mark)}`;
  const fontSize = size * 0.72;
  const labelWidth = font.widthOfTextAtSize(label, fontSize);
  const blockWidth = size + 6 + labelWidth;

  let x: number;
  let yTop: number;

  if (mark.bounding_box) {
    const [ymin, xmin] = mark.bounding_box;
    x = (xmin / 1000) * width - blockWidth - 4;
    yTop = height - (ymin / 1000) * height;
    if (x < 6) {
      const xmax = mark.bounding_box[3];
      x = (xmax / 1000) * width + 4;
    }
  } else {
    x = 8;
    yTop = height - 70 - fallbackIndex * (size + 14);
  }

  x = Math.min(Math.max(6, x), width - blockWidth - 6);
  const yBase = Math.min(Math.max(6, yTop - size), height - size - 6);

  page.drawRectangle({
    x: x - 3,
    y: yBase - 3,
    width: blockWidth + 6,
    height: size + 6,
    color: COLORS.white,
    opacity: 0.85,
    borderColor: color,
    borderWidth: 0.8,
  });

  if (isFull) {
    drawCheck(page, x, yBase, size, color);
  } else if (isZero) {
    drawCross(page, x + size * 0.08, yBase + size * 0.08, size * 0.84, color);
  } else {
    drawCheck(page, x, yBase, size, color);
  }

  page.drawText(label, {
    x: x + size + 6,
    y: yBase + (size - fontSize) / 2 + 1,
    size: fontSize,
    font,
    color,
  });
}

function drawTotalBadge(
  page: PDFPage,
  font: PDFFont,
  finalScore: number,
  totalMarks: number
) {
  const { width, height } = page.getSize();
  const label = `${formatMark(finalScore)} / ${formatMark(totalMarks)}`;
  const fontSize = Math.min(30, Math.max(20, width * 0.05));
  const textWidth = font.widthOfTextAtSize(label, fontSize);
  const padX = 14;
  const padY = 10;
  const boxWidth = textWidth + padX * 2;
  const boxHeight = fontSize + padY * 2;
  const x = width - boxWidth - 16;
  const y = height - boxHeight - 16;

  page.drawRectangle({
    x,
    y,
    width: boxWidth,
    height: boxHeight,
    color: COLORS.white,
    borderColor: COLORS.sky,
    borderWidth: 2,
  });
  page.drawText(label, {
    x: x + padX,
    y: y + padY + fontSize * 0.1,
    size: fontSize,
    font,
    color: COLORS.sky,
  });
}

/**
 * يبني ملف PDF نهائيًا من صور/ملفات إجابات الطالب،
 * مع رسم علامات الصح والخطأ والدرجة على كل سؤال، والدرجة النهائية في أعلى الصفحة الأولى.
 *
 * ملاحظة: العلامات تُرسم كأشكال متجهة وأرقام لاتينية فقط، لأن الخطوط المدمجة
 * في pdf-lib لا تدعم الحروف العربية. التعليقات العربية تظهر في شاشة المراجعة
 * ورسالة الواتساب وليس داخل الـ PDF.
 */
export async function renderGradedPdf(
  input: RenderGradedPdfInput
): Promise<Uint8Array> {
  if (input.files.length === 0) {
    throw new Error("لا توجد ملفات لتوليد ملف PDF.");
  }

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);

  for (const file of input.files) {
    await appendSource(doc, file);
  }

  const pages = doc.getPages();
  const lastIndex = pages.length - 1;

  const fallbackCounters = new Map<number, number>();
  const sortedMarks = [...input.marks].sort(
    (a, b) => a.question_number - b.question_number
  );

  for (const mark of sortedMarks) {
    const pageIndex = Math.min(Math.max(0, mark.page_index), lastIndex);
    const page = pages[pageIndex];
    if (!page) continue;

    let fallbackIndex = 0;
    if (!mark.bounding_box) {
      fallbackIndex = fallbackCounters.get(pageIndex) ?? 0;
      fallbackCounters.set(pageIndex, fallbackIndex + 1);
    }
    drawQuestionMark(page, font, mark, fallbackIndex);
  }

  const firstPage = pages[0];
  if (firstPage) {
    drawTotalBadge(firstPage, font, input.finalScore, input.totalMarks);
  }

  return doc.save();
    }
