'use client';

import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { BlobProvider, Document, Font, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

const PDF_TYPES = {
  estimate: '御 見 積 書',
  order: '御 請 求 書 (控)',
  delivery: '納 品 書',
  invoice: '御 請 求 書',
} as const;

const ALL_PDF_TYPES = ['estimate', 'order', 'delivery', 'invoice'] as const;

const styles = StyleSheet.create({
  page: {
    paddingTop: 18,
    paddingHorizontal: 20,
    paddingBottom: 16,
    fontSize: 8.8,
    color: '#000',
    fontFamily: 'NotoSansJP',
    backgroundColor: '#fff',
  },
  topRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 6 },
  slipNo: { fontSize: 9, fontWeight: 'bold' },
  title: { fontSize: 24, fontWeight: 'bold', letterSpacing: 6, textAlign: 'center', flex: 1 },
  issueBox: { width: 150, alignItems: 'flex-end', fontSize: 9, fontWeight: 'bold' },
  recipientLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1 solid #000',
    paddingBottom: 4,
    paddingLeft: 20,
    paddingRight: 10,
    marginBottom: 10,
  },
  recipientText: { fontSize: 14, fontWeight: 'bold' },
  shopText: { fontSize: 11, fontWeight: 'bold' },
  upperArea: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  leftInfo: { width: 315 },
  amountArea: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  amountBox: { width: 168, border: '1 solid #808080' },
  amountHeader: {
    backgroundColor: '#102d69',
    color: '#fff',
    textAlign: 'center',
    paddingVertical: 4,
    fontSize: 8.5,
    fontWeight: 'bold',
  },
  amountValue: { textAlign: 'center', paddingVertical: 10, fontSize: 24, fontWeight: 'bold' },
  customerBox: { width: 110, border: '1 solid #808080' },
  customerHeaderRow: { flexDirection: 'row', backgroundColor: '#efefef', borderBottom: '1 solid #808080' },
  customerCellHeader: {
    flex: 1,
    textAlign: 'center',
    paddingVertical: 4,
    fontSize: 8.5,
    fontWeight: 'bold',
    borderRight: '1 solid #808080',
  },
  customerCellHeaderLast: { borderRight: '0 solid transparent' },
  customerValueRow: { flexDirection: 'row' },
  customerValue: {
    flex: 1,
    minHeight: 57,
    textAlign: 'center',
    paddingTop: 12,
    fontSize: 11,
    fontWeight: 'bold',
    borderRight: '1 solid #808080',
  },
  customerValueLast: { borderRight: '0 solid transparent' },
  noteText: { fontSize: 9, fontWeight: 'bold', marginBottom: 2 },
  detailTable: { width: 240, marginTop: 4 },
  detailRow: { flexDirection: 'row', borderBottom: '1 solid #000', minHeight: 18 },
  detailLabel: { width: 70, textAlign: 'right', paddingRight: 6, fontWeight: 'bold', paddingTop: 2 },
  detailValue: { flex: 1, fontWeight: 'bold', paddingTop: 2 },
  logoArea: { width: 240, alignItems: 'center', paddingTop: 2 },
  logo: { width: 240, height: 165, objectFit: 'contain' },
  table: { borderTop: '1 solid #5f6b7a', borderLeft: '1 solid #5f6b7a', marginTop: 6 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#173a73', minHeight: 18, alignItems: 'center' },
  row: { flexDirection: 'row', minHeight: 18, alignItems: 'center' },
  evenRow: { backgroundColor: '#edf3fb' },
  headerCell: {
    justifyContent: 'center',
    minHeight: 18,
    borderRight: '1 solid #5f6b7a',
    borderBottom: '1 solid #5f6b7a',
    paddingHorizontal: 4,
  },
  bodyCell: {
    justifyContent: 'center',
    minHeight: 18,
    borderRight: '1 solid #5f6b7a',
    borderBottom: '1 solid #b7c1ce',
    paddingHorizontal: 4,
  },
  headerText: { color: '#fff', fontSize: 8, fontWeight: 'bold', textAlign: 'center' },
  colMaker: { width: 78 },
  colProduct: { width: 234 },
  colQty: { width: 40 },
  colUnit: { width: 86 },
  colAmount: { width: 118 },
  makerText: { fontSize: 8, fontWeight: 'bold' },
  productText: { fontSize: 8, fontWeight: 'bold' },
  numberText: { fontSize: 8, fontWeight: 'bold', textAlign: 'right' },
  totalSection: {
    marginTop: 0,
    marginLeft: 351,
    width: 204,
    borderLeft: '1 solid #5f6b7a',
    borderRight: '1 solid #5f6b7a',
    borderBottom: '1 solid #5f6b7a',
  },
  totalRow: { flexDirection: 'row', minHeight: 18, backgroundColor: '#edf3fb' },
  totalLabel: {
    width: 86,
    borderRight: '1 solid #5f6b7a',
    borderBottom: '1 solid #b7c1ce',
    textAlign: 'center',
    paddingTop: 3,
    fontSize: 8,
    fontWeight: 'bold',
  },
  totalValue: {
    width: 118,
    borderBottom: '1 solid #b7c1ce',
    textAlign: 'right',
    paddingTop: 3,
    paddingRight: 4,
    fontSize: 8.5,
    fontWeight: 'bold',
  },
  totalRowLast: { backgroundColor: '#fff' },
});

