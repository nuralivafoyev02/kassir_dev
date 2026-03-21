import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

export function generatePDF(transactions, title = "Kassa Hisoboti") {
  const doc = new jsPDF();
  
  doc.setFontSize(18);
  doc.text(title, 14, 22);
  
  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text(`Sana: ${new Date().toLocaleDateString()}`, 14, 30);

  const tableData = transactions.map(t => [
    new Date(t.date).toLocaleDateString(),
    t.category,
    t.type === 'income' ? 'Kirim' : 'Chiqim',
    Number(t.amount).toLocaleString() + " so'm",
    t.comment || ''
  ]);

  doc.autoTable({
    startY: 35,
    head: [['Sana', 'Kategoriya', 'Turi', 'Summa', 'Izoh']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [168, 85, 247] },
    alternateRowStyles: { fillColor: [245, 245, 245] }
  });

  doc.save(`Kassa_Hisobot_${new Date().getTime()}.pdf`);
}
