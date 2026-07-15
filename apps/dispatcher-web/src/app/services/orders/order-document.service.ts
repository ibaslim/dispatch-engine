import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { OrderEntity } from '@models/orders/order-entity.model';
import { toNumber } from '@pages/orders/orders-mapping.util';
import { escapeHtml, formatPaymentMethod, formatStatusLabel, maskCard, money } from '@pages/orders/orders-formatting.util';

/**
 * PDF/print/label document generation for orders — extracted from OrdersComponent.
 * Pure DOM/canvas rendering logic with no component state; callers pass in the
 * order (and, for label rendering/download, the DOM element ids `#qrcode`,
 * `#barcode`, `#label-preview` are expected to already be present in the caller's
 * template, matching the previous inline modal markup).
 */
@Injectable({ providedIn: 'root' })
export class OrderDocumentService {

  generatePrintHTML(order: OrderEntity): string {
    const paymentMethod = formatPaymentMethod(order.full.details.payment.method);
    const creditCard = order.full.details.payment.creditCard;

    return `<!DOCTYPE html><html><head>
      <title>Order #${escapeHtml(order.full.orderNumber ?? '')}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h2 { text-align: center; margin-bottom: 30px; }
        .section { margin-bottom: 20px; border-bottom: 1px solid #ccc; padding-bottom: 15px; }
        .section h3 { font-weight: bold; margin-bottom: 10px; }
        .row { display: flex; justify-content: space-between; margin: 5px 0; }
        .total { font-weight: bold; font-size: 16px; margin-top: 20px; }
        @media print { body { margin: 0; } }
      </style>
    </head><body>
      <h2>Order #${escapeHtml(order.full.orderNumber ?? '')}</h2>
      <div class="section">
        <h3>Pickup Information</h3>
        <p><strong>${escapeHtml(order.full.pickup.name)}</strong></p>
        <p>${escapeHtml(order.full.pickup.phone.countryCode)} ${escapeHtml(order.full.pickup.phone.number)}</p>
        <p>${escapeHtml(order.full.pickup.email)}</p>
        <p>${escapeHtml(order.full.pickup.address)}</p>
        <p>Time: ${escapeHtml(order.full.pickup.pickupDate)} ${escapeHtml(order.full.pickup.pickupTime)}</p>
      </div>
      <div class="section">
        <h3>Delivery Information</h3>
        <p><strong>${escapeHtml(order.full.delivery.name)}</strong></p>
        <p>${escapeHtml(order.full.delivery.phone.countryCode)} ${escapeHtml(order.full.delivery.phone.number)}</p>
        <p>${escapeHtml(order.full.delivery.email)}</p>
        <p>${escapeHtml(order.full.delivery.address)}</p>
        <p>${escapeHtml(order.full.delivery.deliveryDate)} ${escapeHtml(order.full.delivery.deliveryTime)}</p>
      </div>
      <div class="section">
        <h3>Items</h3>
        ${order.full.details.items.map((item) => `
          <div class="row">
            <span>${escapeHtml(item.itemName)} x ${escapeHtml(item.itemQty)}</span>
            <span>${escapeHtml(money(toNumber(item.itemPrice)))}</span>
          </div>`).join('')}
      </div>
      <div class="section">
        <div class="row"><span>Subtotal</span><span>${escapeHtml(money(order.full.details.subtotal))}</span></div>
        <div class="row"><span>Tax (${escapeHtml(String(order.full.details.taxRate))}%)</span><span>${escapeHtml(money(order.full.details.taxAmount))}</span></div>
        <div class="row"><span>Delivery Fees</span><span>${escapeHtml(money(order.full.details.deliveryFees))}</span></div>
        <div class="row"><span>Tips</span><span>${escapeHtml(money(order.full.details.deliveryTips))}</span></div>
        <div class="row"><span>Discount</span><span>${escapeHtml(money(order.full.details.discount))}</span></div>
        <div class="row"><span>Status</span><span>${escapeHtml(formatStatusLabel(order.tab))}</span></div>
        <div class="row"><span>Payment</span><span>${escapeHtml(paymentMethod)}</span></div>
        ${creditCard ? `<div class="row"><span>Card</span><span>${escapeHtml(maskCard(creditCard.cardNumber))}</span></div>` : ''}
      </div>
      <div class="total">
        <div class="row"><span>Total</span><span>${escapeHtml(money(order.full.details.total))}</span></div>
      </div>
    </body></html>`;
  }

  labelCSS(): string {
    return `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: Arial, sans-serif; background: #fff; display: flex; justify-content: center; padding: 16px; }
      .label-wrapper { width: 384px; border: 2px solid #000; font-size: 11px; background: #fff; color: #000; }
      .top { display: flex; border-bottom: 2px solid #000; padding: 8px; gap: 8px; align-items: flex-start; }
      .big-letter { font-size: 52px; font-weight: 900; line-height: 1; width: 56px; text-align: center; flex-shrink: 0; }
      .postage { flex: 1; font-size: 9px; line-height: 1.6; }
      .postage-title { font-weight: bold; font-size: 10px; }
      .postage-sub { margin-top: 4px; font-size: 8px; color: #777; }
      .qr-side { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
      .rotate { font-size: 8px; writing-mode: vertical-rl; transform: rotate(180deg); letter-spacing: 2px; color: #666; }
      canvas { width: 70px !important; height: 70px !important; display: block; }
      .banner { text-align: center; font-size: 15px; font-weight: 900; padding: 5px 8px; border-bottom: 2px solid #000; letter-spacing: 2px; }
      .sender { display: flex; justify-content: space-between; align-items: flex-start; padding: 8px; border-bottom: 2px solid #000; gap: 12px; }
      .sender-info { font-size: 9px; line-height: 1.6; }
      .from-label { font-weight: bold; font-size: 8px; text-transform: uppercase; color: #666; margin-bottom: 2px; }
      .order-ref { font-size: 9px; color: #555; white-space: nowrap; flex-shrink: 0; }
      .recipient { padding: 10px 8px 12px; border-bottom: 2px solid #000; }
      .recipient-name { font-weight: bold; font-size: 14px; margin-bottom: 2px; }
      .recipient-addr { font-size: 11px; line-height: 1.6; }
      .barcode-section { padding: 8px; text-align: center; }
      .tracking-title { font-weight: 900; font-size: 13px; letter-spacing: 2px; margin-bottom: 6px; }
      svg { width: 100%; height: 60px; display: block; }
      .tracking-num { font-size: 10px; letter-spacing: 3px; margin-top: 4px; }
      @media print { @page { margin: 0; size: 4in auto; } body { padding: 0; } }
    `;
  }

