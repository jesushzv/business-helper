/**
 * Facturapi SAT CFDI 4.0 PAC Integration Engine — CommonJS JS
 */

function validateCFDIMetadata(metadata) {
  const errors = [];

  if (!metadata || typeof metadata !== 'object') {
    return { isValid: false, errors: ['Metadata es requerida'] };
  }

  const rfcRegex = /^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$/i;
  if (!metadata.issuerRfc || !rfcRegex.test(String(metadata.issuerRfc).trim())) {
    errors.push('RFC del emisor es inválido (debe tener 12 o 13 caracteres)');
  }
  if (!metadata.receiverRfc || !rfcRegex.test(String(metadata.receiverRfc).trim())) {
    errors.push('RFC del receptor es inválido');
  }

  if (metadata.issuerPostalCode && !/^\d{5}$/.test(String(metadata.issuerPostalCode).trim())) {
    errors.push('Código postal del emisor debe tener 5 dígitos');
  }
  if (metadata.receiverPostalCode && !/^\d{5}$/.test(String(metadata.receiverPostalCode).trim())) {
    errors.push('Código postal del receptor debe tener 5 dígitos');
  }

  if (!Array.isArray(metadata.lineItems) || metadata.lineItems.length === 0) {
    errors.push('Debe incluir al menos un concepto en la factura');
  } else {
    metadata.lineItems.forEach((item, index) => {
      const price = item.unitPrice ?? 0;
      if (price <= 0) {
        errors.push(`El concepto #${index + 1} debe tener un precio mayor a $0`);
      }
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

function buildCFDIPayload(org, client, items, options) {
  const method = (options && options.paymentMethod) || 'PUE';
  const form = method === 'PPD' ? '99' : ((options && options.paymentForm) || '03');

  return {
    customer: {
      legal_name: client.name,
      tax_id: client.rfc || 'XAXX010101000',
      tax_system: client.regimen_fiscal || '601',
      zip: client.codigo_postal || '64000'
    },
    use: client.cfdi_use || 'G03',
    payment_form: form,
    payment_method: method,
    currency: 'MXN',
    items: (items || []).map((item) => {
      const price = item.unit_price ?? item.amount ?? 0;
      const productKey = item.sat_product_code || item.satProductCode || '84111506';
      const unitKey = item.unit || 'E48';
      return {
        quantity: item.quantity || 1,
        product_key: productKey,
        unit_key: unitKey,
        description: item.description || 'Servicio Profesional',
        price: price,
        taxes: [
          {
            type: 'IVA',
            rate: 0.16
          }
        ]
      };
    })
  };
}

function buildComplementoPagoPayload(input) {
  return {
    type: 'P',
    payments: [
      {
        payment_form: (input && input.paymentForm) || '03',
        currency: 'MXN',
        amount: (input && input.amount) || 0,
        date: (input && input.date) || new Date().toISOString(),
        operation_number: (input && input.operationNumber) || `SPEI-${Date.now()}`,
        related_documents: [
          {
            invoice_id: (input && input.invoiceId) || '',
            installment: 1,
            currency: 'MXN'
          }
        ]
      }
    ]
  };
}

function simulateInvoiceStamping(milestoneId) {
  const cfdiId = `cfdi_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  return {
    cfdiId,
    xmlUrl: `https://storage.businesshelper.mx/cfdi/${cfdiId}.xml`,
    pdfUrl: `https://storage.businesshelper.mx/cfdi/${cfdiId}.pdf`,
    status: 'issued',
    issuedAt: new Date().toISOString()
  };
}

module.exports = {
  validateCFDIMetadata,
  buildCFDIPayload,
  buildComplementoPagoPayload,
  simulateInvoiceStamping
};
