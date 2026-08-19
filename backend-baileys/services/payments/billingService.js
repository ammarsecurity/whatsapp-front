const BillingPlan = require('../../models/BillingPlan');
const BillingOrder = require('../../models/BillingOrder');
const AccountLicense = require('../../models/AccountLicense');
const PaymentGatewaySettings = require('../../models/PaymentGatewaySettings');
const wayl = require('./wayl');
const fynexpay = require('./fynexpay');

async function listEnabledMethods() {
  const waylSettings = await wayl.getSettings();
  const fynexSettings = await fynexpay.getSettings();
  const methods = [];
  if (wayl.isEnabled(waylSettings)) methods.push({ id: 'wayl', name: 'Wayl', minIqd: wayl.MINIMUM_IQD });
  if (fynexpay.isEnabled(fynexSettings)) {
    methods.push({ id: 'fynexpay', name: 'FynexPay', minIqd: fynexpay.MINIMUM_IQD });
  }
  return methods;
}

async function checkout({ userId, planId, gateway }) {
  const plan = await BillingPlan.findById(planId);
  if (!plan || !plan.isActive) {
    throw Object.assign(new Error('الخطة غير متاحة'), { status: 400 });
  }
  const gw = String(gateway || '').toLowerCase();
  if (gw !== 'wayl' && gw !== 'fynexpay') {
    throw Object.assign(new Error('بوابة الدفع غير صحيحة'), { status: 400 });
  }
  const gatewayName = gw === 'fynexpay' ? 'FynexPay' : 'Wayl';
  const min = gw === 'fynexpay' ? fynexpay.MINIMUM_IQD : wayl.MINIMUM_IQD;
  const amountIqd = Math.max(min, parseInt(plan.priceIqd, 10) || 0);
  const unused = await AccountLicense.findUnusedActive(userId);
  if (unused) {
    throw Object.assign(new Error('لديك اشتراك مدفوع جاهز. أضف الحساب أولاً قبل شراء آخر.'), {
      status: 400,
      code: 'UNUSED_LICENSE',
    });
  }
  const order = await BillingOrder.create({
    userId,
    planId: plan.id,
    gateway: gatewayName,
    amountIqd,
  });
  const created = await (gw === 'fynexpay' ? fynexpay.createPayment(order) : wayl.createPayment(order));
  return { order, ...created };
}

async function fulfillPaidOrder(order) {
  if (!order) return null;
  if (order.paymentStatus === 'Paid') {
    const existing = await AccountLicense.findByOrderId(order.id);
    if (existing) return existing;
  }
  const paid = await BillingOrder.markPaid(order.id);
  const existing = await AccountLicense.findByOrderId(paid.id);
  if (existing) return existing;
  const plan = await BillingPlan.findById(paid.planId);
  return AccountLicense.createFromPaidOrder(paid, plan || { billingCycle: 'monthly' });
}

async function reconcile(orderId, userId) {
  const order = await BillingOrder.findById(orderId);
  if (!order || order.userId !== userId) {
    throw Object.assign(new Error('الطلب غير موجود'), { status: 404 });
  }
  if (order.paymentStatus === 'Paid') {
    const license = await AccountLicense.findByOrderId(order.id);
    return { order, license, paid: true };
  }
  if (order.gateway === 'Wayl') {
    const live = await wayl.getStatus(order.referenceId);
    if (live.paid) {
      const license = await fulfillPaidOrder(order);
      return { order: await BillingOrder.findById(order.id), license, paid: true };
    }
    return { order, license: null, paid: false, status: live.status };
  }
  if (order.gateway === 'FynexPay') {
    const pool = require('../../config/database');
    const [rows] = await pool.execute(
      `SELECT external_id FROM payment_transactions
       WHERE billing_order_id = ? AND gateway = 'FynexPay'
       ORDER BY id DESC LIMIT 1`,
      [order.id],
    );
    const paymentId = rows[0]?.external_id;
    if (paymentId) {
      const live = await fynexpay.getStatus(paymentId);
      if (live.paid) {
        const license = await fulfillPaidOrder(order);
        return { order: await BillingOrder.findById(order.id), license, paid: true };
      }
      return { order, license: null, paid: false, status: live.status };
    }
  }
  const refreshed = await BillingOrder.findById(order.id);
  const license = refreshed.paymentStatus === 'Paid' ? await AccountLicense.findByOrderId(order.id) : null;
  return { order: refreshed, license, paid: refreshed.paymentStatus === 'Paid' };
}

async function eligibility(userId, isAdmin) {
  if (isAdmin) {
    return { canAddAccount: true, needsPayment: false, unusedLicense: null, adminBypass: true };
  }
  await AccountLicense.expireDue();
  const unusedLicense = await AccountLicense.findUnusedActive(userId);
  return {
    canAddAccount: !!unusedLicense,
    needsPayment: !unusedLicense,
    unusedLicense,
    adminBypass: false,
  };
}

async function publicUrls() {
  const waylSettings = await wayl.getSettings();
  const fynexSettings = await fynexpay.getSettings();
  return {
    wayl: {
      suggestedWebhookUrl: wayl.suggestedWebhookUrl(),
      suggestedRedirectUrl: wayl.suggestedRedirectUrl(),
      readyForCheckout: wayl.isEnabled(waylSettings),
    },
    fynexpay: {
      suggestedWebhookUrl: fynexpay.suggestedWebhookUrl(),
      suggestedRedirectUrl: fynexpay.suggestedRedirectUrl(),
      readyForCheckout: fynexpay.isEnabled(fynexSettings),
    },
  };
}

module.exports = {
  listEnabledMethods,
  checkout,
  fulfillPaidOrder,
  reconcile,
  eligibility,
  publicUrls,
  PaymentGatewaySettings,
};