  async renderLabelGraphics(orderNumber: string): Promise<void> {
    await new Promise(resolve => requestAnimationFrame(resolve));

    const canvas = document.getElementById('qrcode') as HTMLCanvasElement | null;
    if (canvas) {
      await QRCode.toCanvas(canvas, orderNumber, { width: 70, margin: 1 });
    }

    const barcodeElement = document.getElementById('barcode');
    if (barcodeElement) {
      JsBarcode('#barcode', orderNumber, {
        format: 'CODE128',
        displayValue: false,
        margin: 0,
        width: 2,
        height: 60
      });
    }
  }

  /** Renders `#label-preview` to a PDF and triggers a download. Throws if the element is missing or rendering fails. */
  async downloadLabelPdf(orderNumber: string): Promise<void> {
    const el = document.getElementById('label-preview');
    if (!el) return;

    const canvas = await html2canvas(el, {
      scale: 3,
      backgroundColor: '#ffffff',
      useCORS: true,
      allowTaint: true
    });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [101.6, 152.4] });
    const imgHeight = (canvas.height * 101.6) / canvas.width;
    pdf.addImage(imgData, 'PNG', 0, 0, 101.6, imgHeight);
    pdf.save(`label-${orderNumber}.pdf`);
  }

  async downloadOrderPdf(order: OrderEntity): Promise<void> {
    const element = document.createElement('div');
    element.innerHTML = this.generatePrintHTML(order);
    element.style.cssText = 'position:absolute;left:-9999px;width:210mm;height:auto;padding:0;margin:0;';
    document.body.appendChild(element);

    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const canvas = await html2canvas(element, { scale: 2, useCORS: true, allowTaint: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      const imgWidth = 210;
      const pageHeight = 297;
      let imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      while (heightLeft >= pageHeight) {
        position = heightLeft - pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, -position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      pdf.save(`order-${order.full.orderNumber ?? ''}.pdf`);
    } finally {
      document.body.removeChild(element);
    }
  }

  /** Opens a print window for the order. Returns false if the popup was blocked. */
  openPrintWindow(order: OrderEntity): boolean {
    const printContent = this.generatePrintHTML(order);
    const printWindow = window.open('', '', 'height=600,width=800');
    if (!printWindow) {
      return false;
    }
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    return true;
  }

  /** Opens a print window rendering just the shipping label. Returns false if the popup was blocked. */
  printLabel(order: OrderEntity): boolean {
    const orderNumber = order.full.orderNumber ?? '';

    const win = window.open('', '', 'height=750,width=520');
    if (!win) {
      return false;
    }

    win.document.write(`<!DOCTYPE html>
<html><head>
<title>Label - ${escapeHtml(orderNumber)}</title>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js"><\/script>
<style>${this.labelCSS()}</style>
</head><body>
<div class="label-wrapper">
  <div class="top">
    <div class="big-letter">D</div>
    <div class="postage">
      <div class="postage-title">DISPATCH DELIVERY</div>
      <div>Order: ${escapeHtml(orderNumber)}</div>
      <div>Placed: ${escapeHtml(order.view.current.orderPlacedTime || '')}</div>
      <div>Est. Delivery: ${escapeHtml(order.view.current.estDeliveryTime || '')}</div>
      <div class="postage-sub">CommercialBasePrice</div>
    </div>
    <div class="qr-side">
      <span class="rotate">dispatch.local</span>
      <canvas id="qrcode"></canvas>
    </div>
  </div>
  <div class="banner">DISPATCH FIRST-CLASS PKG</div>
  <div class="sender">
    <div class="sender-info">
      <div class="from-label">From</div>
      <div>${escapeHtml(order.full.pickup.name)}</div>
      <div>${escapeHtml(order.full.pickup.address)}</div>
    </div>
    <div class="order-ref">Order: ${escapeHtml(orderNumber)}</div>
  </div>
  <div class="recipient">
    <div class="recipient-name">${escapeHtml(order.full.delivery.name)}</div>
    <div class="recipient-addr">${escapeHtml(order.full.delivery.address)}</div>
  </div>
  <div class="barcode-section">
    <div class="tracking-title">TRACKING #</div>
    <svg id="barcode"></svg>
    <div class="tracking-num">${escapeHtml(orderNumber)}</div>
  </div>
</div>
<script>
  QRCode.toCanvas(document.getElementById('qrcode'), ${JSON.stringify(orderNumber)}, { width: 70, margin: 1 }, function(e){ if(e) console.error(e); });
  JsBarcode('#barcode', ${JSON.stringify(orderNumber)}, { format: 'CODE128', displayValue: false, margin: 0, width: 2, height: 60 });
  window.onload = function() { setTimeout(function() { window.print(); }, 700); };
<\/script>
</body></html>`);
    win.document.close();
    return true;
  }
}