type PdfType = keyof typeof PDF_TYPES;
type ScheduleStatus = 'draft' | 'pending' | 'sent' | 'finished';
type PdfPageCount = 1 | 4;

type ScheduleItem = {
  productName: string;
  maker?: string;
  categoryName?: string;
  quantity: number;
  unitPrice?: number;
};

export interface Schedule {
  id: number;
  pdfNumber: string;
  title: string;
  carType: string;
  description?: string;
  startAt: string;
  endAt: string;
  customerName: string;
  storeName?: string;
  staffId: string;
  staffName: string;
  customer: string;
  requester: string;
  showComiPack?: boolean;
  items: ScheduleItem[];
  createdAt: string;
}

function formatDate(value: string, pattern: string) {
  return format(new Date(value), pattern);
}

function yen(value: number) {
  return value.toLocaleString();
}

function SchedulePDFPage({
  schedule,
  type,
  quotedDate,
}: {
  schedule: Schedule;
  type: PdfType;
  quotedDate: string;
}) {
  const subtotal = schedule.items.reduce((sum, item) => sum + (item.unitPrice ?? 0) * item.quantity, 0);
  const tax = Math.floor(subtotal * 0.1);
  const total = subtotal + tax;
  const paddedItems = [...schedule.items];

  while (paddedItems.length < 18) {
    paddedItems.push({ productName: '', quantity: 0, unitPrice: 0 });
  }

  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.topRow}>
        <Text style={styles.slipNo}>伝票番号 {schedule.pdfNumber?.slice(-7) ?? ''}</Text>
        <Text style={styles.title}>{PDF_TYPES[type]}</Text>
        <View style={styles.issueBox}>
          <Text>
            {type === 'estimate'
              ? formatDate(quotedDate || schedule.createdAt, 'yyyy 年  M 月  d 日')
              : `${new Date().getFullYear()} 年     月     日`}
          </Text>
          <Text>登録番号:T8040001012842</Text>
        </View>
      </View>

      <View style={styles.upperArea}>
        <View style={styles.leftInfo}>
          <View style={styles.recipientLine}>
            <Text style={styles.recipientText}>{schedule.customerName}</Text>
            <Text style={styles.shopText}>御中</Text>
          </View>

          <View style={styles.amountArea}>
            <View style={styles.amountBox}>
              <Text style={styles.amountHeader}>御請求金額</Text>
              <Text style={styles.amountValue}>￥{yen(total)}</Text>
            </View>

            <View style={styles.customerBox}>
              <View style={styles.customerHeaderRow}>
                <Text style={styles.customerCellHeader}>担当者</Text>
                <Text style={[styles.customerCellHeader, styles.customerCellHeaderLast]}>責任者</Text>
              </View>
              <View style={styles.customerValueRow}>
                <Text style={styles.customerValue}>{schedule.staffName}</Text>
                <Text style={[styles.customerValue, styles.customerValueLast]}>河野</Text>
              </View>
            </View>
          </View>

          {type === 'estimate' ? (
            <>
              <Text style={styles.noteText}>お世話になっております。</Text>
              <Text style={styles.noteText}>以下お見積もりとなりますので金額等ご確認ください。</Text>
              <Text style={styles.noteText}>ぜひご用命いただけますと幸いです。何卒、よろしくお願い申し上げます。</Text>
            </>
          ) : type === 'delivery' ? (
            <>
              <Text style={styles.noteText}>お世話になっております。</Text>
              <Text style={styles.noteText}>下記商品、納品いたします。ご用命、誠にありがとうございます。</Text>
            </>
          ) : (
            <>
              <Text style={styles.noteText}>いつもお世話になっております。</Text>
              <Text style={styles.noteText}>上記金額ご請求申し上げます。</Text>
              <Text style={styles.noteText}>誠に恐れ入りますが、お振込手数料はご負担いただきますよう、お願いいたします。</Text>
            </>
          )}

          <View style={styles.detailTable}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>車種:</Text>
              <Text style={styles.detailValue}>{schedule.carType}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>お客様名:</Text>
              <Text style={styles.detailValue}>{schedule.customer}　様</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>ご依頼者:</Text>
              <Text style={styles.detailValue}>{schedule.requester}　様</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>備考:</Text>
              <Text style={styles.detailValue}></Text>
            </View>
          </View>
        </View>

        <View style={styles.logoArea}>
          <Image src="/mark.jpg" style={styles.logo} />
        </View>
      </View>

      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <View style={[styles.headerCell, styles.colMaker]}>
            <Text style={styles.headerText}>メーカー</Text>
          </View>
          <View style={[styles.headerCell, styles.colProduct]}>
            <Text style={styles.headerText}>商 品 名</Text>
          </View>
          <View style={[styles.headerCell, styles.colQty]}>
            <Text style={styles.headerText}>数 量</Text>
          </View>
          <View style={[styles.headerCell, styles.colUnit]}>
            <Text style={styles.headerText}>単 価 (税別)</Text>
          </View>
          <View style={[styles.headerCell, styles.colAmount]}>
            <Text style={styles.headerText}>金 額 (税別)</Text>
          </View>
        </View>
        {schedule.showComiPack &&
          Array.from({ length: 2 }).map((_, index) => {
            const rowStyle = index % 2 === 0 ? [styles.row, styles.evenRow] : styles.row;
            return (
              <View key={`comipack-${index}`} style={rowStyle}>
                <View style={[styles.bodyCell, styles.colMaker]}>
                  <Text style={styles.makerText}></Text>
                </View>
                <View style={[styles.bodyCell, styles.colProduct]}>
                  <Text style={styles.productText}>{index === 0 ? '（工賃コミコミパック）' : ''}</Text>
                </View>
                <View style={[styles.bodyCell, styles.colQty]}>
                  <Text style={styles.numberText}></Text>
                </View>
                <View style={[styles.bodyCell, styles.colUnit]}>
                  <Text style={styles.numberText}></Text>
                </View>
                <View style={[styles.bodyCell, styles.colAmount]}>
                  <Text style={styles.numberText}></Text>
                </View>
              </View>
            );
          })}
        {paddedItems.map((item, index) => {
          const amount = (item.unitPrice ?? 0) * item.quantity;
          const rowStyle = index % 2 === 0 ? [styles.row, styles.evenRow] : styles.row;

          return (
            <View key={`${item.productName}-${index}`} style={rowStyle}>
              <View style={[styles.bodyCell, styles.colMaker]}>
                <Text style={styles.makerText}>{item.productName ? item.maker ?? '' : ''}</Text>
              </View>
              <View style={[styles.bodyCell, styles.colProduct]}>
                <Text style={styles.productText}>
                  {item.productName
                    ? `${item.categoryName ? item.categoryName + ' ' : ''}${item.productName}`
                    : ''}
                </Text>
              </View>
              <View style={[styles.bodyCell, styles.colQty]}>
                <Text style={styles.numberText}>{item.quantity ? item.quantity : ''}</Text>
              </View>
              <View style={[styles.bodyCell, styles.colUnit]}>
                <Text style={styles.numberText}>{item.productName ? yen(item.unitPrice ?? 0) : ''}</Text>
              </View>
              <View style={[styles.bodyCell, styles.colAmount]}>
                <Text style={styles.numberText}>{item.productName ? yen(amount) : ''}</Text>
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.totalSection}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>小計(税抜)</Text>
          <Text style={styles.totalValue}>{yen(subtotal)}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>消費税(10%)</Text>
          <Text style={styles.totalValue}>{yen(tax)}</Text>
        </View>
        <View style={[styles.totalRow, styles.totalRowLast]}>
          <Text style={styles.totalLabel}>合計</Text>
          <Text style={styles.totalValue}>{yen(total)}</Text>
        </View>
      </View>
    </Page>
  );
}

function SchedulePDF({
  schedule,
  pageCount,
  quotedDate,
}: {
  schedule: Schedule;
  pageCount: PdfPageCount;
  quotedDate: string;
}) {
  const types: readonly PdfType[] = pageCount === 1 ? ['estimate'] : ALL_PDF_TYPES;
  return (
    <Document>
      {types.map(type => (
        <SchedulePDFPage key={type} schedule={schedule} type={type} quotedDate={quotedDate} />
      ))}
    </Document>
  );
}

let fontRegistered = false;
function ensureFont() {
  if (fontRegistered || typeof window === 'undefined') return;
  Font.register({
    family: 'NotoSansJP',
    src: `${window.location.origin}/fonts/NotoSansJP-Regular.ttf`,
  });
  fontRegistered = true;
}

export default function PDFPreview({
  schedule,
  status = 'draft',
  onSendPdf,
}: {
  schedule: Schedule;
  status?: ScheduleStatus;
  onSendPdf?: () => Promise<void> | void;
}) {
  const [pageCount, setPageCount] = useState<PdfPageCount>(1);
  const [sending, setSending] = useState(false);
  const [quotedDate, setQuotedDate] = useState('');

  useEffect(() => {
    ensureFont();
  }, []);

  const fileName = `${schedule.customerName}_${schedule.pdfNumber}.pdf`;
  const document = useMemo(
    () => <SchedulePDF schedule={schedule} pageCount={pageCount} quotedDate={quotedDate} />,
    [schedule, pageCount, quotedDate],
  );

  const handleSendFax = async () => {
    if (!onSendPdf) return;
    setSending(true);
    await onSendPdf();
    setSending(false);
  };

  const sendLabel = status === 'pending' ? '再送信' : 'eFaxで送信';
  const canSend = status !== 'finished';

  return (
    <div className="mx-auto max-w-6xl p-6" onClick={event => event.stopPropagation()}>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">PDF プレビュー</h1>
        {canSend && (
          <button
            type="button"
            onClick={handleSendFax}
            disabled={sending}
            className="rounded-xl bg-green-600 px-6 py-2 text-white hover:bg-green-700 disabled:opacity-50"
          >
            {sending ? '送信中...' : sendLabel}
          </button>
        )}
      </div>
      <div className="mb-4 grid grid-cols-1 items-center gap-4 sm:grid-cols-2">
        <div className="flex gap-2">
          {[1, 4].map(count => (
            <button
              type="button"
              key={count}
              onClick={() => setPageCount(count as PdfPageCount)}
              className={`rounded-xl border px-4 py-2 text-sm ${pageCount === count ? 'bg-red-600 text-white' : 'hover:bg-gray-50'}`}
            >
              {count}ページ
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <label htmlFor="quotedDate" className="text-sm font-medium text-gray-700">
            見積日変更
          </label>
          <input
            id="quotedDate"
            className="min-w-0 rounded-xl border border-gray-200 bg-white px-2 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-200 disabled:bg-gray-100 disabled:text-gray-500"
            type="date"
            value={quotedDate}
            onChange={e => setQuotedDate(e.target.value)}
          />
        </div>
      </div>
      <BlobProvider document={document}>
        {({ url, loading, error }) => {
          if (loading) {
            return (
              <div className="flex h-[860px] items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-500">
                PDFを生成中...
              </div>
            );
          }

          if (error || !url) {
            return (
              <div className="flex h-[860px] items-center justify-center rounded-xl border border-red-200 bg-red-50 px-6 text-sm text-red-600">
                PDFの表示に失敗しました。
              </div>
            );
          }

          return (
            <>
              <a
                href={url}
                download={fileName}
                className="mb-3 inline-flex rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                {fileName}
              </a>
              <iframe src={`${url}#toolbar=1`} title="PDF preview" className="h-[860px] w-full rounded-xl border border-gray-200" />
            </>
          );
        }}
      </BlobProvider>
    </div>
  );
}
